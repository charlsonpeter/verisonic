import React, { useState, useEffect } from 'react';
import { Users, Trash2, Shield, User as UserIcon, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const UsersManagement: React.FC = () => {
  const { token, currentUser } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/admin/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (e) {
      console.error("Failed to fetch users:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleRoleChange = async (userId: number, newRole: string) => {
    setMessage(null);
    try {
      const res = await fetch(`/api/auth/admin/users/${userId}/role?role=${newRole}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        setMessage({ type: 'success', text: `Role updated to "${newRole}" successfully!` });
        fetchUsers();
      } else {
        const data = await res.json();
        setMessage({ type: 'error', text: data.detail || 'Failed to update role.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Connection failed.' });
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!window.confirm("Are you sure you want to delete this user? All their tracks and playlists will be lost.")) {
      return;
    }
    setMessage(null);
    try {
      const res = await fetch(`/api/auth/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'User deleted successfully.' });
        fetchUsers();
      } else {
        const data = await res.json();
        setMessage({ type: 'error', text: data.detail || 'Failed to delete user.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Connection failed.' });
    }
  };

  return (
    <div className="space-y-8 w-full max-w-5xl">
      {/* Title */}
      <div>
        <h2 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
          <Users className="w-8 h-8 text-rose-400 animate-pulse" /> User Management
        </h2>
        <p className="text-sm text-slate-400 mt-1">Manage platform users, view artist requests, and assign roles.</p>
      </div>

      {message && (
        <div className={`p-4 rounded-xl text-xs flex items-center gap-2 font-semibold font-sans ${message.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-450' : 'bg-rose-500/10 border border-rose-500/20 text-rose-455'}`}>
          {message.text}
        </div>
      )}

      <div className="overflow-x-auto rounded-3xl border border-white/5 bg-slate-900/10 backdrop-blur-md">
        {isLoading ? (
          <p className="p-8 text-xs text-slate-500 text-center">Loading platform users...</p>
        ) : users.length === 0 ? (
          <p className="p-8 text-xs text-slate-500 text-center font-bold">No users found.</p>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/5 bg-slate-950/40 text-slate-400 uppercase font-bold tracking-wider">
                <th className="p-5">Name / Email</th>
                <th className="p-5">Current Role</th>
                <th className="p-5">Artist Request Details</th>
                <th className="p-5">Manage Role</th>
                <th className="p-5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-sans">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-900/20 transition">
                  <td className="p-5">
                    <div className="font-bold text-slate-200">{u.full_name || 'No Display Name'}</div>
                    <div className="text-[10px] text-slate-455 mt-0.5">{u.email}</div>
                  </td>
                  <td className="p-5">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase border ${
                      u.role === 'admin' 
                        ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' 
                        : u.role === 'studio_admin' 
                          ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400' 
                          : u.role === 'radio_admin'
                            ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                            : 'bg-slate-900 border-white/3 text-slate-505'
                    }`}>
                      {u.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="p-5 max-w-xs leading-relaxed">
                    {u.artist_profile ? (
                      <div className="bg-slate-950/45 p-3 border border-white/3 rounded-xl space-y-1">
                        <div className="font-bold text-slate-200 text-[10px] uppercase font-sans">Stage: {u.artist_profile.stage_name}</div>
                        <div className="text-[10px] text-slate-450 italic line-clamp-2">Bio: {u.artist_profile.bio || "No bio submitted."}</div>
                      </div>
                    ) : (
                      <span className="text-slate-650 italic">No request</span>
                    )}
                  </td>
                  <td className="p-5">
                    <select
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      disabled={u.id === currentUser?.id}
                      className="bg-slate-950 border border-white/5 text-[10px] p-2 rounded-xl outline-none focus:border-rose-500 text-rose-300 font-extrabold uppercase tracking-wide cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="listener" className="text-slate-300 bg-slate-950">Listener</option>
                      <option value="studio_admin" className="text-cyan-400 bg-slate-950">Studio Admin</option>
                      <option value="radio_admin" className="text-indigo-400 bg-slate-950">Radio Admin</option>
                      <option value="admin" className="text-rose-400 bg-slate-950">Admin</option>
                    </select>
                  </td>
                  <td className="p-5 text-center">
                    <button
                      onClick={() => handleDeleteUser(u.id)}
                      disabled={u.id === currentUser?.id}
                      className="p-2 bg-slate-900 border border-white/5 rounded-xl text-slate-500 hover:text-rose-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
                      title="Delete User"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
