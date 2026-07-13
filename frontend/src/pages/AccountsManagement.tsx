import React, { useCallback, useEffect, useState } from 'react';
import {
  Users, CreditCard, RefreshCw, LayoutDashboard, ChevronRight, ArrowLeft, Download, Banknote,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { LazyListSentinel } from '../components/shared/LazyListSentinel';
import { ListSearchInput } from '../components/shared/ListSearchInput';
import { DatePicker } from '../components/shared/DatePicker';
import { TableSkeleton } from '../components/shared/skeleton';
import { useLazyList } from '../hooks/useLazyList';
import { formatLocalDateTime, todayDateInputValue } from '../utils/dateTime';
import { RevenueSettingsPanel } from './RevenueSettings';
import { showError } from '../utils/swal';
import {
  ACCOUNTS_LIST_PAGE_SIZE,
  downloadOwnerAccountDetailCsv,
  downloadOwnerAccountsCsv,
  downloadSubscriberDetailCsv,
  downloadSubscribersCsv,
  downloadWithdrawalUserDetailCsv,
  downloadWithdrawalUsersCsv,
  fetchAccountsSummary,
  fetchAdminSubscriberDetail,
  fetchAdminSubscribersPage,
  fetchOwnerAccountDetail,
  fetchOwnerAccountsPage,
  fetchWithdrawalUserDetail,
  fetchWithdrawalUsersPage,
  formatInrFromPaise,
  type AccountsSummary,
  type AdminSubscriber,
  type AdminSubscriberDetail,
  type AdminSubscriberPaymentItem,
  type OwnerAccount,
  type OwnerAccountDetail,
  type StationRevenueDetail,
  type TrackRevenueDetail,
  type WithdrawalUser,
  type WithdrawalUserDetail,
  type WithdrawalUserItem,
} from '../utils/wallet';

type AccountsTab = 'overview' | 'owners' | 'subscriptions' | 'withdrawals' | 'settings';

const accountTypeLabel = (value: string) => {
  switch (value) {
    case 'studio':
      return 'Studio';
    case 'radio':
      return 'Radio';
    default:
      return value.replace(/_/g, ' ');
  }
};

const formatDuration = (seconds: number) => {
  if (seconds <= 0) return '—';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
};

const subscriptionLabel = (subscription: string, cycle: string | null) => {
  if (subscription === 'premium') {
    if (cycle === 'yearly') return 'Premium · Yearly';
    if (cycle === 'monthly') return 'Premium · Monthly';
    return 'Premium';
  }
  return subscription.replace(/_/g, ' ');
};

const SUBSCRIBER_PAYMENT_FILTERS = [
  { value: '', label: 'All' },
  { value: 'paid', label: 'Paid' },
  { value: 'created', label: 'Pending' },
  { value: 'failed', label: 'Failed' },
] as const;

const paymentStatusLabel = (status: string) => {
  switch (status) {
    case 'paid':
      return 'Paid';
    case 'created':
      return 'Pending';
    case 'failed':
      return 'Failed';
    default:
      return status.replace(/_/g, ' ');
  }
};

const subscriberDetailCards = (detail: AdminSubscriberDetail) => {
  const isCancelled = detail.subscription_status === 'cancelled';
  const cards: { label: string; value: string; valueClass?: string }[] = [
    {
      label: 'Plan',
      value: subscriptionLabel(detail.subscription, detail.subscription_cycle),
    },
    {
      label: 'Subscription',
      value: isCancelled ? 'Cancelled' : 'Active',
      valueClass: isCancelled ? 'text-amber-400' : 'text-emerald-400',
    },
    {
      label: 'Renew on',
      value: isCancelled
        ? 'Cancelled'
        : detail.subscription_expires_at
          ? formatLocalDateTime(detail.subscription_expires_at)
          : '—',
      valueClass: isCancelled ? 'text-amber-400' : undefined,
    },
  ];

  if (detail.pending_plan_id) {
    const queuedPlan = detail.pending_plan_label || detail.pending_plan_id.replace(/_/g, ' ');
    cards.push({
      label: 'Queued plan',
      value: detail.pending_plan_paid ? `${queuedPlan} · Prepaid` : queuedPlan,
    });
  }

  return cards;
};

const CsvDownloadButton = ({
  onClick,
  disabled = false,
  busy = false,
  label,
}: {
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  label: string;
}) => {
  const tooltip = busy ? 'Downloading…' : label;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      title={tooltip}
      aria-label={tooltip}
      className="inline-flex items-center justify-center p-1.5 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:border-white/20 transition disabled:opacity-40 disabled:pointer-events-none"
    >
      <Download className={`w-3.5 h-3.5 ${busy ? 'animate-pulse' : ''}`} />
    </button>
  );
};

