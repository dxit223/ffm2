import React, { useState, useEffect, useRef } from 'react';
import { Chat, Message, User } from '../types.ts';
import {
  Send,
  Image,
  File,
  Check,
  CheckCheck,
  Loader2,
  ArrowLeft,
  Users,
  Paperclip,
  MoreVertical,
  CornerUpLeft,
  Edit3,
  Trash2,
  AlertTriangle,
  Smile,
  X,
  Plus
} from 'lucide-react';

interface ChatAreaProps {
  chat: Chat | null;
  messagesList: Message[];
  currentUser: User | null;
  onSendMessage: (content: string, attachmentUrl?: string, attachmentType?: 'image' | 'file', replyToId?: number) => Promise<void>;
  onBack: () => void; // for mobile view
  socket: any;
  token: string;
}

export default function ChatArea({
  chat,
  messagesList,
  currentUser,
  onSendMessage,
  onBack,
  socket,
  token,
}: ChatAreaProps) {
  const [inputText, setInputText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<any>(null);

  // Advanced feature states
  const [replyingToMessage, setReplyingToMessage] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [activeMessageMenuId, setActiveMessageMenuId] = useState<number | null>(null);
  const [showReportModal, setShowReportModal] = useState<Message | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reporting, setReporting] = useState(false);
  const [hiddenMessageIds, setHiddenMessageIds] = useState<number[]>([]);
  const [showReactionPickerId, setShowReactionPickerId] = useState<number | null>(null);

  // Common reaction emojis
  const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

  // Close menus on outside click
  useEffect(() => {
    const handleOutsideClick = () => {
      setActiveMessageMenuId(null);
      setShowReactionPickerId(null);
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesList, typingUser]);

  // Setup typing indicator socket listener
  useEffect(() => {
    if (!socket || !chat || !currentUser) return;

    const handleTyping = (data: { chatId: number; userId: number; displayName: string }) => {
      if (data.chatId === chat.id && data.userId !== currentUser.id) {
        setTypingUser(data.displayName);
      }
    };

    const handleStopTyping = (data: { chatId: number; userId: number }) => {
      if (data.chatId === chat.id && data.userId !== currentUser.id) {
        setTypingUser(null);
      }
    };

    socket.on('typing', handleTyping);
    socket.on('stop-typing', handleStopTyping);

    return () => {
      socket.off('typing', handleTyping);
      socket.off('stop-typing', handleStopTyping);
    };
  }, [socket, chat, currentUser]);

  // Trigger read receipt on chat load/change or on new messages
  useEffect(() => {
    if (!socket || !chat || !currentUser) return;
    socket.emit('read-receipt', { chatId: chat.id, userId: currentUser.id });
  }, [chat, messagesList, socket, currentUser]);

  if (!chat || !currentUser) {
    return (
      <div id="no-chat-selected" className="hidden md:flex flex-1 flex-col items-center justify-center p-12 bg-slate-900/40 text-center font-sans">
        <div className="w-20 h-20 rounded-3xl bg-indigo-600/10 border border-indigo-500/15 flex items-center justify-center text-indigo-400 mb-6 shadow-xl shadow-indigo-600/5">
          <Paperclip size={36} className="animate-pulse" />
        </div>
        <h2 className="text-xl font-bold text-white font-display tracking-tight">Your Secured Digital Workspace</h2>
        <p className="text-slate-400 text-sm max-w-sm mt-2 leading-relaxed">
          Open a conversation from the list to start messaging in real-time, share files, and consult Fly AI Assistant.
        </p>
      </div>
    );
  }

  // Get recipient/chat details
  const getChatHeaderDetails = () => {
    let name = chat.name || 'Private Chat';
    let photo = '';
    let statusLine = chat.isGroup ? 'Group Conversation' : 'Offline';

    if (!chat.isGroup) {
      const otherPart = chat.participants?.find(p => p.userId !== currentUser.id);
      if (otherPart?.user) {
        name = otherPart.user.displayName || otherPart.user.email.split('@')[0];
        photo = otherPart.user.photoURL || '';
        statusLine = otherPart.user.status; // 'online' | 'away' | 'offline'
      }
    } else {
      statusLine = `${chat.participants?.length || 0} participants`;
    }

    return { name, photo, statusLine };
  };

  const headerDetails = getChatHeaderDetails();

  // Handle keypress for typing emitter
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);

    if (socket) {
      socket.emit('typing', { chatId: chat.id, userId: currentUser.id, displayName: currentUser.displayName || currentUser.email.split('@')[0] });

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('stop-typing', { chatId: chat.id, userId: currentUser.id });
      }, 2000);
    }
  };

  // Submit Message (Handles both creation & editing)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    if (socket && typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      socket.emit('stop-typing', { chatId: chat.id, userId: currentUser.id });
    }

    const textToSend = inputText;
    setInputText('');

    if (editingMessage) {
      // Editing Mode
      const msgId = editingMessage.id;
      setEditingMessage(null);
      try {
        const res = await fetch(`/api/messages/${msgId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ content: textToSend }),
        });
        if (!res.ok) throw new Error('Edit failed');
      } catch (err) {
        alert('Failed to edit message.');
      }
    } else {
      // Standard Messaging with replies
      const replyId = replyingToMessage?.id;
      setReplyingToMessage(null);
      await onSendMessage(textToSend, undefined, undefined, replyId);
    }
  };

  // Handle File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64Data = reader.result as string;

        // Call express /api/upload
        const response = await fetch('/api/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: file.name,
            type: file.type,
            data: base64Data,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to upload attachment');
        }

        const data = response.json ? await response.json() : await response;
        const type: 'image' | 'file' = file.type.startsWith('image/') ? 'image' : 'file';

        // Send message with file attachment url
        await onSendMessage(`Shared a ${type === 'image' ? 'photo' : 'file'}: ${file.name}`, data.url, type, replyingToMessage?.id);
        setReplyingToMessage(null);
      };
    } catch (err) {
      console.error(err);
      alert('Attachment sharing failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  // Message Reaction Toggle Action
  const handleToggleReaction = async (messageId: number, emoji: string) => {
    try {
      const res = await fetch(`/api/messages/${messageId}/reaction`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ emoji }),
      });
      if (!res.ok) throw new Error('Reaction failed');
    } catch (err) {
      console.error('Failed to react:', err);
    }
  };

  // Delete message for everyone (only for self)
  const handleDeleteEveryone = async (messageId: number) => {
    if (!confirm('Delete this message for all participants?')) return;
    try {
      const res = await fetch(`/api/messages/${messageId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Delete failed');
    } catch (err) {
      alert('Failed to delete message.');
    }
  };

  // Delete message for me only
  const handleDeleteForMe = async (messageId: number) => {
    try {
      const res = await fetch(`/api/messages/${messageId}/delete-for-me`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Hide failed');
      setHiddenMessageIds(prev => [...prev, messageId]);
    } catch (err) {
      alert('Failed to hide message.');
    }
  };

  // File Report Action
  const handleReportMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportReason.trim() || !showReportModal) return;
    setReporting(true);
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          reportedUserId: showReportModal.senderId,
          messageId: showReportModal.id,
          reason: reportReason.trim(),
        }),
      });
      if (!res.ok) throw new Error('Report failed');
      alert('Message reported successfully. Administration has been notified.');
      setShowReportModal(null);
      setReportReason('');
    } catch (err) {
      alert('Failed to register report.');
    } finally {
      setReporting(false);
    }
  };

  // Group reactions helper
  const renderReactions = (msg: Message) => {
    let parsed: Array<{ emoji: string, senderId: number, senderName: string }> = [];
    if (msg.reactions) {
      try {
        parsed = JSON.parse(msg.reactions);
      } catch {
        parsed = [];
      }
    }
    if (parsed.length === 0) return null;

    const grouped = parsed.reduce((acc, curr) => {
      if (!acc[curr.emoji]) acc[curr.emoji] = [];
      acc[curr.emoji].push(curr.senderName);
      return acc;
    }, {} as Record<string, string[]>);

    return (
      <div className="flex flex-wrap gap-1 mt-1.5 px-0.5">
        {Object.entries(grouped).map(([emoji, senders]) => (
          <button
            key={emoji}
            onClick={(e) => {
              e.stopPropagation();
              handleToggleReaction(msg.id, emoji);
            }}
            title={`Reacted by: ${senders.join(', ')}`}
            className="flex items-center gap-1 bg-slate-950/80 hover:bg-indigo-950/80 border border-slate-800 hover:border-indigo-500/50 text-[10px] px-2 py-0.5 rounded-full transition text-slate-300"
          >
            <span>{emoji}</span>
            <span className="font-bold text-indigo-400 font-mono">{senders.length}</span>
          </button>
        ))}
      </div>
    );
  };

  return (
    <div id={`chat-area-${chat.id}`} className="flex-1 flex flex-col h-full bg-slate-900/30 overflow-hidden font-sans relative">
      {/* Header Bar */}
      <div className="p-4 border-b border-slate-800/80 bg-slate-900/60 flex items-center justify-between sticky top-0 z-10 backdrop-blur-md">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="md:hidden p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
          >
            <ArrowLeft size={18} />
          </button>

          {headerDetails.photo ? (
            <img
              src={headerDetails.photo}
              alt={headerDetails.name}
              className="w-10 h-10 rounded-full object-cover border border-slate-800 shrink-0"
              referrerPolicy="no-referrer"
            />
          ) : chat.isGroup ? (
            <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0">
              <Users size={18} />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full bg-indigo-600/20 text-indigo-400 border border-slate-800 flex items-center justify-center font-bold text-sm shrink-0">
              {headerDetails.name.charAt(0).toUpperCase()}
            </div>
          )}

          <div className="min-w-0">
            <h4 className="font-semibold text-sm text-white truncate">{headerDetails.name}</h4>
            <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
              {typingUser ? (
                <span className="text-xs text-indigo-400 font-medium animate-pulse truncate">{typingUser} is typing...</span>
              ) : (
                <>
                  {!chat.isGroup && (
                    <span className={`w-2 h-2 rounded-full shrink-0 ${
                      headerDetails.statusLine === 'online' ? 'bg-emerald-500' : headerDetails.statusLine === 'away' ? 'bg-amber-500' : 'bg-slate-500'
                    }`} />
                  )}
                  <span className="text-xs text-slate-500 capitalize truncate">{headerDetails.statusLine}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Messages Scrolling Grid */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messagesList.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8">
            <span className="text-slate-500 text-sm">No messages in this chat. Type a message below to start chatting!</span>
          </div>
        ) : (
          messagesList
            .filter(msg => !hiddenMessageIds.includes(msg.id))
            .map((msg, idx) => {
              const isSelf = msg.senderId === currentUser.id;
              const hasAttachment = !!msg.attachmentUrl;
              const hasRead = msg.receipts?.some(r => r.status === 'read' && r.userId !== currentUser.id) || false;
              const isMsgMenuOpen = activeMessageMenuId === msg.id;
              const isReactionPickerOpen = showReactionPickerId === msg.id;

              return (
                <div
                  key={msg.id || idx}
                  className={`flex items-start gap-2.5 max-w-[85%] md:max-w-[70%] group/msg relative ${isSelf ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
                >
                  {/* Sender Avatar */}
                  {!isSelf && (
                    <div className="shrink-0 mt-0.5">
                      {msg.sender?.photoURL ? (
                        <img
                          src={msg.sender.photoURL}
                          alt={msg.sender.displayName || 'Sender'}
                          className="w-8 h-8 rounded-full object-cover border border-slate-800"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 text-slate-400 flex items-center justify-center text-xs font-bold">
                          {(msg.sender?.displayName || msg.sender?.email || '?').charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Message Bubble container */}
                  <div className="space-y-1 relative min-w-[120px]">
                    {/* Sender Name in group */}
                    {chat.isGroup && !isSelf && (
                      <div className="text-[10px] font-bold text-indigo-400 px-1">
                        {msg.sender?.displayName || msg.sender?.email.split('@')[0]}
                      </div>
                    )}

                    {/* Reply Quoted Preview */}
                    {msg.replyToMessage && !msg.isDeleted && (
                      <div className="p-2 bg-slate-950/65 border-l-2 border-indigo-500 rounded-lg text-[11px] text-slate-300 max-w-full truncate mb-1 space-y-0.5">
                        <div className="font-bold text-indigo-400 text-[10px]">
                          Replying to {msg.replyToMessage.sender?.displayName || msg.replyToMessage.sender?.email?.split('@')[0] || 'User'}
                        </div>
                        <p className="truncate italic text-slate-400">"{msg.replyToMessage.content}"</p>
                      </div>
                    )}

                    {/* Bubble body */}
                    <div className={`p-3 rounded-2xl relative shadow-md border ${
                      msg.isDeleted
                        ? 'bg-slate-900/45 border-slate-850/60 text-slate-500 italic text-xs rounded-tr-none'
                        : isSelf
                          ? 'bg-indigo-600 border-indigo-500/50 text-white rounded-tr-none'
                          : 'bg-slate-900 border-slate-800 text-slate-100 rounded-tl-none'
                    }`}>
                      {/* Attachment content */}
                      {hasAttachment && !msg.isDeleted && (
                        <div className="mb-2 max-w-full overflow-hidden rounded-lg bg-black/20 border border-black/10">
                          {msg.attachmentType === 'image' ? (
                            <img
                              src={msg.attachmentUrl || ''}
                              alt="Shared photo"
                              className="w-full max-h-[250px] object-cover hover:opacity-90 transition-opacity cursor-zoom-in"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="p-3 flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-slate-950/40 border border-slate-800 flex items-center justify-center text-indigo-400 shrink-0">
                                <File size={18} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-semibold truncate text-slate-200">Shared Attachment</div>
                                <a
                                  href={msg.attachmentUrl || ''}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] text-indigo-400 hover:underline inline-block mt-0.5 font-bold"
                                >
                                  Open File
                                </a>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>

                      {/* Meta info block at bottom right of bubble */}
                      <div className="flex items-center justify-end gap-1 mt-1.5 text-[9px] text-slate-300 opacity-70">
                        {msg.isEdited && !msg.isDeleted && <span className="text-[9px] text-indigo-300 italic">(edited)</span>}
                        <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {isSelf && (
                          hasRead ? (
                            <CheckCheck size={12} className="text-indigo-300 shrink-0" />
                          ) : (
                            <Check size={12} className="text-slate-300 shrink-0" />
                          )
                        )}
                      </div>
                    </div>

                    {/* Group reactions display inside bubble */}
                    {!msg.isDeleted && renderReactions(msg)}
                  </div>

                  {/* Inline Options Trigger Menu & Reaction Shortcut */}
                  {!msg.isDeleted && (
                    <div className={`absolute top-1/2 -translate-y-1/2 opacity-0 group-hover/msg:opacity-100 transition-opacity flex items-center gap-1 z-20 ${
                      isSelf ? 'left-0 -translate-x-[110%]' : 'right-0 translate-x-[110%]'
                    }`}>
                      {/* Fast Reaction Picker Trigger */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowReactionPickerId(isReactionPickerOpen ? null : msg.id);
                          setActiveMessageMenuId(null);
                        }}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg bg-slate-900 border border-slate-800 shadow-md transition"
                        title="React to message"
                      >
                        <Smile size={14} />
                      </button>

                      {/* Message Option Dropdown Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMessageMenuId(isMsgMenuOpen ? null : msg.id);
                          setShowReactionPickerId(null);
                        }}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg bg-slate-900 border border-slate-800 shadow-md transition"
                        title="More actions"
                      >
                        <MoreVertical size={14} />
                      </button>

                      {/* Quick Reactions Floating Bubble */}
                      {isReactionPickerOpen && (
                        <div
                          className="absolute bottom-full mb-1 bg-slate-950 border border-slate-800 rounded-full px-2 py-1 shadow-2xl flex items-center gap-1.5 z-30 animate-fade-in"
                          onClick={e => e.stopPropagation()}
                        >
                          {REACTION_EMOJIS.map(emoji => (
                            <button
                              key={emoji}
                              onClick={() => {
                                handleToggleReaction(msg.id, emoji);
                                setShowReactionPickerId(null);
                              }}
                              className="hover:scale-125 transition-transform text-sm p-0.5"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Custom dropdown overlay list */}
                      {isMsgMenuOpen && (
                        <div
                          className="absolute top-full mt-1 w-44 bg-slate-950 border border-slate-800 rounded-xl py-1.5 shadow-2xl flex flex-col z-30 animate-fade-in"
                          onClick={e => e.stopPropagation()}
                        >
                          {/* Reply trigger */}
                          <button
                            onClick={() => {
                              setReplyingToMessage(msg);
                              setEditingMessage(null);
                              setInputText('');
                              setActiveMessageMenuId(null);
                            }}
                            className="flex items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-300 hover:bg-slate-900 hover:text-white transition"
                          >
                            <CornerUpLeft size={13} className="text-indigo-400" /> Reply
                          </button>

                          {/* Edit trigger (only self) */}
                          {isSelf && (
                            <button
                              onClick={() => {
                                setEditingMessage(msg);
                                setReplyingToMessage(null);
                                setInputText(msg.content);
                                setActiveMessageMenuId(null);
                              }}
                              className="flex items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-300 hover:bg-slate-900 hover:text-white transition"
                            >
                              <Edit3 size={13} className="text-indigo-400" /> Edit Message
                            </button>
                          )}

                          {/* Delete everyone (only self) */}
                          {isSelf && (
                            <button
                              onClick={() => {
                                handleDeleteEveryone(msg.id);
                                setActiveMessageMenuId(null);
                              }}
                              className="flex items-center gap-2 px-3 py-1.5 text-left text-xs text-rose-400 hover:bg-rose-950/15 transition"
                            >
                              <Trash2 size={13} /> Delete for Everyone
                            </button>
                          )}

                          {/* Delete for me */}
                          <button
                            onClick={() => {
                              handleDeleteForMe(msg.id);
                              setActiveMessageMenuId(null);
                            }}
                            className="flex items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-400 hover:bg-slate-900 hover:text-white transition"
                          >
                            <Trash2 size={13} /> Delete for Me
                          </button>

                          {/* Report Abuse (only others) */}
                          {!isSelf && (
                            <button
                              onClick={() => {
                                setShowReportModal(msg);
                                setActiveMessageMenuId(null);
                              }}
                              className="flex items-center gap-2 px-3 py-1.5 text-left text-xs text-amber-400 hover:bg-amber-950/15 transition"
                            >
                              <AlertTriangle size={13} /> Report Message
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
        )}
        {/* Dynamic AI typing indicator inside scrolling list */}
        {typingUser && (
          <div className="flex items-center gap-2.5 max-w-[70%] mr-auto">
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-indigo-400 text-xs">
              🤖
            </div>
            <div className="bg-slate-900 border border-slate-800 text-slate-100 p-3 rounded-2xl rounded-tl-none flex items-center gap-1.5">
              <span className="text-xs font-medium text-slate-400">{typingUser} is composing...</span>
              <Loader2 size={12} className="animate-spin text-indigo-400" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Replying Banner Above Input */}
      {replyingToMessage && (
        <div className="px-4 py-2.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs animate-fade-in">
          <div className="flex items-center gap-2 border-l-2 border-indigo-500 pl-3 min-w-0">
            <CornerUpLeft size={14} className="text-indigo-400 shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold text-slate-200">
                Replying to <span className="text-indigo-400">{replyingToMessage.sender?.displayName || replyingToMessage.sender?.email.split('@')[0]}</span>
              </div>
              <p className="text-slate-400 truncate text-[11px] mt-0.5">"{replyingToMessage.content}"</p>
            </div>
          </div>
          <button
            onClick={() => setReplyingToMessage(null)}
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-900 rounded-lg transition shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Editing Banner Above Input */}
      {editingMessage && (
        <div className="px-4 py-2.5 bg-slate-950 border-t border-indigo-500/20 flex items-center justify-between text-xs animate-fade-in">
          <div className="flex items-center gap-2 border-l-2 border-amber-500 pl-3 min-w-0">
            <Edit3 size={14} className="text-amber-400 shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold text-slate-200">Editing Message</div>
              <p className="text-slate-400 truncate text-[11px] mt-0.5">"{editingMessage.content}"</p>
            </div>
          </div>
          <button
            onClick={() => {
              setEditingMessage(null);
              setInputText('');
            }}
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-900 rounded-lg transition shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Input Action Panel */}
      <div className="p-4 bg-slate-950 border-t border-slate-800/80 sticky bottom-0">
        <form onSubmit={handleSubmit} className="flex items-center gap-2.5">
          {/* File trigger */}
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            title="Share Photo or Document"
            className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-900 border border-slate-800 transition disabled:opacity-50 shrink-0 flex items-center justify-center"
          >
            {uploading ? <Loader2 size={18} className="animate-spin" /> : <Image size={18} />}
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="image/*,application/pdf,text/*"
            className="hidden"
          />

          {/* Text Input */}
          <input
            type="text"
            value={inputText}
            onChange={handleInputChange}
            placeholder={editingMessage ? "Commit message edits..." : "Write a message, or talk to Fly AI..."}
            className="flex-1 px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 transition text-sm"
          />

          {/* Send Trigger */}
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="p-2 text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-xl transition flex items-center justify-center shrink-0"
          >
            <Send size={18} />
          </button>
        </form>
      </div>

      {/* Report Modal Popover Overlay */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4" onClick={() => setShowReportModal(null)}>
          <form
            onSubmit={handleReportMessage}
            className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-2xl animate-scale-up"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-1.5 uppercase tracking-wider">
                <AlertTriangle size={16} className="text-amber-500" /> File Moderation Report
              </h3>
              <button
                type="button"
                onClick={() => setShowReportModal(null)}
                className="text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-3 bg-slate-950/50 rounded-xl border border-slate-850/60 text-xs text-slate-400 space-y-1">
              <div className="font-bold uppercase text-[9px] text-slate-500">Reported Message Payload</div>
              <p className="italic">"{showReportModal.content}"</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-400 uppercase">Violation Description</label>
              <textarea
                value={reportReason}
                onChange={e => setReportReason(e.target.value)}
                placeholder="Explain why this content violates platform guidelines (spam, abuse, harassment)..."
                rows={3}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs placeholder-slate-600 focus:outline-hidden focus:border-indigo-500 transition resize-none"
                required
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowReportModal(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={reporting || !reportReason.trim()}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-xs font-semibold rounded-xl transition flex items-center gap-1.5 shadow-lg shadow-amber-600/10"
              >
                {reporting ? <Loader2 size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
                Submit Report
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
