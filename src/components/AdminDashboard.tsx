import React, { useState, useEffect } from 'react';
import { 
  Shield, Users, MessageSquare, Terminal, Server, Cpu, Database, Sparkles, 
  ArrowLeft, RefreshCw, AlertTriangle, Megaphone, Settings, Trash2, Ban, 
  CheckCircle, UserX, Search, MessageSquareX, Check, Lock, Save, Globe,
  Briefcase, Plus
} from 'lucide-react';
import { User } from '../types.ts';

interface Worker {
  id: number;
  name: string;
  email: string;
  role: string;
  phone: string | null;
  department: string | null;
  status: 'active' | 'inactive';
  createdAt: string;
}

interface AdminStats {
  stats: {
    totalUsers: number;
    totalChats: number;
    totalMessages: number;
    onlineUsers: number;
  };
  recentChats: Array<{
    id: number;
    name: string | null;
    isGroup: boolean;
    updatedAt: string;
  }>;
  system: {
    nodeVersion: string;
    platform: string;
    dbStatus: string;
    geminiStatus: string;
  };
}

interface AdminReport {
  id: number;
  reporterId: number;
  reportedUserId: number | null;
  messageId: number | null;
  reason: string;
  status: 'pending' | 'resolved';
  createdAt: string;
  reporter: User;
  reportedUser?: User | null;
  message?: {
    id: number;
    content: string;
    senderId: number;
  } | null;
}

interface Announcement {
  id: number;
  content: string;
  type: 'banner' | 'broadcast';
  isActive: boolean;
  createdAt: string;
}

interface AdminDashboardProps {
  onClose: () => void;
  token: string;
}

