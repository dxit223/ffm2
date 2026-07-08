import React, { useState, useEffect } from 'react';
import { User } from '../types.ts';
import { X, Search, MessageSquare, Users, Check, Plus } from 'lucide-react';

interface NewChatModalProps {
  onClose: () => void;
  usersList: User[];
  onCreateChat: (isGroup: boolean, name: string | null, recipientId: number | null, participantIds: number[] | null) => Promise<void>;
}

export default function NewChatModal({ onClose, usersList, onCreateChat }: NewChatModalProps) {
  const [activeTab, setActiveTab] = useState<'direct' | 'group'>('direct');
  const [searchQuery, setSearchQuery] = useState('');
  const [groupName, setGroupName] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter users based on search query
  const filteredUsers = usersList.filter(user =>
    user.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleToggleUser = (userId: number) => {
    if (selectedUserIds.includes(userId)) {
      setSelectedUserIds(selectedUserIds.filter(id => id !== userId));
    } else {
      setSelectedUserIds([...selectedUserIds, userId]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (activeTab === 'direct') {
        if (selectedUserIds.length !== 1) {
          setError('Please select a user to start a conversation.');
          setLoading(false);
          return;
        }
        await onCreateChat(false, null, selectedUserIds[0], null);
      } else {
        if (!groupName.trim()) {
          setError('Group name is required.');
          setLoading(false);
          return;
        }
        if (selectedUserIds.length === 0) {
          setError('Please select at least one participant.');
          setLoading(false);
          return;
        }
        await onCreateChat(true, groupName, null, selectedUserIds);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create chat. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="new-chat-modal-container" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div id="new-chat-modal" className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[550px]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
          <h3 className="text-lg font-semibold text-white font-display">New Conversation</h3>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-900">
          <button
            onClick={() => {
              setActiveTab('direct');
              setSelectedUserIds([]);
              setError(null);
            }}
            className={`flex-1 py-3 text-center text-sm font-medium border-b-2 flex items-center justify-center gap-2 transition ${
              activeTab === 'direct'
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/5'
            }`}
          >
            <MessageSquare size={16} />
            Direct Message
          </button>
          <button
            onClick={() => {
              setActiveTab('group');
              setSelectedUserIds([]);
              setError(null);
            }}
            className={`flex-1 py-3 text-center text-sm font-medium border-b-2 flex items-center justify-center gap-2 transition ${
              activeTab === 'group'
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/5'
            }`}
          >
            <Users size={16} />
            Group Chat
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          {error && (
            <div className="p-3 mx-4 mt-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-xs">
              {error}
            </div>
          )}

          {/* Group Name input (Group Tab only) */}
          {activeTab === 'group' && (
            <div className="p-4 pb-0">
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Group Name</label>
              <input
                type="text"
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                placeholder="Enter group subject..."
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 transition text-sm"
              />
            </div>
          )}

          {/* Search bar */}
          <div className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-slate-500" size={18} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search users by name or email..."
                className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 transition text-sm"
              />
            </div>
          </div>

          {/* Users List */}
          <div className="flex-1 overflow-y-auto px-4 divide-y divide-slate-800/50">
            <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider">
              {activeTab === 'direct' ? 'Select Recipient' : 'Select Group Members'}
            </label>
            {filteredUsers.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">
                No active users found.
              </div>
            ) : (
              filteredUsers.map(user => {
                const isSelected = selectedUserIds.includes(user.id);
                const isAI = user.displayName?.includes('🤖');
                return (
                  <div
                    key={user.id}
                    onClick={() => {
                      if (activeTab === 'direct') {
                        setSelectedUserIds([user.id]);
                      } else {
                        handleToggleUser(user.id);
                      }
                    }}
                    className={`flex items-center justify-between py-3 px-2 rounded-xl cursor-pointer hover:bg-slate-800/40 transition-colors ${
                      isSelected ? 'bg-indigo-500/10 border border-indigo-500/20' : 'border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        {user.photoURL ? (
                          <img
                            src={user.photoURL}
                            alt={user.displayName || 'User'}
                            className="w-10 h-10 rounded-full object-cover border border-slate-700"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-indigo-600/30 text-indigo-400 border border-slate-700 flex items-center justify-center font-bold text-sm">
                            {(user.displayName || user.email).charAt(0).toUpperCase()}
                          </div>
                        )}
                        {/* Status ring */}
                        <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-900 ${
                          user.status === 'online' ? 'bg-emerald-500' : user.status === 'away' ? 'bg-amber-500' : 'bg-slate-500'
                        }`} />
                      </div>
                      <div>
                        <div className="font-medium text-sm text-slate-200 flex items-center gap-1.5">
                          {user.displayName || user.email.split('@')[0]}
                          {isAI && (
                            <span className="px-1.5 py-0.5 bg-indigo-500/20 text-indigo-400 rounded-md text-[10px] font-semibold tracking-wider uppercase">
                              AI Assistant
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 truncate max-w-[200px]">{user.email}</div>
                      </div>
                    </div>

                    {/* Radio or Checkbox */}
                    <div className="flex items-center justify-center">
                      {activeTab === 'direct' ? (
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                          isSelected ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-slate-700'
                        }`}>
                          {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                        </div>
                      ) : (
                        <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition ${
                          isSelected ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-slate-700'
                        }`}>
                          {isSelected && <Check size={14} />}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer buttons */}
          <div className="p-4 border-t border-slate-800 flex gap-3 bg-slate-950">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 px-4 rounded-xl border border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-white transition font-medium text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || selectedUserIds.length === 0}
              className="flex-1 py-2 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition font-semibold text-sm flex items-center justify-center gap-1"
            >
              {loading ? 'Creating...' : activeTab === 'direct' ? 'Start Chat' : 'Create Group'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
