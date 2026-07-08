export interface User {
  id: number;
  uid: string;
  email: string;
  displayName: string | null;
  username: string | null;
  bio: string | null;
  photoURL: string | null;
  status: 'online' | 'offline' | 'away';
  isAdmin: boolean;
  isBanned: boolean;
  createdAt: string;
}

export interface Chat {
  id: number;
  name: string | null;
  isGroup: boolean;
  groupPhotoURL: string | null;
  description: string | null;
  inviteCode: string | null;
  createdAt: string;
  updatedAt: string;
  // Included relations
  participants?: Participant[];
  lastMessage?: Message;
  unreadCount?: number;
}

export interface Participant {
  id: number;
  chatId: number;
  userId: number;
  role: 'member' | 'admin';
  joinedAt: string;
  user?: User;
}

export interface Message {
  id: number;
  chatId: number;
  senderId: number;
  content: string;
  attachmentUrl: string | null;
  attachmentType: 'image' | 'file' | 'video' | 'audio' | null;
  isEdited: boolean;
  replyToId: number | null;
  replyToMessage?: Message | null;
  isDeleted: boolean;
  deletedForUsers: string | null;
  reactions: string | null; // stringified JSON representing emoji reactions [{ emoji: string, senderId: number, senderName: string }]
  createdAt: string;
  sender?: User;
  receipts?: MessageReceipt[];
}

export interface MessageReceipt {
  id: number;
  messageId: number;
  userId: number;
  status: 'delivered' | 'read';
  updatedAt: string;
}
