/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { io } from 'socket.io-client';

import { auth, googleAuthProvider } from './lib/firebase.ts';
import { Chat, Message, User } from './types.ts';
import Sidebar from './components/Sidebar.tsx';
import ChatArea from './components/ChatArea.tsx';
import ProfileModal from './components/ProfileModal.tsx';
import NewChatModal from './components/NewChatModal.tsx';
import AdminDashboard from './components/AdminDashboard.tsx';

import { Shield, Sparkles, MessageSquare, LogIn, Loader2, RefreshCw, Layers } from 'lucide-react';

export default function App() {
  const [firebaseUser, setFirebaseUser] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [token, setToken] = useState<string>('');
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [usersList, setUsersList] = useState<User[]>([]);
  const [socket, setSocket] = useState<any>(null);

  // Modal Visibility State
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);

  // App Sync/Loading Indicators
  const [authLoading, setAuthLoading] = useState(true);
  const [chatsLoading, setChatsLoading] = useState(false);
  const [msgLoading, setMsgLoading] = useState(false);
  const [typingIndicators, setTypingIndicators] = useState<Record<number, { userId: number; displayName: string }>>({});

  // Credentials Auth States
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authUsername, setAuthUsername] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authDisplayName, setAuthDisplayName] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // 1. Monitor Auth Changes (Both Firebase & Custom Credentials)
  useEffect(() => {
    let active = true;

    const checkCustomAuth = async () => {
      const storedToken = localStorage.getItem('custom_auth_token');
      if (storedToken) {
        try {
          const res = await fetch('/api/users/me', {
            headers: { Authorization: `Bearer ${storedToken}` },
          });
          if (res.ok) {
            const dbUser = await res.json();
            if (active) {
              setToken(storedToken);
              setCurrentUser(dbUser);
              setFirebaseUser({ uid: dbUser.uid, email: dbUser.email, displayName: dbUser.displayName });
              setAuthLoading(false);
              return true;
            }
          } else {
            localStorage.removeItem('custom_auth_token');
          }
        } catch (err) {
          console.error('Custom Token Sync Error:', err);
        }
      }
      return false;
    };

    const initAuth = async () => {
      setAuthLoading(true);
      const hasCustom = await checkCustomAuth();
      if (hasCustom) return;

      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (!active) return;
        if (user) {
          try {
            const idToken = await user.getIdToken();
            setToken(idToken);
            setFirebaseUser(user);

            // Get synced DB profile
            const res = await fetch('/api/users/me', {
              headers: { Authorization: `Bearer ${idToken}` },
            });
            if (res.ok) {
              const dbUser = await res.json();
              setCurrentUser(dbUser);
            } else {
              console.error('Failed to retrieve synchronized user profile');
            }
          } catch (err) {
            console.error('Firebase Auth Sync Error:', err);
          }
        } else {
          // Only clear if not authenticated via custom credentials
          if (!localStorage.getItem('custom_auth_token')) {
            setFirebaseUser(null);
            setCurrentUser(null);
            setToken('');
            if (socket) {
              socket.disconnect();
              setSocket(null);
            }
          }
        }
        setAuthLoading(false);
      });

      return unsubscribe;
    };

    const unsubPromise = initAuth();

    return () => {
      active = false;
      unsubPromise.then((unsub) => unsub && unsub());
    };
  }, []);

  // 2. Initialize Socket.IO connection when authenticated
  useEffect(() => {
    if (!currentUser || !token) return;

    const newSocket = io({
      transports: ['websocket', 'polling'],
    });

    setSocket(newSocket);

    // Register user as active/online
    newSocket.emit('user-online', currentUser.id);

    // Listen to real-time events
    newSocket.on('new-message', (msg: Message) => {
      // Append message if it belongs to current active chat
      setMessages((prev) => {
        if (prev.length > 0 && prev[0].chatId === msg.chatId) {
          // Avoid duplicate messages
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        }
        return prev;
      });

      // Update chats list (bump chat to top, update last message and unread count)
      setChats((prevChats) => {
        return prevChats.map((chat) => {
          if (chat.id === msg.chatId) {
            const isCurrentChat = activeChatId === msg.chatId;
            return {
              ...chat,
              lastMessage: msg,
              unreadCount: isCurrentChat ? 0 : (chat.unreadCount || 0) + 1,
              updatedAt: new Date().toISOString(),
            };
          }
          return chat;
        }).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      });
    });

    newSocket.on('chat-created', (newChat: Chat) => {
      // Check if user is a participant
      const isParticipant = newChat.participants?.some(p => p.userId === currentUser.id);
      if (isParticipant) {
        setChats((prev) => {
          if (prev.some((c) => c.id === newChat.id)) return prev;
          return [newChat, ...prev];
        });
      }
    });

    newSocket.on('typing', (data: { chatId: number; userId: number; displayName: string }) => {
      if (data.userId !== currentUser.id) {
        setTypingIndicators((prev) => ({
          ...prev,
          [data.chatId]: { userId: data.userId, displayName: data.displayName },
        }));
      }
    });

    newSocket.on('stop-typing', (data: { chatId: number; userId: number }) => {
      setTypingIndicators((prev) => {
        const copy = { ...prev };
        delete copy[data.chatId];
        return copy;
      });
    });

    newSocket.on('receipts-updated', (data: { chatId: number; userId: number; status: string }) => {
      // Update read status ticks of local active messages
      setMessages((prev) => {
        return prev.map((msg) => {
          if (msg.chatId === data.chatId && msg.senderId === currentUser.id) {
            return {
              ...msg,
              receipts: msg.receipts?.map((r) =>
                r.userId === data.userId ? { ...r, status: data.status as 'read' } : r
              ),
            };
          }
          return msg;
        });
      });
    });

    newSocket.on('message-updated', (updatedMsg: Message) => {
      setMessages((prev) => {
        return prev.map((m) => m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m);
      });
    });

    newSocket.on('user-updated', (updatedUser: User) => {
      // Update the user details inside participants mapping
      setChats((prev) =>
        prev.map((c) => ({
          ...c,
          participants: c.participants?.map((p) =>
            p.userId === updatedUser.id ? { ...p, user: updatedUser } : p
          ),
        }))
      );
      // Update current user if it was themselves
      if (updatedUser.id === currentUser.id) {
        setCurrentUser(updatedUser);
      }
    });

    return () => {
      newSocket.disconnect();
    };
  }, [currentUser, token]);

  // 3. Load chats list and registered users list on login
  useEffect(() => {
    if (!currentUser || !token) return;

    const loadConversationsData = async () => {
      setChatsLoading(true);
      try {
        // Fetch chats list
        const chatsRes = await fetch('/api/chats', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (chatsRes.ok) {
          const chatsData = await chatsRes.json();
          setChats(chatsData);
        }

        // Fetch users list (excluding current user)
        const usersRes = await fetch('/api/users', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (usersRes.ok) {
          const usersData = await usersRes.json();
          setUsersList(usersData);
        }
      } catch (err) {
        console.error('Failed to load initial messenger telemetry:', err);
      } finally {
        setChatsLoading(false);
      }
    };

    loadConversationsData();
  }, [currentUser, token]);

  // 4. Load messages for selected chat & join chat room
  useEffect(() => {
    if (!activeChatId || !token || !socket) return;

    const loadActiveChatMessages = async () => {
      setMsgLoading(true);
      try {
        const res = await fetch(`/api/chats/${activeChatId}/messages`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const msgData = await res.json();
          setMessages(msgData);
        }

        // Clear local unread counts
        setChats((prev) =>
          prev.map((c) => (c.id === activeChatId ? { ...c, unreadCount: 0 } : c))
        );

        // Notify socket of chat room join
        socket.emit('join-chat', activeChatId);
      } catch (err) {
        console.error('Failed to load chat messages:', err);
      } finally {
        setMsgLoading(false);
      }
    };

    loadActiveChatMessages();

    return () => {
      // Notify socket of chat room leave
      socket.emit('leave-chat', activeChatId);
    };
  }, [activeChatId, token, socket]);

  // Handle Login Event
  const handleGoogleLogin = async () => {
    try {
      setAuthLoading(true);
      setAuthError(null);
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err: any) {
      console.error('Google Popup Sign-In failed:', err);
      setAuthError(err.message || 'Google Sign-In failed');
      setAuthLoading(false);
    }
  };

  // Handle Logout Event
  const handleLogout = async () => {
    try {
      localStorage.removeItem('custom_auth_token');
      await signOut(auth);
      setFirebaseUser(null);
      setCurrentUser(null);
      setToken('');
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
    } catch (err) {
      console.error('Sign-out failed:', err);
    }
  };

  // Handle Credentials-based Registration and Login
  const handleCredentialsAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSubmitting(true);

    try {
      if (authMode === 'signin') {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: authUsername,
            password: authPassword,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Login failed');
        }
        localStorage.setItem('custom_auth_token', data.token);
        setToken(data.token);
        setCurrentUser(data.user);
        setFirebaseUser({ uid: data.user.uid, email: data.user.email, displayName: data.user.displayName });
      } else {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: authUsername,
            email: authEmail,
            displayName: authDisplayName,
            password: authPassword,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Registration failed');
        }
        localStorage.setItem('custom_auth_token', data.token);
        setToken(data.token);
        setCurrentUser(data.user);
        setFirebaseUser({ uid: data.user.uid, email: data.user.email, displayName: data.user.displayName });
      }
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthSubmitting(false);
    }
  };

  // Handle Update Profile Helper
  const handleUpdateProfile = async (data: { displayName?: string; photoURL?: string; status?: 'online' | 'away' | 'offline' }) => {
    const res = await fetch('/api/users/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      throw new Error('Failed to update profile settings on server');
    }

    const updatedUser = await res.json();
    setCurrentUser(updatedUser);
  };

  // Handle Create Conversation Helper
  const handleCreateChat = async (
    isGroup: boolean,
    name: string | null,
    recipientId: number | null,
    participantIds: number[] | null
  ) => {
    const res = await fetch('/api/chats', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ isGroup, name, recipientId, participantIds }),
    });

    if (!res.ok) {
      throw new Error('Failed to create chat channel on server');
    }

    const newChat = await res.json();

    setChats((prev) => {
      if (prev.some((c) => c.id === newChat.id)) return prev;
      return [newChat, ...prev];
    });

    setActiveChatId(newChat.id);
  };

  // Handle Send Message Helper
  const handleSendMessage = async (content: string, attachmentUrl?: string, attachmentType?: 'image' | 'file', replyToId?: number) => {
    if (!activeChatId) return;

    const res = await fetch(`/api/chats/${activeChatId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ content, attachmentUrl, attachmentType, replyToId }),
    });

    if (!res.ok) {
      throw new Error('Failed to post message to backend channel');
    }

    const newMsg = await res.json();

    // Optimistically update message if not already received via websocket
    setMessages((prev) => {
      if (prev.some((m) => m.id === newMsg.id)) return prev;
      return [...prev, newMsg];
    });

    // Update chats list lastMessage info
    setChats((prevChats) => {
      return prevChats.map((chat) => {
        if (chat.id === activeChatId) {
          return {
            ...chat,
            lastMessage: newMsg,
            updatedAt: new Date().toISOString(),
          };
        }
        return chat;
      }).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    });
  };

  if (authLoading) {
    return (
      <div id="app-auth-loading" className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center font-sans">
        <div className="relative flex items-center justify-center">
          <div className="w-16 h-16 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
          <Layers className="absolute text-indigo-400" size={24} />
        </div>
        <span className="text-slate-400 text-sm mt-5 font-semibold tracking-wide animate-pulse">Synchronizing Cryptographic Channels...</span>
      </div>
    );
  }

  // Logged-out Landing & Credentials / Google Auth trigger
  if (!firebaseUser || !currentUser) {
    return (
      <div id="landing-page" className="fixed inset-0 bg-slate-950 flex items-center justify-center p-4 overflow-hidden font-sans">
        {/* Dynamic ambient color background glow */}
        <div className="absolute top-1/4 left-1/4 w-[350px] h-[350px] rounded-full bg-indigo-600/10 blur-[100px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-[350px] h-[350px] rounded-full bg-cyan-600/10 blur-[100px] pointer-events-none" />

        <div className="w-full max-w-lg bg-slate-900/70 border border-slate-800/80 p-8 md:p-10 rounded-3xl shadow-2xl backdrop-blur-md flex flex-col items-center max-h-full overflow-y-auto relative z-10 scrollbar-none">
          {/* Logo */}
          <div className="w-16 h-16 rounded-2xl bg-indigo-600/15 border border-indigo-500/25 flex items-center justify-center text-indigo-400 mb-5 shadow-xl shadow-indigo-600/5">
            <Layers size={28} className="animate-pulse" />
          </div>

          <h1 className="text-2xl md:text-3xl font-extrabold text-white font-display tracking-tight leading-tight">
            Fly Messenger <span className="text-indigo-500 font-medium text-lg">V2</span>
          </h1>
          <p className="text-slate-400 text-xs md:text-sm max-w-sm mt-2 leading-relaxed">
            The next-generation production-ready messaging platform with custom password credentials or Google Auth.
          </p>

          {/* Form Tabs */}
          <div className="flex w-full bg-slate-950/80 p-1 rounded-xl border border-slate-800/60 mt-6 mb-4">
            <button
              onClick={() => {
                setAuthMode('signin');
                setAuthError(null);
              }}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                authMode === 'signin' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => {
                setAuthMode('signup');
                setAuthError(null);
              }}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                authMode === 'signup' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Sign Up (Register)
            </button>
          </div>

          {/* Credentials Form */}
          <form onSubmit={handleCredentialsAuth} className="w-full space-y-3.5 text-left">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Username {authMode === 'signin' ? 'or Email' : ''}
              </label>
              <input
                type="text"
                required
                value={authUsername}
                onChange={(e) => setAuthUsername(e.target.value)}
                placeholder={authMode === 'signin' ? 'Enter username or email address' : 'letters, numbers, underscores only'}
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800/80 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all"
              />
            </div>

            {authMode === 'signup' && (
              <>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800/80 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Display Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={authDisplayName}
                    onChange={(e) => setAuthDisplayName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800/80 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <input
                type="password"
                required
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800/80 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all"
              />
            </div>

            {authError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 font-medium">
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={authSubmitting}
              className="w-full py-3 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-600/20 active:scale-[0.98] disabled:opacity-50"
            >
              {authSubmitting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <LogIn size={16} />
              )}
              {authMode === 'signin' ? 'Sign In with Password' : 'Create Free Account'}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 w-full my-5">
            <span className="h-[1px] bg-slate-800/80 flex-1" />
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">or</span>
            <span className="h-[1px] bg-slate-800/80 flex-1" />
          </div>

          {/* Google Sign-in */}
          <button
            onClick={handleGoogleLogin}
            className="w-full py-2.5 px-6 rounded-xl bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-200 font-semibold text-xs flex items-center justify-center gap-2.5 transition active:scale-[0.98]"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M12.24 10.285V14.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.859-3.579-7.859-8s3.53-8 7.859-8c2.46 0 4.105 1.025 5.047 1.926l3.227-3.107C18.29 1.18 15.48 0 12.24 0 5.58 0 0 5.37 0 12s5.58 12 12.24 12c6.96 0 11.57-4.89 11.57-11.79 0-.795-.085-1.4-.195-1.925H12.24z"
              />
            </svg>
            Continue with Google Sign-In
          </button>
        </div>
      </div>
    );
  }

  // Logged-in Core Messenger Layout
  return (
    <div id="app-workspace" className="fixed inset-0 bg-slate-950 flex overflow-hidden font-sans text-slate-100">
      {/* Sidebar - responsive behavior: visible by default on desktop, hidden on mobile if a chat is loaded */}
      <div className={`h-full ${activeChatId ? 'hidden md:block' : 'w-full'}`}>
        <Sidebar
          chats={chats}
          activeChatId={activeChatId}
          onSelectChat={setActiveChatId}
          currentUser={currentUser}
          onLogout={handleLogout}
          onOpenProfile={() => setIsProfileOpen(true)}
          onOpenNewChat={() => setIsNewChatOpen(true)}
          onOpenAdmin={() => setIsAdminOpen(true)}
          typingIndicators={typingIndicators}
        />
      </div>

      {/* Chat Area - responsive behavior: hidden by default on mobile unless a chat is selected */}
      <div className={`flex-1 h-full flex flex-col min-w-0 ${!activeChatId ? 'hidden md:flex' : 'w-full'}`}>
        <ChatArea
          chat={chats.find((c) => c.id === activeChatId) || null}
          messagesList={messages}
          currentUser={currentUser}
          onSendMessage={handleSendMessage}
          onBack={() => setActiveChatId(null)}
          socket={socket}
          token={token}
        />
      </div>

      {/* Profile Modal Overlay */}
      {isProfileOpen && (
        <ProfileModal
          onClose={() => setIsProfileOpen(false)}
          currentUser={currentUser}
          onUpdateProfile={handleUpdateProfile}
        />
      )}

      {/* Start New Conversation Modal Overlay */}
      {isNewChatOpen && (
        <NewChatModal
          onClose={() => setIsNewChatOpen(false)}
          usersList={usersList}
          onCreateChat={handleCreateChat}
        />
      )}

      {/* Admin Dashboard Page Overlay */}
      {isAdminOpen && (
        <AdminDashboard
          onClose={() => setIsAdminOpen(false)}
          token={token}
        />
      )}
    </div>
  );
}
