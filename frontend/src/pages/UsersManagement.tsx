import React, { useState, useEffect } from 'react';
import { SubscriptionDates } from '../components/subscription/SubscriptionDates';
import { AppModal } from '../components/shared/AppModal';
import { Users, Trash2, Eye, Pencil, Mail, Shield, Crown, Sparkles, UserCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { showConfirm } from '../utils/swal';
import { TableSkeleton, UserCardSkeleton } from '../components/shared/skeleton';

const roleBadgeClass = (role: string) => {
  switch (role) {
    case 'admin':
      return 'bg-rose-500/15 border-rose-500/25 text-rose-300';
    case 'studio_admin':
      return 'bg-cyan-500/15 border-cyan-500/25 text-cyan-300';
    case 'radio_admin':
      return 'bg-indigo-500/15 border-indigo-500/25 text-indigo-300';
    default:
      return 'bg-slate-800/80 border-white/10 text-slate-300';
  }
};

const subscriptionBadgeClass = (subscription: string) => {
  if (subscription === 'unlimited') return 'bg-rose-500/15 border-rose-500/25 text-rose-300';
  if (subscription === 'premium') return 'bg-amber-500/15 border-amber-500/25 text-amber-300';
  return 'bg-slate-800/80 border-white/10 text-slate-400';
};

const formatRoleLabel = (role: string) => role.replace(/_/g, ' ');

const formatSubscriptionLabel = (subscription: string, cycle?: string | null) => {
  if (subscription === 'premium' && cycle) return `Premium · ${cycle}`;
  if (subscription === 'unlimited') return 'Unlimited';
  return subscription || 'free';
};

const getUserInitials = (fullName?: string | null, email?: string) => {
  const source = (fullName || email || '?').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
};

const parseUpgradeRequest = (bio?: string | null) => {
  if (!bio) return null;
  const match = bio.match(/\[Requesting (Studio Admin|Radio Admin) Role\]/i);
  if (!match) return null;
  return match[1];
};

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

  const closeUserModal = () => {
    setSelectedUser(null);
    setIsEditMode(false);
  };

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
      subscription: user.role === 'admin' ? 'unlimited' : (user.subscription || 'free'),
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
      closeUserModal();
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

      <div className="hidden md:block overflow-x-auto rounded-3xl border border-white/5 bg-slate-900/10 backdrop-blur-md">
        {isLoading ? (
          <TableSkeleton rows={6} variant="users" />
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

      {/* Mobile card list */}
      <div className="md:hidden space-y-3">
        {isLoading ? (
          <UserCardSkeleton count={4} />
        ) : users.length === 0 ? (
          <p className="p-8 text-xs text-slate-500 text-center font-bold">No users found.</p>
        ) : (
          users.map((u) => (
            <div
              key={u.id}
              className="rounded-2xl border border-white/5 bg-slate-900/20 p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-slate-200 truncate">{u.full_name || 'No Display Name'}</div>
                  <div className="text-[10px] text-slate-455 truncate mt-0.5">{u.email}</div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => handleOpenModal(u)}
                    className="p-2 bg-slate-900 border border-white/5 rounded-xl text-slate-400 active:text-emerald-450 transition cursor-pointer"
                    title="View & Edit User"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteUser(u.id)}
                    disabled={u.id === currentUser?.id}
                    className="p-2 bg-slate-900 border border-white/5 rounded-xl text-slate-500 active:text-rose-500 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
                    title="Delete User"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase border ${roleBadgeClass(u.role)}`}>
                  {formatRoleLabel(u.role)}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase border ${subscriptionBadgeClass(u.subscription || 'free')}`}>
                  {formatSubscriptionLabel(u.subscription, u.subscription_cycle)}
                </span>
              </div>

              {u.artist_profile ? (
                <div className="bg-slate-950/45 p-3 border border-white/3 rounded-xl space-y-1">
                  <div className="font-bold text-slate-200 text-[10px] uppercase font-sans">
                    Stage: {u.artist_profile.stage_name}
                  </div>
                  <div className="text-[10px] text-slate-455 italic line-clamp-2">
                    Bio: {u.artist_profile.bio || 'No bio submitted.'}
                  </div>
                </div>
              ) : (
                <p className="text-[10px] text-slate-650 italic">No artist request</p>
              )}
            </div>
          ))
        )}
      </div>

      <AppModal
        open={!!selectedUser}
        onClose={closeUserModal}
        maxWidth="xl"
        header={selectedUser ? (
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-rose-500/25 to-indigo-500/25 border border-white/10 flex items-center justify-center flex-shrink-0 shadow-lg">
              <span className="text-sm font-black text-white tracking-wide">
                {getUserInitials(selectedUser.full_name, selectedUser.email)}
              </span>
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-extrabold text-white truncate">
                {isEditMode ? 'Edit Profile' : (selectedUser.full_name || 'Unnamed User')}
              </h3>
              <p className="text-xs text-slate-400 truncate mt-0.5 flex items-center gap-1.5">
                <Mail className="w-3 h-3 flex-shrink-0" />
                {selectedUser.email}
              </p>
              {!isEditMode && (
                <div className="flex flex-wrap items-center gap-2 mt-2.5">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase border ${roleBadgeClass(selectedUser.role)}`}>
                    <Shield className="w-3 h-3" />
                    {formatRoleLabel(selectedUser.role)}
                  </span>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase border ${subscriptionBadgeClass(selectedUser.subscription || 'free')}`}>
                    <Crown className="w-3 h-3" />
                    {formatSubscriptionLabel(selectedUser.subscription, selectedUser.subscription_cycle)}
                  </span>
                </div>
              )}
            </div>
          </div>
        ) : null}
        footer={
          isEditMode ? (
            <>
              <button
                type="button"
                onClick={() => setIsEditMode(false)}
                className="px-4 py-2.5 rounded-xl text-slate-400 hover:text-white text-xs font-bold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveUser}
                disabled={isLoading}
                className="px-5 py-2.5 bg-gradient-to-r from-rose-500 to-rose-600 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg shadow-rose-500/20 transition cursor-pointer"
              >
                Save Changes
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={closeUserModal}
                className="px-4 py-2.5 rounded-xl text-slate-400 hover:text-white text-xs font-bold transition cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => setIsEditMode(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/15 border border-white/10 text-white text-xs font-bold rounded-xl transition cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit User
              </button>
            </>
          )
        }
      >
        {selectedUser && (
          isEditMode ? (
            <div className="space-y-4 pt-2">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Full Name</label>
                <input
                  type="text"
                  value={editForm.fullName}
                  onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                  className="w-full bg-slate-950/60 border border-white/5 rounded-xl px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-rose-500/50 transition font-semibold"
                  placeholder="e.g. John Doe"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Email Address</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full bg-slate-950/60 border border-white/5 rounded-xl px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-rose-500/50 transition font-semibold"
                  placeholder="email@example.com"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Role</label>
                  <select
                    value={editForm.role}
                    onChange={(e) => {
                      const role = e.target.value;
                      setEditForm({
                        ...editForm,
                        role,
                        ...(role === 'admin'
                          ? { subscription: 'unlimited', subscriptionCycle: '' }
                          : {}),
                      });
                    }}
                    disabled={selectedUser.id === currentUser?.id}
                    className="w-full bg-slate-950/60 border border-white/5 rounded-xl p-2.5 text-sm text-slate-200 outline-none focus:border-rose-500/50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
                  >
                    <option value="listener">Listener</option>
                    <option value="studio_admin">Studio Admin</option>
                    <option value="radio_admin">Radio Admin</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Subscription</label>
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
                    disabled={editForm.role === 'admin'}
                    className="w-full bg-slate-950/60 border border-white/5 rounded-xl p-2.5 text-sm text-slate-200 outline-none focus:border-rose-500/50 cursor-pointer font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <option value="free">Free</option>
                    <option value="premium">Premium</option>
                    {currentUser?.role === 'admin' && (
                      <option value="unlimited">Unlimited</option>
                    )}
                  </select>
                </div>

                {editForm.subscription === 'premium' && (
                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Billing Cycle</label>
                    <select
                      value={editForm.subscriptionCycle}
                      onChange={(e) => setEditForm({ ...editForm, subscriptionCycle: e.target.value })}
                      className="w-full bg-slate-950/60 border border-white/5 rounded-xl p-2.5 text-sm text-slate-200 outline-none focus:border-rose-500/50 cursor-pointer font-semibold"
                    >
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              {parseUpgradeRequest(selectedUser.artist_profile?.bio) && (
                <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                  <Sparkles className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-amber-300">Role upgrade requested</p>
                    <p className="text-[11px] text-amber-200/70 mt-1 leading-relaxed">
                      This user is requesting promotion to{' '}
                      <span className="font-bold text-amber-200">{parseUpgradeRequest(selectedUser.artist_profile?.bio)}</span>.
                    </p>
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-white/5 bg-slate-950/40 divide-y divide-white/5 overflow-hidden">
                <div className="flex items-center justify-between gap-4 px-4 py-3.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                      <UserCircle2 className="w-4 h-4 text-slate-400" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Display Name</span>
                      <span className="text-sm font-bold text-slate-100 truncate block">{selectedUser.full_name || 'No display name'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 px-4 py-3.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                      <Shield className="w-4 h-4 text-slate-400" />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Platform Role</span>
                      <span className="text-sm font-bold text-slate-100 capitalize">{formatRoleLabel(selectedUser.role)}</span>
                    </div>
                  </div>
                </div>

                <div className="px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                      <Crown className="w-4 h-4 text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Billing</span>
                      <span className="text-sm font-bold text-slate-100 capitalize">
                        {formatSubscriptionLabel(selectedUser.subscription, selectedUser.subscription_cycle)}
                      </span>
                    </div>
                  </div>
                  {(selectedUser.subscription === 'premium' || selectedUser.subscription === 'unlimited') && (
                    <div className="mt-3 ml-11">
                      <SubscriptionDates
                        activatedAt={selectedUser.subscription_activated_at}
                        expiresAt={selectedUser.subscription === 'premium' ? selectedUser.subscription_expires_at : null}
                        inline
                      />
                    </div>
                  )}
                </div>
              </div>

              {selectedUser.artist_profile && (
                <div className="rounded-2xl border border-white/5 bg-slate-950/40 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Artist Profile</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-semibold uppercase block">Stage Name</span>
                    <span className="text-sm font-bold text-slate-100 block mt-0.5">{selectedUser.artist_profile.stage_name}</span>
                  </div>
                  {selectedUser.artist_profile.bio && (
                    <div>
                      <span className="text-[10px] text-slate-500 font-semibold uppercase block">Bio</span>
                      <p className="text-xs text-slate-400 leading-relaxed mt-1">{selectedUser.artist_profile.bio}</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )
        )}
      </AppModal>
    </div>
  );
};