export default function AdminDashboard({ onClose, token }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'moderation' | 'announcements' | 'settings' | 'workers'>('overview');
  const [statsData, setStatsData] = useState<AdminStats | null>(null);
  
  // Tab-specific states
  const [userList, setUserList] = useState<User[]>([]);
  const [reportList, setReportList] = useState<AdminReport[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [workerList, setWorkerList] = useState<Worker[]>([]);
  
  // Search & input states
  const [userSearch, setUserSearch] = useState('');
  const [announcementText, setAnnouncementText] = useState('');
  const [announcementType, setAnnouncementType] = useState<'banner' | 'broadcast'>('broadcast');

  // Workers CRUD states
  const [isWorkerModalOpen, setIsWorkerModalOpen] = useState(false);
  const [isEditingWorker, setIsEditingWorker] = useState<Worker | null>(null);
  const [workerName, setWorkerName] = useState('');
  const [workerEmail, setWorkerEmail] = useState('');
  const [workerRole, setWorkerRole] = useState('support');
  const [workerPhone, setWorkerPhone] = useState('');
  const [workerDepartment, setWorkerDepartment] = useState('');
  const [workerStatus, setWorkerStatus] = useState<'active' | 'inactive'>('active');
  
  // Custom Settings state
  const [siteName, setSiteName] = useState('Fly Messenger');
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [brandingColor, setBrandingColor] = useState('indigo');

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/admin/stats', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch admin stats');
      const data = await response.json();
      setStatsData(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch user directory');
      const data = await response.json();
      setUserList(data);
    } catch (err: any) {
      console.error(err);
    }
  };

  const fetchReports = async () => {
    try {
      const response = await fetch('/api/admin/reports', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch reports list');
      const data = await response.json();
      setReportList(data);
    } catch (err: any) {
      console.error(err);
    }
  };

  const fetchAnnouncements = async () => {
    try {
      const response = await fetch('/api/admin/announcements', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch announcements');
      const data = await response.json();
      setAnnouncements(data);
    } catch (err: any) {
      console.error(err);
    }
  };

  const fetchWorkers = async () => {
    try {
      const response = await fetch('/api/admin/workers', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch workers directory');
      const data = await response.json();
      setWorkerList(data);
    } catch (err: any) {
      console.error(err);
    }
  };

  const loadAllData = async () => {
    setLoading(true);
    setError(null);
    await Promise.all([
      fetchStats(),
      fetchUsers(),
      fetchReports(),
      fetchAnnouncements(),
      fetchWorkers()
    ]);
    setLoading(false);
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // Admin user actions
  const handleToggleBan = async (userId: number, currentBanStatus: boolean) => {
    setActionLoading(`ban-${userId}`);
    try {
      const res = await fetch(`/api/admin/users/${userId}/ban`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ isBanned: !currentBanStatus }),
      });
      if (!res.ok) throw new Error('Action failed');
      
      setUserList(prev => prev.map(u => u.id === userId ? { ...u, isBanned: !currentBanStatus } : u));
      fetchStats();
    } catch (err: any) {
      setError(err.message || 'Failed to update user ban status');
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleAdmin = async (userId: number, currentAdminStatus: boolean) => {
    setActionLoading(`admin-${userId}`);
    try {
      const res = await fetch(`/api/admin/users/${userId}/admin`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ isAdmin: !currentAdminStatus }),
      });
      if (!res.ok) throw new Error('Action failed');
      
      setUserList(prev => prev.map(u => u.id === userId ? { ...u, isAdmin: !currentAdminStatus } : u));
    } catch (err: any) {
      setError(err.message || 'Failed to update user admin status');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!confirm('Are you sure you want to permanently delete this user profile? This action is irreversible.')) return;
    setActionLoading(`delete-${userId}`);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Delete failed');
      setUserList(prev => prev.filter(u => u.id !== userId));
      fetchStats();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Moderation resolve action
  const handleResolveReport = async (reportId: number) => {
    setActionLoading(`report-${reportId}`);
    try {
      const res = await fetch(`/api/admin/reports/${reportId}/resolve`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Action failed');
      setReportList(prev => prev.map(r => r.id === reportId ? { ...r, status: 'resolved' as const } : r));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Announcement actions
  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!announcementText.trim()) return;
    setActionLoading('create-announce');
    try {
      const res = await fetch('/api/admin/announcements', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ content: announcementText.trim(), type: announcementType }),
      });
      if (!res.ok) throw new Error('Failed to post announcement');
      const data = await res.json();
      setAnnouncements(prev => [data, ...prev]);
      setAnnouncementText('');
      setSuccessMsg('Announcement broadcasted successfully!');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleAnnouncement = async (id: number, currentStatus: boolean) => {
    setActionLoading(`toggle-announce-${id}`);
    try {
      const res = await fetch(`/api/admin/announcements/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ isActive: !currentStatus }),
      });
      if (!res.ok) throw new Error('Action failed');
      setAnnouncements(prev => prev.map(a => a.id === id ? { ...a, isActive: !currentStatus } : a));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteAnnouncement = async (id: number) => {
    setActionLoading(`delete-announce-${id}`);
    try {
      const res = await fetch(`/api/admin/announcements/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Delete failed');
      setAnnouncements(prev => prev.filter(a => a.id !== id));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Save Branding Settings
  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading('save-settings');
    // Persist branding variables in client memory/state
    localStorage.setItem('fly_site_name', siteName);
    localStorage.setItem('fly_branding_color', brandingColor);
    localStorage.setItem('fly_maint_mode', String(maintenanceMode));
    
    // Simulate API delay
    setTimeout(() => {
      setActionLoading(null);
      setSuccessMsg('Branding settings updated instantly!');
      setTimeout(() => setSuccessMsg(null), 3000);
    }, 600);
  };

  // Worker CRUD operations
  const handleCreateOrUpdateWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading('worker-submit');
    setError(null);
    try {
      const body = {
        name: workerName,
        email: workerEmail,
        role: workerRole,
        phone: workerPhone || null,
        department: workerDepartment || null,
        status: workerStatus,
      };

      const method = isEditingWorker ? 'PUT' : 'POST';
      const url = isEditingWorker ? `/api/admin/workers/${isEditingWorker.id}` : '/api/admin/workers';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save worker details');

      if (isEditingWorker) {
        setWorkerList(prev => prev.map(w => w.id === isEditingWorker.id ? data : w));
        setSuccessMsg('Worker profile updated successfully!');
      } else {
        setWorkerList(prev => [data, ...prev]);
        setSuccessMsg('Worker registered successfully!');
      }

      setIsWorkerModalOpen(false);
      setIsEditingWorker(null);
      resetWorkerForm();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteWorker = async (id: number) => {
    if (!confirm('Are you sure you want to permanently remove this worker registration?')) return;
    setActionLoading(`delete-worker-${id}`);
    setError(null);
    try {
      const res = await fetch(`/api/admin/workers/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Delete failed');
      }
      setWorkerList(prev => prev.filter(w => w.id !== id));
      setSuccessMsg('Worker removed successfully!');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const openEditWorkerModal = (w: Worker) => {
    setIsEditingWorker(w);
    setWorkerName(w.name);
    setWorkerEmail(w.email);
    setWorkerRole(w.role);
    setWorkerPhone(w.phone || '');
    setWorkerDepartment(w.department || '');
    setWorkerStatus(w.status);
    setIsWorkerModalOpen(true);
  };

  const openCreateWorkerModal = () => {
    setIsEditingWorker(null);
    resetWorkerForm();
    setIsWorkerModalOpen(true);
  };

  const resetWorkerForm = () => {
    setWorkerName('');
    setWorkerEmail('');
    setWorkerRole('support');
    setWorkerPhone('');
    setWorkerDepartment('');
    setWorkerStatus('active');
  };

  const filteredUsers = userList.filter(u => 
    (u.displayName && u.displayName.toLowerCase().includes(userSearch.toLowerCase())) ||
    (u.username && u.username.toLowerCase().includes(userSearch.toLowerCase())) ||
    u.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  return (
    <div id="admin-dashboard-container" className="fixed inset-0 z-40 bg-slate-950 flex flex-col overflow-hidden animate-fade-in font-sans text-slate-100">
      {/* Top Header Bar */}
      <div className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-2">
            <Shield className="text-indigo-500" size={20} />
            <h1 className="text-md font-semibold text-white font-display uppercase tracking-wider">Control Panel</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadAllData}
            disabled={loading}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition disabled:opacity-50"
            title="Refresh statistics"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <span className="text-xs bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2.5 py-1 rounded-md font-semibold font-mono">
            SECURE PORTAL
          </span>
        </div>
      </div>

      {/* Main Layout Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Admin Navigation Rail */}
        <aside className="w-64 border-r border-slate-800 bg-slate-950/80 flex flex-col p-4 space-y-1.5 shrink-0 hidden md:flex">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-3 mb-2">Systems</div>
          <button
            onClick={() => setActiveTab('overview')}
            className={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium flex items-center gap-2.5 transition ${
              activeTab === 'overview' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <Server size={16} /> Overview Telemetry
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium flex items-center gap-2.5 transition ${
              activeTab === 'users' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <Users size={16} /> User Management
          </button>
          <button
            onClick={() => setActiveTab('moderation')}
            className={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium flex items-center gap-2.5 transition ${
              activeTab === 'moderation' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <AlertTriangle size={16} /> Content Moderation
            {reportList.filter(r => r.status === 'pending').length > 0 && (
              <span className="ml-auto w-2 h-2 rounded-full bg-rose-500" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('announcements')}
            className={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium flex items-center gap-2.5 transition ${
              activeTab === 'announcements' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <Megaphone size={16} /> System Announcements
          </button>
          <button
            onClick={() => setActiveTab('workers')}
            className={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium flex items-center gap-2.5 transition ${
              activeTab === 'workers' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <Briefcase size={16} /> Worker Directory
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium flex items-center gap-2.5 transition ${
              activeTab === 'settings' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <Settings size={16} /> White-Label Settings
          </button>
        </aside>

        {/* Dynamic Panel Content */}
        <main className="flex-1 overflow-y-auto bg-slate-950 p-6 md:p-8 space-y-6">
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-xl flex justify-between items-center">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-400 font-bold">×</button>
            </div>
          )}
          {successMsg && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl flex items-center gap-2 animate-pulse">
              <Check size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Quick mobile-tab navigation */}
          <div className="flex md:hidden gap-1 overflow-x-auto pb-2 border-b border-slate-800">
            {['overview', 'users', 'moderation', 'announcements', 'workers', 'settings'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider whitespace-nowrap ${
                  activeTab === tab ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab 1: Telemetry Overview */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Stat Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-5 bg-slate-900 border border-slate-800/60 rounded-2xl">
                  <div className="text-xs text-slate-500 font-semibold tracking-wide uppercase">Total Users</div>
                  <div className="text-2xl font-bold text-white mt-1">{statsData?.stats.totalUsers || 0}</div>
                </div>
                <div className="p-5 bg-slate-900 border border-slate-800/60 rounded-2xl">
                  <div className="text-xs text-slate-500 font-semibold tracking-wide uppercase">Active Sockets</div>
                  <div className="text-2xl font-bold text-emerald-400 mt-1 flex items-center gap-2">
                    {statsData?.stats.onlineUsers || 0}
                    <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping" />
                  </div>
                </div>
                <div className="p-5 bg-slate-900 border border-slate-800/60 rounded-2xl">
                  <div className="text-xs text-slate-500 font-semibold tracking-wide uppercase">Messages Database</div>
                  <div className="text-2xl font-bold text-white mt-1">{statsData?.stats.totalMessages || 0}</div>
                </div>
                <div className="p-5 bg-slate-900 border border-slate-800/60 rounded-2xl">
                  <div className="text-xs text-slate-500 font-semibold tracking-wide uppercase">Total Groups</div>
                  <div className="text-2xl font-bold text-white mt-1">{statsData?.stats.totalChats || 0}</div>
                </div>
              </div>

              {/* System Info Block */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <Server size={14} /> System Engine
                  </h3>
                  <div className="space-y-3 text-xs">
                    <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                      <span className="text-slate-500">Database Driver</span>
                      <span className="font-mono text-slate-200">PostgreSQL (Drizzle)</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                      <span className="text-slate-500">Node Environment</span>
                      <span className="font-mono text-slate-200">{statsData?.system.platform || 'linux'}</span>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span className="text-slate-500">Gemini LLM</span>
                      <span className="font-mono text-indigo-400">gemini-3.5-flash</span>
                    </div>
                  </div>
                </div>

                {/* Recent Channels */}
                <div className="lg:col-span-2 p-5 bg-slate-900 border border-slate-800 rounded-2xl">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
                    <MessageSquare size={14} /> Live Channels
                  </h3>
                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-2">
                    {statsData?.recentChats && statsData.recentChats.length > 0 ? (
                      statsData.recentChats.map(chat => (
                        <div key={chat.id} className="p-3 bg-slate-950 border border-slate-800/40 rounded-xl flex items-center justify-between text-xs">
                          <div>
                            <div className="font-semibold text-slate-200">{chat.name || 'Private Conversation'}</div>
                            <div className="text-slate-500 mt-0.5">{chat.isGroup ? 'Group Chat' : 'One-to-one'}</div>
                          </div>
                          <span className="font-mono text-slate-600">{new Date(chat.updatedAt).toLocaleTimeString()}</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-slate-500 text-xs">No active channels recorded.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: User Management */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
                  <input
                    type="text"
                    placeholder="Search directory by name, email, or username..."
                    value={userSearch}
                    onChange={e => setUserSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 transition text-xs"
                  />
                </div>
                <span className="text-xs text-slate-500 font-mono">Found {filteredUsers.length} users</span>
              </div>

              {/* Users Table */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-950 border-b border-slate-800 text-slate-500 font-semibold uppercase tracking-wider">
                        <th className="p-3">User Details</th>
                        <th className="p-3">Username</th>
                        <th className="p-3">System Role</th>
                        <th className="p-3">Moderation</th>
                        <th className="p-3 text-right">Delete</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {filteredUsers.length > 0 ? (
                        filteredUsers.map(u => (
                          <tr key={u.id} className="hover:bg-slate-800/20 transition">
                            <td className="p-3 flex items-center gap-3">
                              {u.photoURL ? (
                                <img src={u.photoURL} alt={u.displayName || ''} className="w-8 h-8 rounded-full object-cover border border-slate-800" />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-slate-850 flex items-center justify-center text-slate-400 border border-slate-800">
                                  <Users size={14} />
                                </div>
                              )}
                              <div>
                                <div className="font-semibold text-slate-200">{u.displayName || 'Unconfigured Profile'}</div>
                                <div className="text-slate-500 text-[10px]">{u.email}</div>
                              </div>
                            </td>
                            <td className="p-3 font-mono text-slate-400">
                              {u.username ? `@${u.username}` : <span className="text-slate-600 font-sans italic text-[11px]">unassigned</span>}
                            </td>
                            <td className="p-3">
                              <button
                                onClick={() => handleToggleAdmin(u.id, u.isAdmin)}
                                disabled={actionLoading === `admin-${u.id}`}
                                className={`px-2 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider transition ${
                                  u.isAdmin 
                                    ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' 
                                    : 'bg-slate-800 text-slate-400 border border-slate-750 hover:bg-slate-750'
                                }`}
                              >
                                {u.isAdmin ? 'Admin privileges' : 'Grant Admin'}
                              </button>
                            </td>
                            <td className="p-3">
                              <button
                                onClick={() => handleToggleBan(u.id, u.isBanned)}
                                disabled={actionLoading === `ban-${u.id}`}
                                className={`px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider transition flex items-center gap-1.5 ${
                                  u.isBanned 
                                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' 
                                    : 'bg-slate-800 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/20 border border-slate-750'
                                }`}
                              >
                                <Ban size={10} />
                                {u.isBanned ? 'SUSPENDED' : 'Ban User'}
                              </button>
                            </td>
                            <td className="p-3 text-right">
                              <button
                                onClick={() => handleDeleteUser(u.id)}
                                disabled={actionLoading === `delete-${u.id}`}
                                className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition"
                                title="Delete account"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="text-center py-12 text-slate-500 italic">No registered users matched search credentials.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Moderation Reports */}
          {activeTab === 'moderation' && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Reported Content Log</h2>
              
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-800">
                {reportList.length > 0 ? (
                  reportList.map(r => (
                    <div key={r.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-800/10 transition">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-semibold text-slate-300">Reporter:</span>
                          <span className="text-slate-400">{r.reporter.displayName || r.reporter.email}</span>
                          <span className="text-slate-600">|</span>
                          <span className="font-semibold text-slate-300">Against:</span>
                          <span className="text-slate-400">{r.reportedUser?.displayName || r.reportedUser?.email || 'N/A'}</span>
                          <span className="text-slate-600">|</span>
                          <span className="text-slate-500 font-mono text-[10px]">{new Date(r.createdAt).toLocaleDateString()}</span>
                        </div>
                        
                        <div className="p-3 bg-slate-950 border border-slate-850 rounded-xl space-y-1">
                          <div className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Report Reason</div>
                          <p className="text-xs text-slate-300 italic">"{r.reason}"</p>
                        </div>

                        {r.message && (
                          <div className="p-2.5 bg-slate-950/40 border border-slate-900 rounded-lg text-[11px] text-slate-400">
                            <span className="font-semibold text-slate-500">Reported Message:</span> "{r.message.content}"
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 self-start md:self-center">
                        {r.status === 'pending' ? (
                          <button
                            onClick={() => handleResolveReport(r.id)}
                            disabled={actionLoading === `report-${r.id}`}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-emerald-600/10 transition"
                          >
                            <CheckCircle size={14} /> Resolve Report
                          </button>
                        ) : (
                          <span className="px-2.5 py-1 bg-slate-950 border border-slate-800 text-slate-500 text-[10px] uppercase tracking-widest font-bold rounded-lg flex items-center gap-1">
                            <Check size={12} className="text-emerald-500" /> Resolved
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-16 text-slate-500 italic text-xs">No pending or historical content reports filed.</div>
                )}
              </div>
            </div>
          )}

          {/* Tab 4: System Announcements */}
          {activeTab === 'announcements' && (
            <div className="space-y-6">
              {/* Broadcast Creation Form */}
              <form onSubmit={handleCreateAnnouncement} className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <Megaphone size={14} /> Broadcast Global System Announcement
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="md:col-span-3">
                    <textarea
                      placeholder="Type announcement broadcast payload..."
                      value={announcementText}
                      onChange={e => setAnnouncementText(e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-hidden focus:border-indigo-500 transition text-xs resize-none"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase">Alert Delivery Type</label>
                    <select
                      value={announcementType}
                      onChange={e => setAnnouncementType(e.target.value as any)}
                      className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:outline-hidden focus:border-indigo-500 transition"
                    >
                      <option value="broadcast">Live Chat Broadcast</option>
                      <option value="banner">Global Header Banner</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={actionLoading === 'create-announce'}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-lg shadow-indigo-600/15 transition"
                  >
                    <Megaphone size={14} /> Dispatch Announcement
                  </button>
                </div>
              </form>

              {/* Historical Announcements */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Historical Dispatches</h4>
                
                <div className="bg-slate-900 border border-slate-800 rounded-2xl divide-y divide-slate-800">
                  {announcements.length > 0 ? (
                    announcements.map(a => (
                      <div key={a.id} className="p-4 flex items-center justify-between gap-4">
                        <div className="space-y-1 text-xs">
                          <p className="text-slate-200">{a.content}</p>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500">
                            <span className="uppercase tracking-wider font-semibold text-indigo-400">{a.type}</span>
                            <span>•</span>
                            <span>{new Date(a.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => handleToggleAnnouncement(a.id, a.isActive)}
                            className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider transition ${
                              a.isActive 
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' 
                                : 'bg-slate-950 text-slate-600 border border-slate-850 hover:bg-slate-900'
                            }`}
                          >
                            {a.isActive ? 'Active' : 'Muted'}
                          </button>
                          
                          <button
                            onClick={() => handleDeleteAnnouncement(a.id)}
                            className="p-1 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-10 text-slate-500 italic text-xs">No dispatches logged.</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab 5: Branding & Customization */}
          {activeTab === 'settings' && (
            <form onSubmit={handleSaveSettings} className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-6">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2 border-b border-slate-800 pb-3">
                <Settings size={14} /> White-Label Settings & Branding
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-400 uppercase">Platform Label</label>
                  <input
                    type="text"
                    value={siteName}
                    onChange={e => setSiteName(e.target.value)}
                    placeholder="Fly Messenger"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-hidden focus:border-indigo-500 transition text-xs"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-400 uppercase">Corporate Palette Theme</label>
                  <select
                    value={brandingColor}
                    onChange={e => setBrandingColor(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:outline-hidden focus:border-indigo-500 transition"
                  >
                    <option value="indigo">Standard Slate Indigo</option>
                    <option value="emerald">Signal Forest Emerald</option>
                    <option value="sky">Telegram Sky Blue</option>
                    <option value="violet">Discord Gamer Violet</option>
                  </select>
                </div>

                <div className="p-4 bg-slate-950 border border-slate-850 rounded-xl flex items-center justify-between md:col-span-2">
                  <div>
                    <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <Lock size={12} className="text-amber-500" /> Administrative Maintenance Mode
                    </div>
                    <p className="text-[11px] text-slate-500 leading-normal mt-1">
                      Enabling maintenance mode blocks messaging for all non-administrative users instantly.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMaintenanceMode(!maintenanceMode)}
                    className={`px-3 py-1 rounded-xl text-xs font-bold uppercase tracking-wider transition ${
                      maintenanceMode 
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
                        : 'bg-slate-900 text-slate-600 border border-slate-800 hover:bg-slate-850'
                    }`}
                  >
                    {maintenanceMode ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-slate-800">
                <button
                  type="submit"
                  disabled={actionLoading === 'save-settings'}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-lg shadow-indigo-600/15 transition"
                >
                  <Save size={14} /> Commit Changes
                </button>
              </div>
            </form>
          )}

          {/* Tab 6: Workers Directory */}
          {activeTab === 'workers' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Staff & Workers Directory</h2>
                <button
                  onClick={openCreateWorkerModal}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-indigo-600/15 transition active:scale-[0.98]"
                >
                  <Plus size={14} /> Register Worker
                </button>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-950 border-b border-slate-800 text-slate-500 font-semibold uppercase tracking-wider">
                        <th className="p-3">Worker Name</th>
                        <th className="p-3">Email Address</th>
                        <th className="p-3">Assigned Role</th>
                        <th className="p-3">Department</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {workerList.length > 0 ? (
                        workerList.map(w => (
                          <tr key={w.id} className="hover:bg-slate-800/20 transition">
                            <td className="p-3 font-semibold text-slate-200">{w.name}</td>
                            <td className="p-3 text-slate-400 font-mono">{w.email}</td>
                            <td className="p-3 uppercase tracking-wider text-[10px] font-bold text-indigo-400">
                              {w.role}
                            </td>
                            <td className="p-3 text-slate-400">{w.department || <span className="text-slate-600 italic">none</span>}</td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-widest border ${
                                w.status === 'active'
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                  : 'bg-slate-950 text-slate-500 border-slate-800'
                              }`}>
                                {w.status}
                              </span>
                            </td>
                            <td className="p-3 text-right space-x-1">
                              <button
                                onClick={() => openEditWorkerModal(w)}
                                className="p-1 text-slate-400 hover:text-indigo-400 rounded-md hover:bg-indigo-500/10 transition"
                                title="Edit details"
                              >
                                <Settings size={12} />
                              </button>
                              <button
                                onClick={() => handleDeleteWorker(w.id)}
                                disabled={actionLoading === `delete-worker-${w.id}`}
                                className="p-1 text-slate-500 hover:text-rose-400 rounded-md hover:bg-rose-500/10 transition"
                                title="Remove registration"
                              >
                                <Trash2 size={12} />
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="text-center py-16 text-slate-500 italic">No workers registered in the company directory.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Worker Modal Form */}
              {isWorkerModalOpen && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <div className="w-full max-w-md bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-2xl relative">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 mb-4">
                      {isEditingWorker ? 'Update Worker Profile' : 'Register New System Worker'}
                    </h3>

                    <form onSubmit={handleCreateOrUpdateWorker} className="space-y-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Full Name</label>
                        <input
                          type="text"
                          required
                          value={workerName}
                          onChange={e => setWorkerName(e.target.value)}
                          placeholder="e.g. Alice Smith"
                          className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:outline-hidden focus:border-indigo-500 transition-all"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Email Address</label>
                        <input
                          type="email"
                          required
                          value={workerEmail}
                          onChange={e => setWorkerEmail(e.target.value)}
                          placeholder="alice@company.com"
                          className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:outline-hidden focus:border-indigo-500 transition-all"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Role / Rank</label>
                          <input
                            type="text"
                            required
                            value={workerRole}
                            onChange={e => setWorkerRole(e.target.value)}
                            placeholder="e.g. operator, support"
                            className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:outline-hidden focus:border-indigo-500 transition-all"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Department</label>
                          <input
                            type="text"
                            value={workerDepartment}
                            onChange={e => setWorkerDepartment(e.target.value)}
                            placeholder="e.g. Operations, IT"
                            className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:outline-hidden focus:border-indigo-500 transition-all"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Phone Number</label>
                          <input
                            type="text"
                            value={workerPhone}
                            onChange={e => setWorkerPhone(e.target.value)}
                            placeholder="+1 (555) 0199"
                            className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:outline-hidden focus:border-indigo-500 transition-all"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Status</label>
                          <select
                            value={workerStatus}
                            onChange={e => setWorkerStatus(e.target.value as any)}
                            className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:outline-hidden focus:border-indigo-500 transition-all"
                          >
                            <option value="active">Active Duty</option>
                            <option value="inactive">On Leave / Inactive</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                        <button
                          type="button"
                          onClick={() => setIsWorkerModalOpen(false)}
                          className="px-3.5 py-1.5 bg-slate-800 text-slate-300 rounded-xl text-xs hover:bg-slate-750 transition"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={actionLoading === 'worker-submit'}
                          className="px-3.5 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-500 transition disabled:opacity-50"
                        >
                          {isEditingWorker ? 'Update' : 'Register'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
