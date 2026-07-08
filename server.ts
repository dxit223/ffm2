import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { db } from './src/db/index.ts';
import { chats, chatParticipants, messages, messageReceipts, users, reports, systemAnnouncements, workers } from './src/db/schema.ts';
import { requireAuth, AuthRequest } from './src/middleware/auth.ts';
import { eq, and, ne, desc, asc, inArray, sql } from 'drizzle-orm';

const app = express();
const httpServer = createServer(app);
const PORT = 3000;

// Set up Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// JSON and URL-encoded body parsers
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads')));

// Shared Gemini Client
let ai: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  try {
    ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  } catch (err) {
    console.error('Failed to initialize Gemini Client:', err);
  }
}

// --- API ROUTES ---

const JWT_SECRET = process.env.JWT_SECRET || 'fly_messenger_jwt_secret_key_123';

// Alternative Login - Register with Username & Password
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, displayName, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    const cleanedUsername = username.toLowerCase().trim();
    if (!/^[a-zA-Z0-9_]{3,15}$/.test(cleanedUsername)) {
      return res.status(400).json({ error: 'Username must be 3-15 characters (letters, numbers, underscores only)' });
    }

    // Check if email or username already exists
    const existingUser = await db.query.users.findFirst({
      where: (u, { or, eq }) => or(eq(u.email, email), eq(u.username, cleanedUsername)),
    });

    if (existingUser) {
      if (existingUser.username === cleanedUsername) {
        return res.status(400).json({ error: 'Username is already taken' });
      }
      return res.status(400).json({ error: 'Email is already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    // Generate a unique local UID (which is required by the unique constraint on uid)
    const localUid = `local_${cleanedUsername}_${Math.random().toString(36).substring(2, 9)}`;

    // Determine if this is the first user
    const usersCount = await db.select({ count: sql`count(*)` }).from(users);
    const isFirstUser = parseInt(usersCount[0]?.count as string || '0') === 0;

    // Create user
    const result = await db.insert(users)
      .values({
        uid: localUid,
        email,
        username: cleanedUsername,
        displayName: displayName || username,
        passwordHash,
        status: 'online',
        isAdmin: isFirstUser, // First user is automatically Admin
      })
      .returning();

    const newUser = result[0];

    // Issue JWT token
    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, uid: newUser.uid },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: newUser,
    });
  } catch (error: any) {
    console.error('Registration failed:', error);
    res.status(500).json({ error: 'Registration failed', details: error.message });
  }
});

// Alternative Login - Authenticate with Username & Password
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const cleanedUsername = username.toLowerCase().trim();

    // Query user by username or email
    const userRecord = await db.query.users.findFirst({
      where: (u, { or, eq }) => or(eq(u.username, cleanedUsername), eq(u.email, username)),
    });

    if (!userRecord || !userRecord.passwordHash) {
      return res.status(401).json({ error: 'Invalid username/email or password' });
    }

    // Compare hash
    const isPasswordValid = await bcrypt.compare(password, userRecord.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid username/email or password' });
    }

    if (userRecord.isBanned) {
      return res.status(403).json({ error: 'Your account has been banned or suspended by administration.' });
    }

    // Update status to online
    await db.update(users).set({ status: 'online' }).where(eq(users.id, userRecord.id));

    // Issue JWT token
    const token = jwt.sign(
      { id: userRecord.id, email: userRecord.email, uid: userRecord.uid },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: userRecord,
    });
  } catch (error: any) {
    console.error('Login failed:', error);
    res.status(500).json({ error: 'Login failed', details: error.message });
  }
});

// 1. Get current logged-in user profile
app.get('/api/users/me', requireAuth, (req: AuthRequest, res) => {
  res.json(req.dbUser);
});

// 2. Get all registered users (for initiating direct chats)
app.get('/api/users', requireAuth, async (req: AuthRequest, res) => {
  try {
    const currentDbUser = req.dbUser;
    if (!currentDbUser) {
      return res.status(401).json({ error: 'User profile not synchronized' });
    }

    // Get all users except current user
    const allUsers = await db.select()
      .from(users)
      .where(ne(users.id, currentDbUser.id))
      .orderBy(asc(users.displayName));

    res.json(allUsers);
  } catch (error: any) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users', details: error.message });
  }
});

// 3. Update user profile
app.put('/api/users/profile', requireAuth, async (req: AuthRequest, res) => {
  try {
    const currentDbUser = req.dbUser;
    if (!currentDbUser) {
      return res.status(401).json({ error: 'User profile not synchronized' });
    }

    const { displayName, photoURL, status, username, bio } = req.body;

    let targetUsername = currentDbUser.username;
    if (username !== undefined) {
      const cleaned = username.toLowerCase().trim();
      if (cleaned) {
        if (!/^[a-zA-Z0-9_]{3,15}$/.test(cleaned)) {
          return res.status(400).json({ error: 'Username must be 3-15 characters and contain only letters, numbers, and underscores.' });
        }
        // Check uniqueness
        const found = await db.select().from(users).where(eq(users.username, cleaned)).limit(1);
        if (found.length > 0 && found[0].id !== currentDbUser.id) {
          return res.status(400).json({ error: 'Username is already taken.' });
        }
        targetUsername = cleaned;
      } else {
        targetUsername = null;
      }
    }

    const updated = await db.update(users)
      .set({
        displayName: displayName !== undefined ? displayName : currentDbUser.displayName,
        photoURL: photoURL !== undefined ? photoURL : currentDbUser.photoURL,
        status: status !== undefined ? status : currentDbUser.status,
        username: targetUsername,
        bio: bio !== undefined ? bio : currentDbUser.bio,
        updatedAt: new Date(),
      })
      .where(eq(users.id, currentDbUser.id))
      .returning();

    // Broadcast user status/profile update to all connected sockets
    io.emit('user-updated', updated[0]);

    res.json(updated[0]);
  } catch (error: any) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile', details: error.message });
  }
});

