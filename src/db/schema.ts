import { relations } from 'drizzle-orm';
import { boolean, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

// 1. Users Table
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
  displayName: text('display_name'),
  username: text('username'), // For alternative login and identity
  bio: text('bio'),
  photoURL: text('photo_url'),
  status: text('status').default('offline'), // 'online' | 'offline' | 'away'
  isAdmin: boolean('is_admin').default(false),
  isBanned: boolean('is_banned').default(false),
  passwordHash: text('password_hash'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 2. Chats Table (Conversations)
export const chats = pgTable('chats', {
  id: serial('id').primaryKey(),
  name: text('name'), // Null for private chats, set for group chats
  isGroup: boolean('is_group').default(false).notNull(),
  groupPhotoURL: text('group_photo_url'), // For group profiles
  description: text('description'), // Group description
  inviteCode: text('invite_code'), // Group invite code/link
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 3. Chat Participants Table (Mapping Users to Chats)
export const chatParticipants = pgTable('chat_participants', {
  id: serial('id').primaryKey(),
  chatId: integer('chat_id')
    .references(() => chats.id, { onDelete: 'cascade' })
    .notNull(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  role: text('role').default('member'), // 'member' | 'admin'
  joinedAt: timestamp('joined_at').defaultNow(),
});

// 4. Messages Table
export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  chatId: integer('chat_id')
    .references(() => chats.id, { onDelete: 'cascade' })
    .notNull(),
  senderId: integer('sender_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  content: text('content').notNull(),
  attachmentUrl: text('attachment_url'),
  attachmentType: text('attachment_type'), // 'image' | 'file' | 'video' | 'audio'
  isEdited: boolean('is_edited').default(false).notNull(),
  replyToId: integer('reply_to_id'), // Self-reference ID for replies
  isDeleted: boolean('is_deleted').default(false).notNull(),
  deletedForUsers: text('deleted_for_users').default('[]'), // stringified JSON array of user IDs
  reactions: text('reactions').default('[]'), // stringified JSON reactions: [{ emoji: string, senderId: number, senderName: string }]
  createdAt: timestamp('created_at').defaultNow(),
});

// 5. Message Receipts Table (Read / Delivery tracking)
export const messageReceipts = pgTable('message_receipts', {
  id: serial('id').primaryKey(),
  messageId: integer('message_id')
    .references(() => messages.id, { onDelete: 'cascade' })
    .notNull(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  status: text('status').default('delivered'), // 'delivered' | 'read'
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 6. Reports Table
export const reports = pgTable('reports', {
  id: serial('id').primaryKey(),
  reporterId: integer('reporter_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  reportedUserId: integer('reported_user_id')
    .references(() => users.id, { onDelete: 'cascade' }),
  messageId: integer('message_id')
    .references(() => messages.id, { onDelete: 'cascade' }),
  reason: text('reason').notNull(),
  status: text('status').default('pending'), // 'pending' | 'resolved'
  createdAt: timestamp('created_at').defaultNow(),
});

// 7. System Announcements Table
export const systemAnnouncements = pgTable('system_announcements', {
  id: serial('id').primaryKey(),
  content: text('content').notNull(),
  type: text('type').default('broadcast'), // 'banner' | 'broadcast'
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// 8. Workers Table (Managed by Admins)
export const workers = pgTable('workers', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  role: text('role').notNull(), // 'support' | 'moderator' | 'operator' | 'admin_assistant'
  phone: text('phone'),
  department: text('department'),
  status: text('status').default('active').notNull(), // 'active' | 'inactive'
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// --- Relations ---

export const usersRelations = relations(users, ({ many }) => ({
  participants: many(chatParticipants),
  messages: many(messages),
  receipts: many(messageReceipts),
  reportsFiled: many(reports, { relationName: 'reporter' }),
  reportsAgainst: many(reports, { relationName: 'reportedUser' }),
}));

export const chatsRelations = relations(chats, ({ many }) => ({
  participants: many(chatParticipants),
  messages: many(messages),
}));

export const chatParticipantsRelations = relations(chatParticipants, ({ one }) => ({
  chat: one(chats, {
    fields: [chatParticipants.chatId],
    references: [chats.id],
  }),
  user: one(users, {
    fields: [chatParticipants.userId],
    references: [users.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  chat: one(chats, {
    fields: [messages.chatId],
    references: [chats.id],
  }),
  sender: one(users, {
    fields: [messages.senderId],
    references: [users.id],
  }),
  receipts: many(messageReceipts),
  replyToMessage: one(messages, {
    fields: [messages.replyToId],
    references: [messages.id],
    relationName: 'replies',
  }),
}));

export const messageReceiptsRelations = relations(messageReceipts, ({ one }) => ({
  message: one(messages, {
    fields: [messageReceipts.messageId],
    references: [messages.id],
  }),
  user: one(users, {
    fields: [messageReceipts.userId],
    references: [users.id],
  }),
}));

export const reportsRelations = relations(reports, ({ one }) => ({
  reporter: one(users, {
    fields: [reports.reporterId],
    references: [users.id],
    relationName: 'reporter',
  }),
  reportedUser: one(users, {
    fields: [reports.reportedUserId],
    references: [users.id],
    relationName: 'reportedUser',
  }),
  message: one(messages, {
    fields: [reports.messageId],
    references: [messages.id],
  }),
}));
