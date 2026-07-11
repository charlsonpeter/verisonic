import React, { useState, useEffect } from 'react';
import { Users, Trash2, Shield, Eye, Pencil, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { showConfirm } from '../utils/swal';

export const UsersManagement: React.FC = () => {
  const { token, currentUser } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Modal State
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editForm, setEditForm] = useState({
    fullName: '',
    email: '',
    role: '',
    subscription: '',
    subscriptionCycle: ''
  });

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

  const handleOpenModal = (user: any) => {
    setSelectedUser(user);
    setIsEditMode(false);
    setEditForm({
      fullName: user.full_name || '',
      email: user.email || '',
      role: user.role || 'listener',
      subscription: user.subscription || 'free',
      subscriptionCycle: user.subscription_cycle || 'monthly'
    });
  };

  const handleSaveUser = async () => {
    if (!selectedUser) return;
    setMessage(null);
    setIsLoading(true);
    try {
      // 1. Update basic details (email, full name) if changed
      if (editForm.fullName !== (selectedUser.full_name || '') || editForm.email !== selectedUser.email) {
        const detailsRes = await fetch(`/api/auth/admin/users/${selectedUser.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            full_name: editForm.fullName,
            email: editForm.email
          })
        });
        if (!detailsRes.ok) {
          const data = await detailsRes.json();
          setMessage({ type: 'error', text: data.detail || 'Failed to update user details.' });
          setIsLoading(false);
          return;
        }
      }

      // 2. Update role if changed
      if (editForm.role !== selectedUser.role) {
        const roleRes = await fetch(`/api/auth/admin/users/${selectedUser.id}/role?role=${editForm.role}`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!roleRes.ok) {
          const data = await roleRes.json();
          setMessage({ type: 'error', text: data.detail || 'Failed to update user role.' });
          setIsLoading(false);
          return;
        }
      }

      // 3. Update subscription if changed
      const currentSubCycle = selectedUser.subscription_cycle || '';
      const newSubCycle = editForm.subscription === 'premium' ? editForm.subscriptionCycle : '';

      if (editForm.subscription !== selectedUser.subscription || newSubCycle !== currentSubCycle) {
        let subUrl = `/api/auth/admin/users/${selectedUser.id}/subscription?subscription=${editForm.subscription}`;
        if (editForm.subscription === 'premium' && newSubCycle) {
          subUrl += `&subscription_cycle=${newSubCycle}`;
        }
        const subRes = await fetch(subUrl, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!subRes.ok) {
          const data = await subRes.json();
          setMessage({ type: 'error', text: data.detail || 'Failed to update subscription.' });
          setIsLoading(false);
          return;
        }
      }

      setMessage({ type: 'success', text: 'User details updated successfully!' });
      setSelectedUser(null);
      setIsEditMode(false);
      fetchUsers();
    } catch (e) {
      setMessage({ type: 'error', text: 'Connection failed.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteUser = async (userId: number) => {
    const confirmed = await showConfirm(
      "Delete User Account?",
      "Are you sure you want to delete this user? All their tracks and playlists will be lost.",
      "Yes, delete user"
    );
    if (!confirmed) return;
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
      <div className="hidden md:block">
        <h2 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
          <Users className="w-8 h-8 text-rose-400 animate-pulse" /> User Management
        </h2>
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
                <th className="p-5">Subscription</th>
                <th className="p-5">Artist Request Details</th>
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
                  <td className="p-5">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase border ${
                      ['premium', 'unlimited'].includes(u.subscription || '')
                        ? u.subscription === 'unlimited'
                          ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                          : 'bg-amber-500/10 border-amber-500/20 text-amber-455'
                        : 'bg-slate-900 border-white/3 text-slate-500'
                    }`}>
                      {u.subscription === 'premium' && u.subscription_cycle
                        ? `premium (${u.subscription_cycle})`
                        : (u.subscription || 'free')}
                    </span>
                  </td>
                  <td className="p-5 max-w-xs leading-relaxed">
                    {u.artist_profile ? (
                      <div className="bg-slate-950/45 p-3 border border-white/3 rounded-xl space-y-1">
                        <div className="font-bold text-slate-200 text-[10px] uppercase font-sans">Stage: {u.artist_profile.stage_name}</div>
                        <div className="text-[10px] text-slate-455 italic line-clamp-2">Bio: {u.artist_profile.bio || "No bio submitted."}</div>
                      </div>
                    ) : (
                      <span className="text-slate-650 italic">No request</span>
                    )}
                  </td>
                  <td className="p-5 text-center flex items-center justify-center gap-2">
                    <button
                      onClick={() => handleOpenModal(u)}
                      className="p-2 bg-slate-900 border border-white/5 rounded-xl text-slate-400 hover:text-emerald-450 transition cursor-pointer"
                      title="View & Edit User"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteUser(u.id)}
                      disabled={u.id === currentUser?.id}
                      className="p-2 bg-slate-900 border border-white/5 rounded-xl text-slate-500 hover:text-rose-500 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
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

      {/* Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-955/70 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-slate-900/90 border border-white/10 rounded-3xl w-full max-w-lg p-6 relative shadow-2xl space-y-6 overflow-hidden">
            {/* Ambient background blob */}
            <div className="absolute top-0 right-0 w-36 h-36 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-36 h-36 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/5 pb-4 relative z-10">
              <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-rose-455" />
                {isEditMode ? 'Edit User Profile' : 'User Information'}
              </h3>
              <div className="flex items-center gap-2">
                {!isEditMode && (
                  <button
                    onClick={() => setIsEditMode(true)}
                    className="p-1.5 bg-slate-800 border border-white/5 rounded-lg text-slate-450 hover:text-white transition cursor-pointer"
                    title="Edit Mode"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => setSelectedUser(null)}
                  className="p-1.5 bg-slate-800 border border-white/5 rounded-lg text-slate-455 hover:text-white transition cursor-pointer"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="space-y-4 relative z-10 font-sans">
              {isEditMode ? (
                // Edit Mode Form
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Full Name</label>
                    <input
                      type="text"
                      value={editForm.fullName}
                      onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                      className="w-full bg-slate-950/60 border border-white/5 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-rose-500 transition font-semibold"
                      placeholder="e.g. John Doe"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Email Address</label>
                    <input
                      type="email"
                      value={editForm.email}
                      onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                      className="w-full bg-slate-950/60 border border-white/5 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-rose-500 transition font-semibold"
                      placeholder="email@example.com"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Role Type</label>
                      <select
                        value={editForm.role}
                        onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                        disabled={selectedUser.id === currentUser?.id}
                        className="w-full bg-slate-950/60 border border-white/5 rounded-xl p-2 text-xs text-slate-200 outline-none focus:border-rose-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
                      >
                        <option value="listener">Listener</option>
                        <option value="studio_admin">Studio Admin</option>
                        <option value="radio_admin">Radio Admin</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Subscription Plan</label>
                      <select
                        value={editForm.subscription}
                        onChange={(e) => {
                          const subscription = e.target.value;
                          setEditForm({
                            ...editForm,
                            subscription,
                            subscriptionCycle: subscription === 'premium' ? editForm.subscriptionCycle : '',
                          });
                        }}
                        className="w-full bg-slate-950/60 border border-white/5 rounded-xl p-2 text-xs text-slate-200 outline-none focus:border-rose-500 cursor-pointer font-semibold"
                      >
                        <option value="free">Free</option>
                        <option value="premium">Premium Plan</option>
                        {currentUser?.role === 'admin' && (
                          <option value="unlimited">Unlimited</option>
                        )}
                      </select>
                    </div>

                    {editForm.subscription === 'premium' && (
                      <div className="col-span-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Billing Cycle</label>
                        <select
                          value={editForm.subscriptionCycle}
                          onChange={(e) => setEditForm({ ...editForm, subscriptionCycle: e.target.value })}
                          className="w-full bg-slate-950/60 border border-white/5 rounded-xl p-2 text-xs text-slate-200 outline-none focus:border-rose-500 cursor-pointer font-semibold"
                        >
                          <option value="monthly">Monthly Subscription</option>
                          <option value="yearly">Yearly Subscription</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                // View Mode
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-950/40 border border-white/3 p-3.5 rounded-2xl">
                      <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Full Name</span>
                      <span className="text-xs font-extrabold text-slate-200 block mt-1">{selectedUser.full_name || 'No Display Name'}</span>
                    </div>

                    <div className="bg-slate-950/40 border border-white/3 p-3.5 rounded-2xl">
                      <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Email Address</span>
                      <span className="text-xs font-extrabold text-slate-200 block mt-1 break-all">{selectedUser.email}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-950/40 border border-white/3 p-3.5 rounded-2xl">
                      <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Platform Role</span>
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase border mt-1.5 ${
                        selectedUser.role === 'admin' 
                          ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' 
                          : selectedUser.role === 'studio_admin' 
                            ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400' 
                            : selectedUser.role === 'radio_admin'
                              ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                              : 'bg-slate-900 border-white/3 text-slate-400'
                      }`}>
                        {selectedUser.role.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="bg-slate-955/40 border border-white/3 p-3.5 rounded-2xl">
                      <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Billing Tier</span>
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase border mt-1.5 ${
                        ['premium', 'unlimited'].includes(selectedUser.subscription || '')
                          ? selectedUser.subscription === 'unlimited'
                            ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                            : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                          : 'bg-slate-900 border-white/3 text-slate-400'
                      }`}>
                        {selectedUser.subscription === 'premium' && selectedUser.subscription_cycle
                          ? `premium (${selectedUser.subscription_cycle})`
                          : (selectedUser.subscription || 'free')}
                      </span>
                    </div>
                  </div>

                  {selectedUser.artist_profile && (
                    <div className="bg-slate-950/40 border border-white/3 p-4 rounded-2xl space-y-2">
                      <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Artist Profile Details</span>
                      <div>
                        <span className="text-[9px] text-slate-500 font-semibold block uppercase">Stage Name</span>
                        <span className="text-xs font-extrabold text-slate-200 block">{selectedUser.artist_profile.stage_name}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-500 font-semibold block uppercase">Biography</span>
                        <span className="text-xs font-semibold text-slate-400 italic block">{selectedUser.artist_profile.bio || "No biography provided."}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-white/5 pt-4 relative z-10">
              {isEditMode ? (
                <>
                  <button
                    onClick={() => setIsEditMode(false)}
                    className="px-4 py-2 border border-white/5 rounded-xl text-slate-400 hover:text-white text-xs font-bold transition uppercase tracking-wider cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveUser}
                    className="px-5 py-2 bg-gradient-to-r from-rose-500 to-rose-600 hover:scale-[1.02] active:scale-[0.98] text-white text-xs font-bold rounded-xl shadow-lg transition uppercase tracking-wider cursor-pointer"
                  >
                    Save Changes
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setSelectedUser(null)}
                  className="px-5 py-2 bg-slate-800 border border-white/5 rounded-xl text-slate-350 hover:text-white text-xs font-bold transition uppercase tracking-wider cursor-pointer"
                >
                  Close View
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
