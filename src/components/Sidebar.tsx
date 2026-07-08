import React, { useState } from 'react';
import { Chat, User } from '../types.ts';
import { Search, Plus, LogOut, Shield, User as UserIcon, MessageSquare, Settings, Users, Sparkles } from 'lucide-react';

interface SidebarProps {
  chats: Chat[];
  activeChatId: number | null;
  onSelectChat: (chatId: number) => void;
  currentUser: User | null;
  onLogout: () => void;
  onOpenProfile: () => void;
  onOpenNewChat: () => void;
  onOpenAdmin: () => void;
  typingIndicators: Record<number, { userId: number; displayName: string }>;
}

export default function Sidebar({
  chats,
  activeChatId,
  onSelectChat,
  currentUser,
  onLogout,
  onOpenProfile,
  onOpenNewChat,
  onOpenAdmin,
  typingIndicators,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Filter chats by name or participant display names
  const filteredChats = chats.filter(chat => {
    if (chat.isGroup) {
      return chat.name?.toLowerCase().includes(searchQuery.toLowerCase());
    } else {
      // Find the other participant's name
      const recipient = chat.participants?.find(p => p.userId !== currentUser?.id)?.user;
      return recipient?.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
             recipient?.email.toLowerCase().includes(searchQuery.toLowerCase());
    }
  });

  // Helper to get chat details
  const getChatMetadata = (chat: Chat) => {
    let title = chat.name || 'Private Chat';
    let photo = '';
    let isAI = false;

    if (!chat.isGroup && currentUser) {
      const otherPart = chat.participants?.find(p => p.userId !== currentUser.id);
      if (otherPart?.user) {
        title = otherPart.user.displayName || otherPart.user.email.split('@')[0];
        photo = otherPart.user.photoURL || '';
        isAI = otherPart.user.displayName?.includes('🤖') || false;
      }
    }

    return { title, photo, isAI };
  };

  return (
    <div id="messenger-sidebar" className="w-full md:w-[350px] bg-slate-950 border-r border-slate-800/80 flex flex-col h-full shrink-0 font-sans">
      {/* Header Panel */}
      <div className="p-4 border-b border-slate-800/80 bg-slate-900/40 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20 font-bold text-lg font-display">
              F
            </div>
            <span className="text-white font-bold text-lg font-display tracking-tight flex items-center gap-1.5">
              Fly Messenger <span className="text-xs bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded-md font-sans">V2</span>
            </span>
          </div>

          <div className="flex items-center gap-1">
            {currentUser?.isAdmin && (
              <button
                onClick={onOpenAdmin}
                title="Admin Control Center"
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
              >
                <Shield size={18} />
              </button>
            )}
            <button
              onClick={onOpenNewChat}
              title="New Conversation"
              className="p-1.5 text-indigo-400 hover:text-indigo-300 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/25 transition border border-indigo-500/15"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="w-full pl-9 pr-4 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 transition text-sm"
          />
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredChats.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">
            {searchQuery ? 'No conversations found.' : 'No active conversations. Start a new one!'}
          </div>
        ) : (
          filteredChats.map(chat => {
            const { title, photo, isAI } = getChatMetadata(chat);
            const isActive = activeChatId === chat.id;
            const typist = typingIndicators[chat.id];

            // Get last message snippet
            let snippet = '';
            if (typist) {
              snippet = `${typist.displayName} is typing...`;
            } else if (chat.lastMessage) {
              snippet = chat.lastMessage.content;
              if (chat.lastMessage.attachmentUrl) {
                snippet = chat.lastMessage.attachmentType === 'image' ? '📷 Image' : '📁 Attachment';
              }
            }

            return (
              <div
                key={chat.id}
                onClick={() => onSelectChat(chat.id)}
                className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition ${
                  isActive
                    ? 'bg-indigo-500/10 border border-indigo-500/20'
                    : 'border border-transparent hover:bg-slate-900/60'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Avatar */}
                  <div className="relative">
                    {photo ? (
                      <img
                        src={photo}
                        alt={title}
                        className="w-11 h-11 rounded-full object-cover border border-slate-800"
                        referrerPolicy="no-referrer"
                      />
                    ) : chat.isGroup ? (
                      <div className="w-11 h-11 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
                        <Users size={20} />
                      </div>
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-indigo-600/20 text-indigo-400 border border-slate-800 flex items-center justify-center font-bold text-sm">
                        {title.charAt(0).toUpperCase()}
                      </div>
                    )}

                    {/* Online indicator for private chat recipient */}
                    {!chat.isGroup && chat.participants?.find(p => p.userId !== currentUser?.id)?.user?.status === 'online' && (
                      <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-slate-950" />
                    )}
                  </div>

                  {/* Text details */}
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-slate-100 flex items-center gap-1">
                      <span className="truncate">{title}</span>
                      {isAI && (
                        <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-1 rounded-md font-bold shrink-0">AI</span>
                      )}
                    </div>
                    <div className={`text-xs truncate max-w-[180px] mt-0.5 ${typist ? 'text-indigo-400 font-medium' : 'text-slate-400'}`}>
                      {snippet || 'No messages yet'}
                    </div>
                  </div>
                </div>

                {/* Badges / Meta */}
                <div className="flex flex-col items-end gap-1.5">
                  <span className="text-[10px] text-slate-500 font-mono">
                    {chat.lastMessage
                      ? new Date(chat.lastMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : ''}
                  </span>
                  {chat.unreadCount && chat.unreadCount > 0 ? (
                    <span className="px-1.5 py-0.5 bg-indigo-600 text-white rounded-full text-[10px] font-bold">
                      {chat.unreadCount}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Profile Footer */}
      {currentUser && (
        <div className="p-3 border-t border-slate-800/80 bg-slate-900/30 flex items-center justify-between">
          <div
            onClick={onOpenProfile}
            className="flex items-center gap-2.5 cursor-pointer hover:bg-slate-800/40 p-1.5 rounded-xl transition-colors min-w-0"
            title="Edit Profile Settings"
          >
            {currentUser.photoURL ? (
              <img
                src={currentUser.photoURL}
                alt={currentUser.displayName || 'Avatar'}
                className="w-9 h-9 rounded-full object-cover border border-slate-700"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-indigo-400">
                <UserIcon size={16} />
              </div>
            )}
            <div className="min-w-0">
              <div className="font-semibold text-xs text-white truncate max-w-[120px]">
                {currentUser.displayName || currentUser.email.split('@')[0]}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`w-2 h-2 rounded-full ${
                  currentUser.status === 'online' ? 'bg-emerald-500' : currentUser.status === 'away' ? 'bg-amber-500' : 'bg-slate-500'
                }`} />
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{currentUser.status}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={onOpenProfile}
              title="Edit Profile"
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/80 transition"
            >
              <Settings size={16} />
            </button>
            <button
              onClick={onLogout}
              title="Logout"
              className="p-2 text-rose-400 hover:text-rose-300 rounded-lg hover:bg-rose-950/20 transition"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