// 4. Get all chats for the current user (includes latest message & unread count)
app.get('/api/chats', requireAuth, async (req: AuthRequest, res) => {
  try {
    const currentDbUser = req.dbUser;
    if (!currentDbUser) {
      return res.status(401).json({ error: 'User profile not synchronized' });
    }

    // A. Find all chat IDs the user is participating in
    const participations = await db.select()
      .from(chatParticipants)
      .where(eq(chatParticipants.userId, currentDbUser.id));

    if (participations.length === 0) {
      return res.json([]);
    }

    const chatIds = participations.map(p => p.chatId);

    // B. Fetch detailed chats info
    const chatList = await db.select()
      .from(chats)
      .where(inArray(chats.id, chatIds))
      .orderBy(desc(chats.updatedAt));

    const enrichedChats = [];

    for (const chat of chatList) {
      // Get all participants of this chat
      const participantsList = await db.select({
        participant: chatParticipants,
        user: users,
      })
        .from(chatParticipants)
        .innerJoin(users, eq(chatParticipants.userId, users.id))
        .where(eq(chatParticipants.chatId, chat.id));

      // Get latest message for this chat
      const latestMsg = await db.select()
        .from(messages)
        .where(eq(messages.chatId, chat.id))
        .orderBy(desc(messages.createdAt))
        .limit(1);

      // Get unread count for current user
      let unreadCount = 0;
      if (latestMsg.length > 0) {
        const readReceipts = await db.select()
          .from(messageReceipts)
          .innerJoin(messages, eq(messageReceipts.messageId, messages.id))
          .where(
            and(
              eq(messages.chatId, chat.id),
              eq(messageReceipts.userId, currentDbUser.id),
              eq(messageReceipts.status, 'delivered')
            )
          );
        unreadCount = readReceipts.length;
      }

      enrichedChats.push({
        ...chat,
        participants: participantsList.map(p => ({
          ...p.participant,
          user: p.user,
        })),
        lastMessage: latestMsg[0] || null,
        unreadCount,
      });
    }

    res.json(enrichedChats);
  } catch (error: any) {
    console.error('Error fetching chats:', error);
    res.status(500).json({ error: 'Failed to fetch chats', details: error.message });
  }
});

// 5. Create a new chat (Private or Group)
app.post('/api/chats', requireAuth, async (req: AuthRequest, res) => {
  try {
    const currentDbUser = req.dbUser;
    if (!currentDbUser) {
      return res.status(401).json({ error: 'User profile not synchronized' });
    }

    const { isGroup, name, recipientId, participantIds } = req.body;

    if (!isGroup) {
      // Direct Private Chat
      if (!recipientId) {
        return res.status(400).json({ error: 'recipientId is required for private chats' });
      }

      // Check if private chat already exists between these 2 users
      // Find a chat where both are participants and isGroup is false
      const queryResult = await db.execute(sql`
        SELECT c.id FROM chats c
        INNER JOIN chat_participants cp1 ON c.id = cp1.chat_id AND cp1.user_id = ${currentDbUser.id}
        INNER JOIN chat_participants cp2 ON c.id = cp2.chat_id AND cp2.user_id = ${recipientId}
        WHERE c.is_group = false
        LIMIT 1
      `);

      if (queryResult.rows.length > 0) {
        const existingChatId = queryResult.rows[0].id as number;

        // Fetch and return the existing chat
        const existingChat = await db.select().from(chats).where(eq(chats.id, existingChatId)).limit(1);
        const pList = await db.select({
          participant: chatParticipants,
          user: users,
        })
          .from(chatParticipants)
          .innerJoin(users, eq(chatParticipants.userId, users.id))
          .where(eq(chatParticipants.chatId, existingChatId));

        return res.json({
          ...existingChat[0],
          participants: pList.map(p => ({ ...p.participant, user: p.user })),
          lastMessage: null,
          unreadCount: 0,
        });
      }

      // Create new private chat
      const newChat = await db.insert(chats)
        .values({
          isGroup: false,
          name: null,
        })
        .returning();

      const chatId = newChat[0].id;

      // Add current user and recipient as participants
      await db.insert(chatParticipants).values([
        { chatId, userId: currentDbUser.id, role: 'member' },
        { chatId, userId: recipientId, role: 'member' },
      ]);

      const pList = await db.select({
        participant: chatParticipants,
        user: users,
      })
        .from(chatParticipants)
        .innerJoin(users, eq(chatParticipants.userId, users.id))
        .where(eq(chatParticipants.chatId, chatId));

      const responsePayload = {
        ...newChat[0],
        participants: pList.map(p => ({ ...p.participant, user: p.user })),
        lastMessage: null,
        unreadCount: 0,
      };

      // Notify recipient via sockets if they are online
      io.emit('chat-created', responsePayload);

      return res.json(responsePayload);
    } else {
      // Group Chat
      if (!name) {
        return res.status(400).json({ error: 'Group name is required' });
      }

      const { description, groupPhotoURL } = req.body;
      const inviteCode = `fly_${Math.random().toString(36).substring(2, 11)}`;
      const newGroupChat = await db.insert(chats)
        .values({
          isGroup: true,
          name,
          description: description || null,
          groupPhotoURL: groupPhotoURL || null,
          inviteCode,
        })
        .returning();

      const chatId = newGroupChat[0].id;

      // Prepare participants
      const participantsToInsert = [
        { chatId, userId: currentDbUser.id, role: 'admin' },
      ];

      if (Array.isArray(participantIds)) {
        participantIds.forEach((uid: number) => {
          if (uid !== currentDbUser.id) {
            participantsToInsert.push({ chatId, userId: uid, role: 'member' });
          }
        });
      }

      await db.insert(chatParticipants).values(participantsToInsert);

      const pList = await db.select({
        participant: chatParticipants,
        user: users,
      })
        .from(chatParticipants)
        .innerJoin(users, eq(chatParticipants.userId, users.id))
        .where(eq(chatParticipants.chatId, chatId));

      const responsePayload = {
        ...newGroupChat[0],
        participants: pList.map(p => ({ ...p.participant, user: p.user })),
        lastMessage: null,
        unreadCount: 0,
      };

      io.emit('chat-created', responsePayload);

      return res.json(responsePayload);
    }
  } catch (error: any) {
    console.error('Error creating chat:', error);
    res.status(500).json({ error: 'Failed to create chat', details: error.message });
  }
});