export const AccountsManagement: React.FC = () => {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<AccountsTab>('overview');
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [exportBusy, setExportBusy] = useState(false);
  const [summary, setSummary] = useState<AccountsSummary | null>(null);
  const [subscriberFilter, setSubscriberFilter] = useState<string>('');
  const [ownersSearchQuery, setOwnersSearchQuery] = useState('');
  const [ownerDetailSearchQuery, setOwnerDetailSearchQuery] = useState('');
  const [subscribersSearchQuery, setSubscribersSearchQuery] = useState('');
  const [subscriberDetailSearchQuery, setSubscriberDetailSearchQuery] = useState('');
  const [subscriberDetailFromDate, setSubscriberDetailFromDate] = useState('');
  const [subscriberDetailToDate, setSubscriberDetailToDate] = useState('');
  const [withdrawalsSearchQuery, setWithdrawalsSearchQuery] = useState('');
  const [withdrawalDetailSearchQuery, setWithdrawalDetailSearchQuery] = useState('');
  const [withdrawalDetailFromDate, setWithdrawalDetailFromDate] = useState('');
  const [withdrawalDetailToDate, setWithdrawalDetailToDate] = useState('');
  const [selectedOwner, setSelectedOwner] = useState<OwnerAccount | null>(null);
  const [ownerDetailMeta, setOwnerDetailMeta] = useState<OwnerAccountDetail | null>(null);
  const [selectedSubscriber, setSelectedSubscriber] = useState<AdminSubscriber | null>(null);
  const [subscriberDetailMeta, setSubscriberDetailMeta] = useState<AdminSubscriberDetail | null>(null);
  const [selectedWithdrawalUser, setSelectedWithdrawalUser] = useState<WithdrawalUser | null>(null);
  const [withdrawalDetailMeta, setWithdrawalDetailMeta] = useState<WithdrawalUserDetail | null>(null);

  const loadOverview = useCallback(async () => {
    if (!token) return;
    setOverviewLoading(true);
    try {
      setSummary(await fetchAccountsSummary(token));
    } catch (err) {
      showError('Accounts', err instanceof Error ? err.message : 'Could not load accounts data.');
    } finally {
      setOverviewLoading(false);
    }
  }, [token]);

  const ownersList = useLazyList<OwnerAccount>({
    fetchPage: useCallback(
      async (offset, limit) => {
        if (!token) return { items: [], hasMore: false };
        const page = await fetchOwnerAccountsPage(token, limit, offset, ownersSearchQuery || undefined);
        return { items: page.items, hasMore: page.has_more };
      },
      [token, ownersSearchQuery],
    ),
    resetKey: activeTab === 'owners' && !selectedOwner ? `owners-${ownersSearchQuery}` : null,
    enabled: activeTab === 'owners' && !selectedOwner && !!token,
    pageSize: ACCOUNTS_LIST_PAGE_SIZE,
  });

  const subscribersList = useLazyList<AdminSubscriber>({
    fetchPage: useCallback(
      async (offset, limit) => {
        if (!token) return { items: [], hasMore: false };
        const page = await fetchAdminSubscribersPage(
          token,
          limit,
          offset,
          subscriberFilter || undefined,
          subscribersSearchQuery || undefined,
        );
        return { items: page.items, hasMore: page.has_more };
      },
      [token, subscriberFilter, subscribersSearchQuery],
    ),
    resetKey: activeTab === 'subscriptions' && !selectedSubscriber
      ? `subs-${subscriberFilter}-${subscribersSearchQuery}`
      : null,
    enabled: activeTab === 'subscriptions' && !selectedSubscriber && !!token,
    pageSize: ACCOUNTS_LIST_PAGE_SIZE,
  });

  const ownerDetailList = useLazyList<TrackRevenueDetail | StationRevenueDetail>({
    fetchPage: useCallback(
      async (offset, limit) => {
        if (!token || !selectedOwner) return { items: [], hasMore: false };
        try {
          const detail = await fetchOwnerAccountDetail(
            token,
            selectedOwner.user_id,
            limit,
            offset,
            ownerDetailSearchQuery || undefined,
          );
          if (offset === 0) setOwnerDetailMeta(detail);
          const items = detail.account_type === 'studio' ? detail.tracks : detail.stations;
          return { items, hasMore: detail.has_more ?? false };
        } catch (err) {
          showError('Owner detail', err instanceof Error ? err.message : 'Could not load owner details.');
          return { items: [], hasMore: false };
        }
      },
      [token, selectedOwner, ownerDetailSearchQuery],
    ),
    resetKey: selectedOwner ? `${selectedOwner.user_id}-${ownerDetailSearchQuery}` : null,
    enabled: activeTab === 'owners' && !!selectedOwner && !!token,
    pageSize: ACCOUNTS_LIST_PAGE_SIZE,
  });

  const subscriberPaymentsList = useLazyList<AdminSubscriberPaymentItem>({
    fetchPage: useCallback(
      async (offset, limit) => {
        if (!token || !selectedSubscriber) return { items: [], hasMore: false };
        try {
          const detail = await fetchAdminSubscriberDetail(
            token,
            selectedSubscriber.user_id,
            limit,
            offset,
            subscriberDetailSearchQuery || undefined,
            subscriberDetailFromDate || undefined,
            subscriberDetailToDate || undefined,
          );
          if (offset === 0) setSubscriberDetailMeta(detail);
          return { items: detail.payments, hasMore: detail.has_more_payments ?? false };
        } catch (err) {
          showError('Subscriber detail', err instanceof Error ? err.message : 'Could not load subscriber details.');
          return { items: [], hasMore: false };
        }
      },
      [token, selectedSubscriber, subscriberDetailSearchQuery, subscriberDetailFromDate, subscriberDetailToDate],
    ),
    resetKey: selectedSubscriber
      ? `${selectedSubscriber.user_id}-${subscriberDetailSearchQuery}-${subscriberDetailFromDate}-${subscriberDetailToDate}`
      : null,
    enabled: activeTab === 'subscriptions' && !!selectedSubscriber && !!token,
    pageSize: ACCOUNTS_LIST_PAGE_SIZE,
  });

  const withdrawalUsersList = useLazyList<WithdrawalUser>({
    fetchPage: useCallback(
      async (offset, limit) => {
        if (!token) return { items: [], hasMore: false };
        const page = await fetchWithdrawalUsersPage(
          token,
          limit,
          offset,
          withdrawalsSearchQuery || undefined,
        );
        return { items: page.items, hasMore: page.has_more };
      },
      [token, withdrawalsSearchQuery],
    ),
    resetKey: activeTab === 'withdrawals' && !selectedWithdrawalUser
      ? `withdrawals-${withdrawalsSearchQuery}`
      : null,
    enabled: activeTab === 'withdrawals' && !selectedWithdrawalUser && !!token,
    pageSize: ACCOUNTS_LIST_PAGE_SIZE,
  });

  const withdrawalTransactionsList = useLazyList<WithdrawalUserItem>({
    fetchPage: useCallback(
      async (offset, limit) => {
        if (!token || !selectedWithdrawalUser) return { items: [], hasMore: false };
        try {
          const detail = await fetchWithdrawalUserDetail(
            token,
            selectedWithdrawalUser.user_id,
            limit,
            offset,
            withdrawalDetailSearchQuery || undefined,
            withdrawalDetailFromDate || undefined,
            withdrawalDetailToDate || undefined,
          );
          if (offset === 0) setWithdrawalDetailMeta(detail);
          return { items: detail.withdrawals, hasMore: detail.has_more_withdrawals ?? false };
        } catch (err) {
          showError('Withdrawals', err instanceof Error ? err.message : 'Could not load withdrawal history.');
          return { items: [], hasMore: false };
        }
      },
      [token, selectedWithdrawalUser, withdrawalDetailSearchQuery, withdrawalDetailFromDate, withdrawalDetailToDate],
    ),
    resetKey: selectedWithdrawalUser
      ? `${selectedWithdrawalUser.user_id}-${withdrawalDetailSearchQuery}-${withdrawalDetailFromDate}-${withdrawalDetailToDate}`
      : null,
    enabled: activeTab === 'withdrawals' && !!selectedWithdrawalUser && !!token,
    pageSize: ACCOUNTS_LIST_PAGE_SIZE,
  });

  useEffect(() => {
    if (activeTab === 'overview' && token) void loadOverview();
  }, [activeTab, loadOverview, token]);

  const reloadActive = async () => {
    if (!token) return;
    if (activeTab === 'overview') await loadOverview();
    else if (activeTab === 'owners' && !selectedOwner) await ownersList.reload();
    else if (activeTab === 'owners' && selectedOwner) await ownerDetailList.reload();
    else if (activeTab === 'subscriptions' && !selectedSubscriber) await subscribersList.reload();
    else if (activeTab === 'subscriptions' && selectedSubscriber) await subscriberPaymentsList.reload();
    else if (activeTab === 'withdrawals' && !selectedWithdrawalUser) await withdrawalUsersList.reload();
    else if (activeTab === 'withdrawals' && selectedWithdrawalUser) await withdrawalTransactionsList.reload();
  };

  const openOwnerDetail = (owner: OwnerAccount) => {
    setOwnerDetailSearchQuery('');
    setSelectedOwner(owner);
    setOwnerDetailMeta(null);
  };

  const closeOwnerDetail = () => {
    setSelectedOwner(null);
    setOwnerDetailMeta(null);
    setOwnerDetailSearchQuery('');
  };

  const openSubscriberDetail = (subscriber: AdminSubscriber) => {
    setSubscriberDetailSearchQuery('');
    setSubscriberDetailFromDate('');
    setSubscriberDetailToDate('');
    setSelectedSubscriber(subscriber);
    setSubscriberDetailMeta(null);
  };

  const closeSubscriberDetail = () => {
    setSelectedSubscriber(null);
    setSubscriberDetailMeta(null);
    setSubscriberDetailSearchQuery('');
    setSubscriberDetailFromDate('');
    setSubscriberDetailToDate('');
  };

  const openWithdrawalUserDetail = (user: WithdrawalUser) => {
    setWithdrawalDetailSearchQuery('');
    setWithdrawalDetailFromDate('');
    setWithdrawalDetailToDate('');
    setSelectedWithdrawalUser(user);
    setWithdrawalDetailMeta(null);
  };

  const closeWithdrawalUserDetail = () => {
    setSelectedWithdrawalUser(null);
    setWithdrawalDetailMeta(null);
    setWithdrawalDetailSearchQuery('');
    setWithdrawalDetailFromDate('');
    setWithdrawalDetailToDate('');
  };

  const handleTabChange = (tab: AccountsTab) => {
    if (tab !== 'owners') closeOwnerDetail();
    if (tab !== 'subscriptions') closeSubscriberDetail();
    if (tab !== 'withdrawals') closeWithdrawalUserDetail();
    setActiveTab(tab);
  };

  const runExport = async (exportFn: () => Promise<void>) => {
    if (!token) return;
    setExportBusy(true);
    try {
      await exportFn();
    } catch (err) {
      showError('Export failed', err instanceof Error ? err.message : 'Could not download CSV.');
    } finally {
      setExportBusy(false);
    }
  };

  const tabs: { id: AccountsTab; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'owners', label: 'Owner Accounts', icon: Users },
    { id: 'withdrawals', label: 'Withdrawals', icon: Banknote },
    { id: 'subscriptions', label: 'Subscriptions', icon: CreditCard },
    { id: 'settings', label: 'Revenue Rules', icon: RefreshCw },
  ];

  return (
    <div className="space-y-6 font-sans w-full">
      <div className="hidden md:flex items-center justify-between gap-4">
        <h2 className="text-3xl font-extrabold tracking-tight text-white">Accounts</h2>
        {activeTab !== 'settings' && (
          <button
            type="button"
            onClick={() => void reloadActive()}
            className="p-2.5 rounded-xl border border-white/10 text-slate-300 hover:text-white transition"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => handleTabChange(id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider whitespace-nowrap transition ${
              activeTab === id
                ? 'bg-rose-600/20 border border-rose-500/30 text-rose-300'
                : 'bg-slate-900/40 border border-white/5 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        overviewLoading || !summary ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="glass-card rounded-2xl p-5 h-24 animate-pulse bg-slate-900/30" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Subscription revenue', value: formatInrFromPaise(summary.subscription_revenue_paise) },
              { label: 'Owners revenue', value: formatInrFromPaise(summary.owners_revenue_paise) },
              { label: 'Withdrawals', value: formatInrFromPaise(summary.total_withdrawn_paise) },
              { label: 'Balance', value: formatInrFromPaise(summary.total_balance_paise) },
              { label: 'Studio count', value: String(summary.studio_count) },
              { label: 'Station count', value: String(summary.station_count) },
              { label: 'Premium subscribers', value: String(summary.premium_subscriber_count) },
              { label: 'Pending subscription', value: String(summary.pending_subscription_count) },
            ].map((card) => (
              <div key={card.label} className="glass-card rounded-2xl p-5 border-white/5">
                <span className="text-[10px] text-rose-400 font-extrabold uppercase block mb-1">{card.label}</span>
                <span className="text-xl font-extrabold text-white">{card.value}</span>
              </div>
            ))}
          </div>
        )
      )}

      {activeTab === 'owners' && !selectedOwner && (
        <div className="space-y-4">
          <div className="flex justify-end items-center gap-3">
            <ListSearchInput
              value={ownersSearchQuery}
              onChange={setOwnersSearchQuery}
              placeholder="Search by owner, email, or type..."
            />
            <CsvDownloadButton
              label="Download owner accounts CSV"
              busy={exportBusy}
              onClick={() => void runExport(() => downloadOwnerAccountsCsv(token!))}
              disabled={ownersList.loading || ownersList.items.length === 0}
            />
          </div>
          {ownersList.loading && ownersList.items.length === 0 ? (
            <TableSkeleton rows={8} columns={5} />
          ) : ownersList.items.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-12">No studio or radio owner accounts yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-white/5">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/60 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-bold">Owner</th>
                    <th className="px-4 py-3 font-bold">Type</th>
                    <th className="px-4 py-3 font-bold">Total earned</th>
                    <th className="px-4 py-3 font-bold">Withdrawn</th>
                    <th className="px-4 py-3 font-bold">Balance</th>
                    <th className="px-4 py-3 font-bold" aria-hidden />
                  </tr>
                </thead>
                <tbody>
                  {ownersList.items.map((owner) => (
                    <tr
                      key={owner.user_id}
                      onClick={() => openOwnerDetail(owner)}
                      className="border-t border-white/5 hover:bg-slate-900/40 cursor-pointer transition"
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-200">{owner.owner_name}</p>
                        <p className="text-[10px] text-slate-500">{owner.email}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-400">{accountTypeLabel(owner.account_type)}</td>
                      <td className="px-4 py-3 font-bold text-white">{formatInrFromPaise(owner.total_revenue_paise)}</td>
                      <td className="px-4 py-3 text-slate-300">{formatInrFromPaise(owner.total_withdrawals_paise)}</td>
                      <td className="px-4 py-3 font-bold text-emerald-300">{formatInrFromPaise(owner.balance_paise)}</td>
                      <td className="px-4 py-3 text-slate-500">
                        <ChevronRight className="w-4 h-4" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <LazyListSentinel
                hasMore={ownersList.hasMore}
                loading={ownersList.loadingMore}
                onLoadMore={() => void ownersList.loadMore()}
              />
            </div>
          )}
        </div>
      )}

      {activeTab === 'owners' && selectedOwner && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <button
              type="button"
              onClick={closeOwnerDetail}
              className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-white transition"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to owner accounts
            </button>
            <div className="flex items-center gap-3">
              <ListSearchInput
                value={ownerDetailSearchQuery}
                onChange={setOwnerDetailSearchQuery}
                placeholder={
                  selectedOwner.account_type === 'studio'
                    ? 'Search tracks...'
                    : 'Search stations...'
                }
              />
              <CsvDownloadButton
                label="Download owner detail CSV"
                busy={exportBusy}
                onClick={() => void runExport(() => downloadOwnerAccountDetailCsv(token!, selectedOwner!.user_id))}
                disabled={ownerDetailList.loading || ownerDetailList.items.length === 0}
              />
            </div>
          </div>

          {ownerDetailList.loading && ownerDetailList.items.length === 0 ? (
            <TableSkeleton rows={6} columns={selectedOwner?.account_type === 'studio' ? 3 : 4} />
          ) : (ownerDetailMeta?.account_type ?? selectedOwner.account_type) === 'studio' ? (
            <div className="overflow-x-auto rounded-2xl border border-white/5">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/60 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-bold">Track</th>
                    <th className="px-4 py-3 font-bold">Total earned</th>
                    <th className="px-4 py-3 font-bold">Play count</th>
                  </tr>
                </thead>
                <tbody>
                  {ownerDetailList.items.length > 0 ? (
                    (ownerDetailList.items as TrackRevenueDetail[]).map((track) => (
                      <tr key={track.track_id} className="border-t border-white/5">
                        <td className="px-4 py-3 font-semibold text-slate-200">{track.title}</td>
                        <td className="px-4 py-3 font-bold text-white">{formatInrFromPaise(track.revenue_paise)}</td>
                        <td className="px-4 py-3 text-slate-300">{track.play_count}</td>
                      </tr>
                    ))
                  ) : (
                    <tr className="border-t border-white/5">
                      <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                        No tracks uploaded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <LazyListSentinel
                hasMore={ownerDetailList.hasMore}
                loading={ownerDetailList.loadingMore}
                onLoadMore={() => void ownerDetailList.loadMore()}
              />
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-white/5">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/60 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-bold">Station</th>
                    <th className="px-4 py-3 font-bold">Total earned</th>
                    <th className="px-4 py-3 font-bold">Sessions</th>
                    <th className="px-4 py-3 font-bold">Listen time</th>
                  </tr>
                </thead>
                <tbody>
                  {ownerDetailList.items.length > 0 ? (
                    (ownerDetailList.items as StationRevenueDetail[]).map((station) => (
                      <tr key={station.station_id} className="border-t border-white/5">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-200">{station.name}</p>
                          <p className="text-[10px] text-slate-500">{ownerDetailMeta?.email ?? selectedOwner.email}</p>
                        </td>
                        <td className="px-4 py-3 font-bold text-white">{formatInrFromPaise(station.revenue_paise)}</td>
                        <td className="px-4 py-3 text-slate-300">{station.session_count}</td>
                        <td className="px-4 py-3 text-slate-400">{formatDuration(station.listen_seconds)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr className="border-t border-white/5">
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                        No revenue activity recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <LazyListSentinel
                hasMore={ownerDetailList.hasMore}
                loading={ownerDetailList.loadingMore}
                onLoadMore={() => void ownerDetailList.loadMore()}
              />
            </div>
          )}
        </div>
      )}

      {activeTab === 'subscriptions' && !selectedSubscriber && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {SUBSCRIBER_PAYMENT_FILTERS.map(({ value, label }) => (
              <button
                key={value || 'all'}
                type="button"
                onClick={() => setSubscriberFilter(value)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition ${
                  subscriberFilter === value
                    ? 'bg-rose-600/20 border-rose-500/30 text-rose-300'
                    : 'border-white/10 text-slate-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex justify-end items-center gap-3">
            <ListSearchInput
              value={subscribersSearchQuery}
              onChange={setSubscribersSearchQuery}
              placeholder="Search by name, email, or plan..."
            />
            <CsvDownloadButton
              label="Download subscribers CSV"
              busy={exportBusy}
              onClick={() => void runExport(() => downloadSubscribersCsv(token!, subscriberFilter || undefined))}
              disabled={subscribersList.loading || subscribersList.items.length === 0}
            />
          </div>

          {subscribersList.loading && subscribersList.items.length === 0 ? (
            <TableSkeleton rows={8} columns={6} />
          ) : subscribersList.items.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-12">No subscribed users found.</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-white/5">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/60 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-bold">User</th>
                    <th className="px-4 py-3 font-bold">Subscription</th>
                    <th className="px-4 py-3 font-bold">Status</th>
                    <th className="px-4 py-3 font-bold">Amount</th>
                    <th className="px-4 py-3 font-bold">Last payment</th>
                    <th className="px-4 py-3 font-bold">Next payment</th>
                    <th className="px-4 py-3 font-bold" aria-hidden />
                  </tr>
                </thead>
                <tbody>
                  {subscribersList.items.map((subscriber) => (
                    <tr
                      key={subscriber.user_id}
                      onClick={() => openSubscriberDetail(subscriber)}
                      className="border-t border-white/5 hover:bg-slate-900/40 cursor-pointer transition"
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-200">{subscriber.user_name || '—'}</p>
                        <p className="text-[10px] text-slate-500">{subscriber.user_email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-200">
                          {subscriptionLabel(subscriber.subscription, subscriber.subscription_cycle)}
                        </p>
                        <p
                          className={`text-[10px] font-bold uppercase mt-0.5 ${
                            subscriber.subscription_status === 'cancelled'
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                          }`}
                        >
                          {subscriber.subscription_status === 'cancelled' ? 'Cancelled' : 'Active'}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-400 uppercase text-[10px] font-bold">
                        {paymentStatusLabel(subscriber.last_payment_status)}
                      </td>
                      <td className="px-4 py-3 font-bold text-white">
                        {subscriber.last_amount_paise != null
                          ? formatInrFromPaise(subscriber.last_amount_paise)
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {subscriber.last_payment_at ? formatLocalDateTime(subscriber.last_payment_at) : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {subscriber.next_payment_at ? formatLocalDateTime(subscriber.next_payment_at) : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        <ChevronRight className="w-4 h-4" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <LazyListSentinel
                hasMore={subscribersList.hasMore}
                loading={subscribersList.loadingMore}
                onLoadMore={() => void subscribersList.loadMore()}
              />
            </div>
          )}
        </div>
      )}

      {activeTab === 'subscriptions' && selectedSubscriber && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <button
              type="button"
              onClick={closeSubscriberDetail}
              className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-white transition"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to subscribers
            </button>
            <div className="flex items-end gap-3 flex-wrap justify-end">
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">From</span>
                <DatePicker
                  value={subscriberDetailFromDate}
                  max={subscriberDetailToDate || todayDateInputValue()}
                  onChange={setSubscriberDetailFromDate}
                  size="xs"
                  className="mt-1"
                />
              </label>
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">To</span>
                <DatePicker
                  value={subscriberDetailToDate}
                  min={subscriberDetailFromDate || undefined}
                  max={todayDateInputValue()}
                  onChange={setSubscriberDetailToDate}
                  size="xs"
                  className="mt-1"
                />
              </label>
              {(subscriberDetailFromDate || subscriberDetailToDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setSubscriberDetailFromDate('');
                    setSubscriberDetailToDate('');
                  }}
                  className="px-2.5 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-white transition"
                >
                  Clear dates
                </button>
              )}
              <ListSearchInput
                value={subscriberDetailSearchQuery}
                onChange={setSubscriberDetailSearchQuery}
                placeholder="Search payments..."
              />
              <CsvDownloadButton
                label="Download subscriber payments CSV"
                busy={exportBusy}
                onClick={() => void runExport(() =>
                  downloadSubscriberDetailCsv(
                    token!,
                    selectedSubscriber!.user_id,
                    subscriberDetailFromDate || undefined,
                    subscriberDetailToDate || undefined,
                    subscriberDetailSearchQuery || undefined,
                  ))}
                disabled={
                  subscriberPaymentsList.loading
                  || (
                    subscriberPaymentsList.items.length === 0
                    && !subscriberDetailFromDate
                    && !subscriberDetailToDate
                  )
                }
              />
            </div>
          </div>

          {subscriberPaymentsList.loading && subscriberPaymentsList.items.length === 0 ? (
            <TableSkeleton rows={6} columns={5} />
          ) : subscriberDetailMeta ? (
            <>
              <div>
                <p className="font-semibold text-slate-200">{subscriberDetailMeta.user_name || '—'}</p>
                <p className="text-[10px] text-slate-500">{subscriberDetailMeta.user_email}</p>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {subscriberDetailCards(subscriberDetailMeta).map((card) => (
                  <div key={card.label} className="glass-card rounded-2xl p-4 border-white/5">
                    <span className="text-[10px] text-rose-400 font-extrabold uppercase block mb-1">
                      {card.label}
                    </span>
                    <span className={`text-sm font-bold text-white ${card.valueClass ?? ''}`}>
                      {card.value}
                    </span>
                  </div>
                ))}
              </div>

              <div className="overflow-x-auto rounded-2xl border border-white/5">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/60 text-[10px] uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-bold">Plan</th>
                      <th className="px-4 py-3 font-bold">Amount</th>
                      <th className="px-4 py-3 font-bold">Status</th>
                      <th className="px-4 py-3 font-bold">Created</th>
                      <th className="px-4 py-3 font-bold">Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subscriberPaymentsList.items.length > 0 ? (
                      subscriberPaymentsList.items.map((payment) => (
                        <tr key={payment.id} className="border-t border-white/5">
                          <td className="px-4 py-3 font-semibold text-slate-200">{payment.plan_label}</td>
                          <td className="px-4 py-3 font-bold text-white">
                            {formatInrFromPaise(payment.amount_paise)}
                          </td>
                          <td className="px-4 py-3 text-slate-400 uppercase text-[10px] font-bold">
                            {paymentStatusLabel(payment.status)}
                          </td>
                          <td className="px-4 py-3 text-slate-500">
                            {formatLocalDateTime(payment.created_at)}
                          </td>
                          <td className="px-4 py-3 text-slate-500">
                            {payment.paid_at ? formatLocalDateTime(payment.paid_at) : '—'}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr className="border-t border-white/5">
                        <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                          No payment history yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <LazyListSentinel
                  hasMore={subscriberPaymentsList.hasMore}
                  loading={subscriberPaymentsList.loadingMore}
                  onLoadMore={() => void subscriberPaymentsList.loadMore()}
                />
              </div>
            </>
          ) : null}
        </div>
      )}

      {activeTab === 'withdrawals' && !selectedWithdrawalUser && (
        <div className="space-y-4">
          <div className="flex justify-end items-center gap-3">
            <ListSearchInput
              value={withdrawalsSearchQuery}
              onChange={setWithdrawalsSearchQuery}
              placeholder="Search by owner, email, or type..."
            />
            <CsvDownloadButton
              label="Download withdrawals CSV"
              busy={exportBusy}
              onClick={() => void runExport(() => downloadWithdrawalUsersCsv(token!))}
              disabled={withdrawalUsersList.loading || withdrawalUsersList.items.length === 0}
            />
          </div>
          {withdrawalUsersList.loading && withdrawalUsersList.items.length === 0 ? (
            <TableSkeleton rows={8} columns={6} />
          ) : withdrawalUsersList.items.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-12">No withdrawal activity yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-white/5">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/60 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-bold">Owner</th>
                    <th className="px-4 py-3 font-bold">Type</th>
                    <th className="px-4 py-3 font-bold">No. of withdrawals</th>
                    <th className="px-4 py-3 font-bold">Total withdrawn</th>
                    <th className="px-4 py-3 font-bold">Wallet balance</th>
                    <th className="px-4 py-3 font-bold">Last withdrawal</th>
                    <th className="px-4 py-3 font-bold" aria-hidden />
                  </tr>
                </thead>
                <tbody>
                  {withdrawalUsersList.items.map((user) => (
                    <tr
                      key={user.user_id}
                      onClick={() => openWithdrawalUserDetail(user)}
                      className="border-t border-white/5 hover:bg-slate-900/40 cursor-pointer transition"
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-200">{user.owner_name}</p>
                        <p className="text-[10px] text-slate-500">{user.email}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-400">{accountTypeLabel(user.account_type)}</td>
                      <td className="px-4 py-3 text-slate-300">{user.withdrawal_count}</td>
                      <td className="px-4 py-3 font-bold text-white">
                        {formatInrFromPaise(user.total_withdrawals_paise)}
                      </td>
                      <td className="px-4 py-3 font-bold text-emerald-300">
                        {formatInrFromPaise(user.balance_paise)}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {user.last_withdrawal_at ? formatLocalDateTime(user.last_withdrawal_at) : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        <ChevronRight className="w-4 h-4" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <LazyListSentinel
                hasMore={withdrawalUsersList.hasMore}
                loading={withdrawalUsersList.loadingMore}
                onLoadMore={() => void withdrawalUsersList.loadMore()}
              />
            </div>
          )}
        </div>
      )}

      {activeTab === 'withdrawals' && selectedWithdrawalUser && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <button
              type="button"
              onClick={closeWithdrawalUserDetail}
              className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-white transition"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to withdrawals
            </button>
            <div className="flex items-end gap-3 flex-wrap justify-end">
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">From</span>
                <DatePicker
                  value={withdrawalDetailFromDate}
                  max={withdrawalDetailToDate || todayDateInputValue()}
                  onChange={setWithdrawalDetailFromDate}
                  size="xs"
                  className="mt-1"
                />
              </label>
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">To</span>
                <DatePicker
                  value={withdrawalDetailToDate}
                  min={withdrawalDetailFromDate || undefined}
                  max={todayDateInputValue()}
                  onChange={setWithdrawalDetailToDate}
                  size="xs"
                  className="mt-1"
                />
              </label>
              {(withdrawalDetailFromDate || withdrawalDetailToDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setWithdrawalDetailFromDate('');
                    setWithdrawalDetailToDate('');
                  }}
                  className="px-2.5 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-white transition"
                >
                  Clear dates
                </button>
              )}
              <ListSearchInput
                value={withdrawalDetailSearchQuery}
                onChange={setWithdrawalDetailSearchQuery}
                placeholder="Search transactions..."
              />
              <CsvDownloadButton
                label="Download withdrawal transactions CSV"
                busy={exportBusy}
                onClick={() => void runExport(() =>
                  downloadWithdrawalUserDetailCsv(
                    token!,
                    selectedWithdrawalUser!.user_id,
                    withdrawalDetailFromDate || undefined,
                    withdrawalDetailToDate || undefined,
                    withdrawalDetailSearchQuery || undefined,
                  ))}
                disabled={
                  withdrawalTransactionsList.loading
                  || (
                    withdrawalTransactionsList.items.length === 0
                    && !withdrawalDetailFromDate
                    && !withdrawalDetailToDate
                  )
                }
              />
            </div>
          </div>

          {withdrawalTransactionsList.loading && withdrawalTransactionsList.items.length === 0 ? (
            <TableSkeleton rows={6} columns={6} />
          ) : withdrawalDetailMeta ? (
            <>
              <div className="overflow-x-auto rounded-2xl border border-white/5">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/60 text-[10px] uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-bold">Date</th>
                      <th className="px-4 py-3 font-bold">Amount</th>
                      <th className="px-4 py-3 font-bold">Bank account</th>
                    </tr>
                  </thead>
                  <tbody>
                    {withdrawalTransactionsList.items.length > 0 ? (
                      withdrawalTransactionsList.items.map((row) => (
                        <tr key={row.id} className="border-t border-white/5">
                          <td className="px-4 py-3 text-slate-500">
                            {formatLocalDateTime(row.created_at)}
                          </td>
                          <td className="px-4 py-3 font-bold text-white">
                            {formatInrFromPaise(row.amount_paise)}
                          </td>
                          <td className="px-4 py-3 text-slate-400">
                            <p>{row.bank_name || '—'}</p>
                            <p className="text-[10px] text-slate-500">
                              {row.account_number_masked || '—'}
                              {row.ifsc_code ? ` · ${row.ifsc_code}` : ''}
                            </p>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr className="border-t border-white/5">
                        <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                          No withdrawal transactions found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <LazyListSentinel
                  hasMore={withdrawalTransactionsList.hasMore}
                  loading={withdrawalTransactionsList.loadingMore}
                  onLoadMore={() => void withdrawalTransactionsList.loadMore()}
                />
              </div>
            </>
          ) : null}
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="bg-slate-900/10 border border-white/3 p-6 rounded-3xl shadow-inner max-w-3xl">
          <RevenueSettingsPanel />
        </div>
      )}
    </div>
  );
};

export default AccountsManagement;
