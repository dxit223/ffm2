import React, { useState } from 'react';
import { User } from '../types.ts';
import { X, User as UserIcon, Camera, Check, UploadCloud } from 'lucide-react';

interface ProfileModalProps {
  onClose: () => void;
  currentUser: User;
  onUpdateProfile: (data: { displayName?: string; photoURL?: string; status?: 'online' | 'away' | 'offline'; username?: string; bio?: string }) => Promise<void>;
}

export default function ProfileModal({ onClose, currentUser, onUpdateProfile }: ProfileModalProps) {
  const [displayName, setDisplayName] = useState(currentUser.displayName || '');
  const [username, setUsername] = useState(currentUser.username || '');
  const [bio, setBio] = useState(currentUser.bio || '');
  const [photoURL, setPhotoURL] = useState(currentUser.photoURL || '');
  const [status, setStatus] = useState<'online' | 'away' | 'offline'>(currentUser.status);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result as string;
        try {
          const res = await fetch('/api/upload', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('fly_token')}`,
            },
            body: JSON.stringify({
              name: file.name,
              type: file.type,
              data: base64String,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Upload failed');
          setPhotoURL(data.url);
        } catch (err: any) {
          setError(err.message || 'File upload failed');
        } finally {
          setUploading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setError('Failed to read file');
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSuccess(false);
    setError(null);

    // Validate username if provided
    const cleanUsername = username.trim().toLowerCase();
    if (cleanUsername && !/^[a-zA-Z0-9_]{3,15}$/.test(cleanUsername)) {
      setError('Username must be 3-15 characters and contain only letters, numbers, and underscores.');
      setLoading(false);
      return;
    }

    try {
      await onUpdateProfile({
        displayName: displayName.trim() || null,
        photoURL: photoURL.trim() || null,
        status,
        username: cleanUsername || null,
        bio: bio.trim() || null,
      });
      setSuccess(true);
      setTimeout(() => onClose(), 1200);
    } catch (err: any) {
      setError(err.message || 'Failed to update profile.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="profile-modal-container" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div id="profile-modal" className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
          <h3 className="text-lg font-semibold text-white font-display">My Profile Settings</h3>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[80vh]">
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-xs">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-xs flex items-center gap-2">
              <Check size={16} />
              Profile updated successfully!
            </div>
          )}

          {/* Avatar preview and Upload */}
          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="relative group">
              {photoURL ? (
                <img
                  src={photoURL}
                  alt={displayName || currentUser.email}
                  className="w-24 h-24 rounded-full object-cover border-2 border-indigo-500 shadow-lg"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-slate-850 text-slate-400 border-2 border-slate-700 flex items-center justify-center">
                  <UserIcon size={44} />
                </div>
              )}
              <label className="absolute bottom-0 right-0 p-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-full text-white cursor-pointer shadow-lg transition">
                <Camera size={16} />
                <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
            {uploading ? (
              <span className="text-xs text-indigo-400 animate-pulse">Uploading photo...</span>
            ) : (
              <span className="text-xs text-slate-500">Click camera icon to change profile photo</span>
            )}
            <div className="text-xs text-slate-500">{currentUser.email}</div>
          </div>

          {/* Username Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="e.g. janesmith (no spaces)"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-hidden focus:border-indigo-500 transition text-sm"
            />
          </div>

          {/* Display Name Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Your full name"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-hidden focus:border-indigo-500 transition text-sm"
              required
            />
          </div>

          {/* Bio Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">About / Bio</label>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value)}
              placeholder="Tell other users about yourself..."
              rows={3}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-hidden focus:border-indigo-500 transition text-sm resize-none"
            />
          </div>

          {/* Status selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">My Status</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setStatus('online')}
                className={`py-2 px-3 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition ${
                  status === 'online'
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-900'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Online
              </button>
              <button
                type="button"
                onClick={() => setStatus('away')}
                className={`py-2 px-3 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition ${
                  status === 'away'
                    ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-900'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                Away
              </button>
              <button
                type="button"
                onClick={() => setStatus('offline')}
                className={`py-2 px-3 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition ${
                  status === 'offline'
                    ? 'border-slate-600 bg-slate-700/10 text-slate-400'
                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-900'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-slate-500" />
                Offline
              </button>
            </div>
          </div>

          {/* Footer Save Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading || uploading}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition shadow-lg shadow-indigo-600/20"
            >
              {loading ? 'Saving Changes...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