// 6. Get messages for a specific chat
app.get('/api/chats/:chatId/messages', requireAuth, async (req: AuthRequest, res) => {
  try {
    const currentDbUser = req.dbUser;
    if (!currentDbUser) {
      return res.status(401).json({ error: 'User profile not synchronized' });
    }

    const chatId = parseInt(req.params.chatId);

    // Verify user is a participant of this chat
    const isParticipant = await db.select()
      .from(chatParticipants)
      .where(
        and(
          eq(chatParticipants.chatId, chatId),
          eq(chatParticipants.userId, currentDbUser.id)
        )
      )
      .limit(1);

    if (isParticipant.length === 0) {
      return res.status(403).json({ error: 'Access denied: Not a participant of this chat' });
    }

    // Fetch messages
    const messageList = await db.select({
      message: messages,
      sender: users,
    })
      .from(messages)
      .innerJoin(users, eq(messages.senderId, users.id))
      .where(eq(messages.chatId, chatId))
      .orderBy(asc(messages.createdAt));

    const enrichedMessages = [];
    for (const m of messageList) {
      // Check if message has been deleted for me
      let deletedForArr: number[] = [];
      try {
        deletedForArr = JSON.parse(m.message.deletedForUsers || '[]');
      } catch {
        deletedForArr = [];
      }
      if (deletedForArr.includes(currentDbUser.id)) {
        continue;
      }

      const receipts = await db.select()
        .from(messageReceipts)
        .where(eq(messageReceipts.messageId, m.message.id));

      let replyToMessage = null;
      if (m.message.replyToId) {
        const replyRecord = await db.select({
          message: messages,
          sender: users,
        })
          .from(messages)
          .innerJoin(users, eq(messages.senderId, users.id))
          .where(eq(messages.id, m.message.replyToId))
          .limit(1);
        if (replyRecord.length > 0) {
          replyToMessage = {
            ...replyRecord[0].message,
            sender: replyRecord[0].sender,
          };
        }
      }

      enrichedMessages.push({
        ...m.message,
        sender: m.sender,
        receipts,
        replyToMessage,
      });
    }

    res.json(enrichedMessages);
  } catch (error: any) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages', details: error.message });
  }
});

// 7. Post a new message to a chat
app.post('/api/chats/:chatId/messages', requireAuth, async (req: AuthRequest, res) => {
  try {
    const currentDbUser = req.dbUser;
    if (!currentDbUser) {
      return res.status(401).json({ error: 'User profile not synchronized' });
    }

    const chatId = parseInt(req.params.chatId);
    const { content, attachmentUrl, attachmentType, replyToId } = req.body;

    if (!content && !attachmentUrl) {
      return res.status(400).json({ error: 'Message content or attachment is required' });
    }

    // Verify user is a participant of this chat
    const participantsList = await db.select()
      .from(chatParticipants)
      .where(eq(chatParticipants.chatId, chatId));

    const isUserParticipant = participantsList.find(p => p.userId === currentDbUser.id);
    if (!isUserParticipant) {
      return res.status(403).json({ error: 'Access denied: Not a participant of this chat' });
    }

    // Create the message
    const insertedMsg = await db.insert(messages)
      .values({
        chatId,
        senderId: currentDbUser.id,
        content: content || '',
        attachmentUrl: attachmentUrl || null,
        attachmentType: attachmentType || null,
        replyToId: replyToId ? parseInt(replyToId) : null,
      })
      .returning();

    const messageId = insertedMsg[0].id;

    // Create delivery/read receipts for all OTHER participants in the chat
    const receiptsToInsert = participantsList
      .filter(p => p.userId !== currentDbUser.id)
      .map(p => ({
        messageId,
        userId: p.userId,
        status: 'delivered' as const,
      }));

    if (receiptsToInsert.length > 0) {
      await db.insert(messageReceipts).values(receiptsToInsert);
    }

    // Update the chat's updatedAt timestamp
    await db.update(chats)
      .set({ updatedAt: new Date() })
      .where(eq(chats.id, chatId));

    const receipts = await db.select()
      .from(messageReceipts)
      .where(eq(messageReceipts.messageId, messageId));

    const finalMessage = {
      ...insertedMsg[0],
      sender: currentDbUser,
      receipts,
    };

    // Broadcast message via Socket.IO
    io.to(`chat_${chatId}`).emit('new-message', finalMessage);

    // AI ASSISTANT INTEGRATION ARCHITECTURE
    // Check if there is an AI user (or if the recipient is the AI Assistant)
    // We can simulate an AI assistant user in our DB. If a participant has a name/display name containing "AI Assistant" or "Fly AI", we can trigger a response!
    const otherParticipants = participantsList.filter(p => p.userId !== currentDbUser.id);
    const hasAIParticipant = await db.select()
      .from(users)
      .where(
        and(
          inArray(users.id, otherParticipants.map(op => op.userId)),
          sql`LOWER(${users.displayName}) LIKE '%ai assistant%'`
        )
      );

    if (hasAIParticipant.length > 0 && ai) {
      const aiUser = hasAIParticipant[0];

      // Run asynchronously to not block the user response
      setTimeout(async () => {
        try {
          // Send typing indicator for AI Assistant
          io.to(`chat_${chatId}`).emit('typing', { chatId, userId: aiUser.id, displayName: aiUser.displayName });

          // Gather conversation history for context!
          const history = await db.select({
            content: messages.content,
            senderId: messages.senderId,
          })
            .from(messages)
            .where(eq(messages.chatId, chatId))
            .orderBy(desc(messages.createdAt))
            .limit(10);

          history.reverse();

          // Prepare prompts
          const formattedHistory = history.map(h => {
            const role = h.senderId === aiUser.id ? 'model' : 'user';
            return `${role === 'model' ? 'Assistant' : 'User'}: ${h.content}`;
          }).join('\n');

          const systemInstruction = "You are Fly AI, the smart, helpful, and creative assistant built directly into Fly Messenger V2. Keep your answers conversational, responsive, highly styled, and clear.";
          const prompt = `${systemInstruction}\n\nRecent chat history:\n${formattedHistory}\n\nGenerate your reply as the Assistant. Keep it clean and fitting for a chat bubble.`;

          const response = await ai!.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: prompt,
          });

          const aiReply = response.text || "Sorry, I couldn't understand that.";

          // Save AI's message to Postgres
          const insertedAIMsg = await db.insert(messages)
            .values({
              chatId,
              senderId: aiUser.id,
              content: aiReply,
            })
            .returning();

          const aiMessageId = insertedAIMsg[0].id;

          // Create receipt for the user
          await db.insert(messageReceipts).values({
            messageId: aiMessageId,
            userId: currentDbUser.id,
            status: 'delivered',
          });

          // Stop typing indicator
          io.to(`chat_${chatId}`).emit('stop-typing', { chatId, userId: aiUser.id });

          const aiMessagePayload = {
            ...insertedAIMsg[0],
            sender: aiUser,
            receipts: await db.select().from(messageReceipts).where(eq(messageReceipts.messageId, aiMessageId)),
          };

          // Update chat timestamp
          await db.update(chats)
            .set({ updatedAt: new Date() })
            .where(eq(chats.id, chatId));

          io.to(`chat_${chatId}`).emit('new-message', aiMessagePayload);
        } catch (aiErr) {
          console.error('AI assistant processing failed:', aiErr);
          io.to(`chat_${chatId}`).emit('stop-typing', { chatId, userId: aiUser.id });
        }
      }, 1500);
    }

    res.json(finalMessage);
  } catch (error: any) {
    console.error('Error posting message:', error);
    res.status(500).json({ error: 'Failed to post message', details: error.message });
  }
});

// 8. Upload endpoint (base64 image/file sharing helper)
app.post('/api/upload', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { name, type, data } = req.body;
    if (!name || !type || !data) {
      return res.status(400).json({ error: 'Missing name, type, or base64 data' });
    }

    // Clean up base64 string
    const base64Data = data.replace(/^data:.*;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Create unique filename
    const filename = `${Date.now()}_${name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const filePath = path.join(uploadsDir, filename);

    // Save to disk
    fs.writeFileSync(filePath, buffer);

    const relativeUrl = `/uploads/${filename}`;
    res.json({ url: relativeUrl, filename });
  } catch (error: any) {
    console.error('File upload failed:', error);
    res.status(500).json({ error: 'File upload failed', details: error.message });
  }
});

// 9. Admin Dashboard Stats Endpoint (Secured)
app.get('/api/admin/stats', requireAuth, async (req: AuthRequest, res) => {
  try {
    const currentDbUser = req.dbUser;
    if (!currentDbUser) {
      return res.status(401).json({ error: 'User profile not synchronized' });
    }

    // Verify admin role
    if (!currentDbUser.isAdmin) {
      return res.status(403).json({ error: 'Access denied: Admins only' });
    }

    // Fetch stats
    const totalUsersCount = await db.select({ count: sql`count(*)` }).from(users);
    const totalChatsCount = await db.select({ count: sql`count(*)` }).from(chats);
    const totalMessagesCount = await db.select({ count: sql`count(*)` }).from(messages);
    const onlineUsersCount = await db.select({ count: sql`count(*)` }).from(users).where(eq(users.status, 'online'));

    // Get table sizes
    const activeChatsEnriched = await db.select({
      id: chats.id,
      name: chats.name,
      isGroup: chats.isGroup,
      updatedAt: chats.updatedAt,
    })
      .from(chats)
      .orderBy(desc(chats.updatedAt))
      .limit(10);

    res.json({
      stats: {
        totalUsers: Number(totalUsersCount[0].count),
        totalChats: Number(totalChatsCount[0].count),
        totalMessages: Number(totalMessagesCount[0].count),
        onlineUsers: Number(onlineUsersCount[0].count),
      },
      recentChats: activeChatsEnriched,
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        dbStatus: 'connected',
        geminiStatus: ai ? 'configured' : 'not_configured',
      },
    });
  } catch (error: any) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ error: 'Failed to fetch admin statistics', details: error.message });
  }
});

// 10. Resolve username to email (Public)
app.get('/api/auth/resolve-username/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const found = await db.select().from(users).where(eq(users.username, username.toLowerCase().trim())).limit(1);
    if (found.length === 0) {
      return res.status(404).json({ error: 'Username not found' });
    }
    res.json({ email: found[0].email });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to resolve username' });
  }
});

// 11. Check username availability
app.get('/api/users/check-username/:username', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { username } = req.params;
    const currentDbUser = req.dbUser;
    const cleaned = username.toLowerCase().trim();
    if (!/^[a-zA-Z0-9_]{3,15}$/.test(cleaned)) {
      return res.json({ available: false, error: 'Username must be 3-15 characters and contain only letters, numbers, and underscores.' });
    }
    const found = await db.select().from(users).where(eq(users.username, cleaned)).limit(1);
    if (found.length > 0 && found[0].id !== currentDbUser?.id) {
      return res.json({ available: false, error: 'Username is already taken.' });
    }
    res.json({ available: true });
  } catch (err) {
    res.status(500).json({ error: 'Error checking username' });
  }
});

// 12. Get active announcements (Public/Auth)
app.get('/api/announcements', async (req, res) => {
  try {
    // Dynamically retrieve active announcements
    const list = await db.select()
      .from(systemAnnouncements)
      .where(eq(systemAnnouncements.isActive, true))
      .orderBy(desc(systemAnnouncements.createdAt));
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch announcements' });
  }
});

// 13. File a moderation report
app.post('/api/reports', requireAuth, async (req: AuthRequest, res) => {
  try {
    const currentDbUser = req.dbUser;
    if (!currentDbUser) return res.status(401).json({ error: 'Not authenticated' });

    const { reportedUserId, messageId, reason } = req.body;
    if (!reason) {
      return res.status(400).json({ error: 'Reason is required' });
    }

    const inserted = await db.insert(reports)
      .values({
        reporterId: currentDbUser.id,
        reportedUserId: reportedUserId || null,
        messageId: messageId || null,
        reason,
        status: 'pending',
      })
      .returning();

    res.json(inserted[0]);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to submit report', details: error.message });
  }
});

// 14. Edit Message
app.put('/api/messages/:messageId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const currentDbUser = req.dbUser;
    if (!currentDbUser) return res.status(401).json({ error: 'Unauthorized' });

    const messageId = parseInt(req.params.messageId);
    const { content } = req.body;

    const messageToEdit = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
    if (messageToEdit.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (messageToEdit[0].senderId !== currentDbUser.id) {
      return res.status(403).json({ error: 'Forbidden: You can only edit your own messages' });
    }

    const updated = await db.update(messages)
      .set({
        content,
        isEdited: true,
      })
      .where(eq(messages.id, messageId))
      .returning();

    // Broadcast message update via Socket.IO
    io.to(`chat_${messageToEdit[0].chatId}`).emit('message-updated', {
      ...updated[0],
      sender: currentDbUser,
    });

    res.json(updated[0]);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to edit message', details: error.message });
  }
});

// 15. Delete Message for everyone
app.delete('/api/messages/:messageId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const currentDbUser = req.dbUser;
    if (!currentDbUser) return res.status(401).json({ error: 'Unauthorized' });

    const messageId = parseInt(req.params.messageId);

    const messageToDelete = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
    if (messageToDelete.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (messageToDelete[0].senderId !== currentDbUser.id) {
      return res.status(403).json({ error: 'Forbidden: You can only delete your own messages' });
    }

    const updated = await db.update(messages)
      .set({
        isDeleted: true,
        content: 'This message was deleted.',
        attachmentUrl: null,
        attachmentType: null,
      })
      .where(eq(messages.id, messageId))
      .returning();

    io.to(`chat_${messageToDelete[0].chatId}`).emit('message-updated', {
      ...updated[0],
      sender: currentDbUser,
    });

    res.json(updated[0]);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete message', details: error.message });
  }
});

// 16. Delete message for me only
app.post('/api/messages/:messageId/delete-for-me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const currentDbUser = req.dbUser;
    if (!currentDbUser) return res.status(401).json({ error: 'Unauthorized' });

    const messageId = parseInt(req.params.messageId);

    const messageToHide = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
    if (messageToHide.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    let deletedForUsersArray: number[] = [];
    try {
      deletedForUsersArray = JSON.parse(messageToHide[0].deletedForUsers || '[]');
    } catch {
      deletedForUsersArray = [];
    }

    if (!deletedForUsersArray.includes(currentDbUser.id)) {
      deletedForUsersArray.push(currentDbUser.id);
    }

    const updated = await db.update(messages)
      .set({
        deletedForUsers: JSON.stringify(deletedForUsersArray),
      })
      .where(eq(messages.id, messageId))
      .returning();

    res.json(updated[0]);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to hide message', details: error.message });
  }
});

// 17. Message reaction
app.post('/api/messages/:messageId/reaction', requireAuth, async (req: AuthRequest, res) => {
  try {
    const currentDbUser = req.dbUser;
    if (!currentDbUser) return res.status(401).json({ error: 'Unauthorized' });

    const messageId = parseInt(req.params.messageId);
    const { emoji } = req.body;

    if (!emoji) return res.status(400).json({ error: 'Emoji is required' });

    const msg = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
    if (msg.length === 0) return res.status(404).json({ error: 'Message not found' });

    let reactionList: Array<{ emoji: string, senderId: number, senderName: string }> = [];
    try {
      reactionList = JSON.parse(msg[0].reactions || '[]');
    } catch {
      reactionList = [];
    }

    // Toggle reaction
    const existingIndex = reactionList.findIndex(r => r.emoji === emoji && r.senderId === currentDbUser.id);
    if (existingIndex >= 0) {
      // Remove it
      reactionList.splice(existingIndex, 1);
    } else {
      // Add it
      reactionList.push({
        emoji,
        senderId: currentDbUser.id,
        senderName: currentDbUser.displayName || currentDbUser.email.split('@')[0],
      });
    }

    const updated = await db.update(messages)
      .set({
        reactions: JSON.stringify(reactionList),
      })
      .where(eq(messages.id, messageId))
      .returning();

    const senderObj = await db.select().from(users).where(eq(users.id, updated[0].senderId)).limit(1).then(r => r[0] || null);

    // Broadcast reaction update via Socket.IO
    io.to(`chat_${msg[0].chatId}`).emit('message-updated', {
      ...updated[0],
      sender: senderObj,
    });

    res.json(updated[0]);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to register reaction', details: error.message });
  }
});

// 18. Join Group via Invite Code
app.post('/api/chats/join/:inviteCode', requireAuth, async (req: AuthRequest, res) => {
  try {
    const currentDbUser = req.dbUser;
    if (!currentDbUser) return res.status(401).json({ error: 'Unauthorized' });

    const { inviteCode } = req.params;

    const chatToJoin = await db.select().from(chats).where(eq(chats.inviteCode, inviteCode)).limit(1);
    if (chatToJoin.length === 0) {
      return res.status(404).json({ error: 'Invalid invite code' });
    }

    const chatId = chatToJoin[0].id;

    // Check if already a participant
    const existing = await db.select()
      .from(chatParticipants)
      .where(
        and(
          eq(chatParticipants.chatId, chatId),
          eq(chatParticipants.userId, currentDbUser.id)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return res.json(chatToJoin[0]);
    }

    // Add to participants
    await db.insert(chatParticipants).values({
      chatId,
      userId: currentDbUser.id,
      role: 'member',
    });

    res.json(chatToJoin[0]);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to join group', details: error.message });
  }
});

// 19. Remove / Leave group participant
app.delete('/api/chats/:chatId/participants/:userId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const currentDbUser = req.dbUser;
    if (!currentDbUser) return res.status(401).json({ error: 'Unauthorized' });

    const chatId = parseInt(req.params.chatId);
    const userId = parseInt(req.params.userId);

    // Get current user's role in group
    const myMembership = await db.select()
      .from(chatParticipants)
      .where(
        and(
          eq(chatParticipants.chatId, chatId),
          eq(chatParticipants.userId, currentDbUser.id)
        )
      )
      .limit(1);

    if (myMembership.length === 0) {
      return res.status(403).json({ error: 'Access denied: You are not in this group' });
    }

    // A user can leave by themselves, or an admin can kick anyone
    if (userId !== currentDbUser.id && myMembership[0].role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: Admins only can kick members' });
    }

    await db.delete(chatParticipants)
      .where(
        and(
          eq(chatParticipants.chatId, chatId),
          eq(chatParticipants.userId, userId)
        )
      );

    res.json({ success: true, message: 'Participant removed successfully' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to remove participant', details: error.message });
  }
});

// 20. Admin - List Users
app.get('/api/admin/users', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.dbUser?.isAdmin) return res.status(403).json({ error: 'Admins only' });
    const list = await db.select().from(users).orderBy(desc(users.createdAt));
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users list' });
  }
});

// 21. Admin - Ban/Unban User
app.put('/api/admin/users/:userId/ban', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.dbUser?.isAdmin) return res.status(403).json({ error: 'Admins only' });
    const targetUserId = parseInt(req.params.userId);
    const { isBanned } = req.body;

    const updated = await db.update(users)
      .set({ isBanned: !!isBanned, status: isBanned ? 'offline' : 'offline' })
      .where(eq(users.id, targetUserId))
      .returning();

    res.json(updated[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to ban/unban user' });
  }
});

// 22. Admin - Toggle Admin Role
app.put('/api/admin/users/:userId/admin', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.dbUser?.isAdmin) return res.status(403).json({ error: 'Admins only' });
    const targetUserId = parseInt(req.params.userId);
    const { isAdmin } = req.body;

    const updated = await db.update(users)
      .set({ isAdmin: !!isAdmin })
      .where(eq(users.id, targetUserId))
      .returning();

    res.json(updated[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update admin role' });
  }
});

// 23. Admin - Delete User
app.delete('/api/admin/users/:userId', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.dbUser?.isAdmin) return res.status(403).json({ error: 'Admins only' });
    const targetUserId = parseInt(req.params.userId);

    await db.delete(users).where(eq(users.id, targetUserId));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// 24. Admin - List Reports
app.get('/api/admin/reports', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.dbUser?.isAdmin) return res.status(403).json({ error: 'Admins only' });
    
    const list = await db.select({
      report: reports,
      reporter: users,
    })
      .from(reports)
      .innerJoin(users, eq(reports.reporterId, users.id))
      .orderBy(desc(reports.createdAt));

    const enriched = [];
    for (const item of list) {
      let reportedUserObj = null;
      if (item.report.reportedUserId) {
        reportedUserObj = await db.select().from(users).where(eq(users.id, item.report.reportedUserId)).limit(1).then(r => r[0] || null);
      }

      let messageObj = null;
      if (item.report.messageId) {
        messageObj = await db.select().from(messages).where(eq(messages.id, item.report.messageId)).limit(1).then(r => r[0] || null);
      }

      enriched.push({
        ...item.report,
        reporter: item.reporter,
        reportedUser: reportedUserObj,
        message: messageObj,
      });
    }

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// 25. Admin - Resolve Report
app.post('/api/admin/reports/:reportId/resolve', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.dbUser?.isAdmin) return res.status(403).json({ error: 'Admins only' });
    const reportId = parseInt(req.params.reportId);

    const updated = await db.update(reports)
      .set({ status: 'resolved' })
      .where(eq(reports.id, reportId))
      .returning();

    res.json(updated[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to resolve report' });
  }
});

// 26. Admin - List Announcements
app.get('/api/admin/announcements', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.dbUser?.isAdmin) return res.status(403).json({ error: 'Admins only' });
    const list = await db.select().from(systemAnnouncements).orderBy(desc(systemAnnouncements.createdAt));
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch announcements' });
  }
});

// 27. Admin - Create Announcement
app.post('/api/admin/announcements', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.dbUser?.isAdmin) return res.status(403).json({ error: 'Admins only' });
    const { content, type } = req.body;

    const inserted = await db.insert(systemAnnouncements)
      .values({
        content,
        type: type || 'broadcast',
        isActive: true,
      })
      .returning();

    res.json(inserted[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create announcement' });
  }
});

// 28. Admin - Toggle Announcement Status
app.put('/api/admin/announcements/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.dbUser?.isAdmin) return res.status(403).json({ error: 'Admins only' });
    const id = parseInt(req.params.id);
    const { isActive } = req.body;

    const updated = await db.update(systemAnnouncements)
      .set({ isActive: !!isActive })
      .where(eq(systemAnnouncements.id, id))
      .returning();

    res.json(updated[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update announcement' });
  }
});

// 29. Admin - Delete Announcement
app.delete('/api/admin/announcements/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.dbUser?.isAdmin) return res.status(403).json({ error: 'Admins only' });
    const id = parseInt(req.params.id);

    await db.delete(systemAnnouncements).where(eq(systemAnnouncements.id, id));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete announcement' });
  }
});

// 30. Admin - List Workers
app.get('/api/admin/workers', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.dbUser?.isAdmin) return res.status(403).json({ error: 'Admins only' });
    const list = await db.select().from(workers).orderBy(desc(workers.createdAt));
    res.json(list);
  } catch (error) {
    console.error('Failed to fetch workers:', error);
    res.status(500).json({ error: 'Failed to fetch workers' });
  }
});

// 31. Admin - Create Worker
app.post('/api/admin/workers', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.dbUser?.isAdmin) return res.status(403).json({ error: 'Admins only' });
    const { name, email, role, phone, department, status } = req.body;

    if (!name || !email || !role) {
      return res.status(400).json({ error: 'Name, email, and role are required' });
    }

    const inserted = await db.insert(workers)
      .values({
        name,
        email,
        role,
        phone: phone || null,
        department: department || null,
        status: status || 'active',
      })
      .returning();

    res.status(201).json(inserted[0]);
  } catch (error: any) {
    console.error('Failed to create worker:', error);
    if (error.message?.includes('workers_email_unique') || error.message?.includes('unique constraint')) {
      return res.status(400).json({ error: 'A worker with this email address already exists.' });
    }
    res.status(500).json({ error: 'Failed to create worker' });
  }
});

// 32. Admin - Update Worker
app.put('/api/admin/workers/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.dbUser?.isAdmin) return res.status(403).json({ error: 'Admins only' });
    const id = parseInt(req.params.id);
    const { name, email, role, phone, department, status } = req.body;

    if (!name || !email || !role) {
      return res.status(400).json({ error: 'Name, email, and role are required' });
    }

    const updated = await db.update(workers)
      .set({
        name,
        email,
        role,
        phone: phone || null,
        department: department || null,
        status: status || 'active',
        updatedAt: new Date(),
      })
      .where(eq(workers.id, id))
      .returning();

    if (updated.length === 0) {
      return res.status(404).json({ error: 'Worker not found' });
    }

    res.json(updated[0]);
  } catch (error) {
    console.error('Failed to update worker:', error);
    res.status(500).json({ error: 'Failed to update worker' });
  }
});

// 33. Admin - Delete Worker
app.delete('/api/admin/workers/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.dbUser?.isAdmin) return res.status(403).json({ error: 'Admins only' });
    const id = parseInt(req.params.id);

    const deleted = await db.delete(workers).where(eq(workers.id, id)).returning();
    if (deleted.length === 0) {
      return res.status(404).json({ error: 'Worker not found' });
    }

    res.json({ success: true, message: 'Worker deleted successfully' });
  } catch (error) {
    console.error('Failed to delete worker:', error);
    res.status(500).json({ error: 'Failed to delete worker' });
  }
});

// --- SOCKET.IO REALTIME EVENTS ---
io.on('connection', (socket) => {
  console.log('User connected to socket:', socket.id);

  // User registers their active ID
  socket.on('user-online', async (userId: number) => {
    try {
      socket.data.userId = userId;
      // Mark user online in DB
      await db.update(users).set({ status: 'online' }).where(eq(users.id, userId));
      const updatedUser = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      io.emit('user-updated', updatedUser[0]);
    } catch (err) {
      console.error('Socket user-online DB error:', err);
    }
  });

  // User joins a room
  socket.on('join-chat', (chatId: number) => {
    socket.join(`chat_${chatId}`);
    console.log(`Socket ${socket.id} joined room chat_${chatId}`);
  });

  // User leaves a room
  socket.on('leave-chat', (chatId: number) => {
    socket.leave(`chat_${chatId}`);
    console.log(`Socket ${socket.id} left room chat_${chatId}`);
  });

  // Typing indicator broadcast
  socket.on('typing', (data: { chatId: number; userId: number; displayName: string }) => {
    socket.to(`chat_${data.chatId}`).emit('typing', data);
  });

  // Stop typing indicator broadcast
  socket.on('stop-typing', (data: { chatId: number; userId: number }) => {
    socket.to(`chat_${data.chatId}`).emit('stop-typing', data);
  });

  // Read receipts updates
  socket.on('read-receipt', async (data: { chatId: number; userId: number }) => {
    try {
      // Find all delivered receipts for messages in this chat for this user
      const userDeliveredReceipts = await db.select({ receiptId: messageReceipts.id })
        .from(messageReceipts)
        .innerJoin(messages, eq(messageReceipts.messageId, messages.id))
        .where(
          and(
            eq(messages.chatId, data.chatId),
            eq(messageReceipts.userId, data.userId),
            eq(messageReceipts.status, 'delivered')
          )
        );

      if (userDeliveredReceipts.length > 0) {
        const idsToUpdate = userDeliveredReceipts.map(r => r.receiptId);
        await db.update(messageReceipts)
          .set({ status: 'read', updatedAt: new Date() })
          .where(inArray(messageReceipts.id, idsToUpdate));

        // Notify other sockets in the chat
        io.to(`chat_${data.chatId}`).emit('receipts-updated', {
          chatId: data.chatId,
          userId: data.userId,
          status: 'read',
        });
      }
    } catch (err) {
      console.error('Socket read-receipt error:', err);
    }
  });

  // Disconnect handler
  socket.on('disconnect', async () => {
    console.log('User disconnected from socket:', socket.id);
    const userId = socket.data.userId;
    if (userId) {
      try {
        await db.update(users).set({ status: 'offline' }).where(eq(users.id, userId));
        const updatedUser = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        io.emit('user-updated', updatedUser[0]);
      } catch (err) {
        console.error('Socket disconnect DB status error:', err);
      }
    }
  });
});

// Seed an AI Assistant user automatically in our DB
async function seedAIAssistant() {
  try {
    const aiUid = 'fly-ai-assistant-system-uid';
    const existingAI = await db.select().from(users).where(eq(users.uid, aiUid)).limit(1);

    if (existingAI.length === 0) {
      await db.insert(users).values({
        uid: aiUid,
        email: 'ai@flymessenger.v2',
        displayName: '🤖 Fly AI Assistant',
        photoURL: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=150&q=80',
        status: 'online',
        isAdmin: false,
      });
      console.log('Fly AI Assistant user seeded successfully!');
    }
  } catch (err) {
    console.error('Failed to seed AI Assistant:', err);
  }
}

// Start Server and Vite Middleware
async function startServer() {
  // Seed the AI assistant first
  await seedAIAssistant();

  // If in development mode (not production) mount Vite middleware
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production serving
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // Serve index.html for all client routes (React SPA router fallback)
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
