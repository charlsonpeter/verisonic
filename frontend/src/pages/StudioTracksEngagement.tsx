import React, { useState, useCallback } from 'react';
import { ArrowLeft, Disc, MessageSquare, Radio, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLazyList, DEFAULT_LAZY_PAGE_SIZE } from '../hooks/useLazyList';
import { LazyListSentinel } from '../components/shared/LazyListSentinel';
import { ListSearchInput } from '../components/shared/ListSearchInput';
import { TableSkeleton, TrackCardSkeleton } from '../components/shared/skeleton';
import { TrackEngagementModal } from '../components/shared/TrackEngagementModal';
import { ProgramEngagementModal } from '../components/shared/ProgramEngagementModal';
import { formatProgramSchedule } from '../utils/radioPrograms';

interface EngagementAccountRow {
  kind: 'studio' | 'radio';
  id: number;
  name: string;
  city?: string;
  country?: string;
  owner_name?: string;
  is_active: boolean;
  has_programs?: boolean;
}

interface TrackRow {
  id: number;
  title: string;
  album_title?: string;
  like_count?: number;
  dislike_count?: number;
  comment_count?: number;
}

interface ProgramRow {
  station_id: number;
  program_key: string;
  title: string;
  rj_name?: string;
  time_from?: string;
  time_to?: string;
  like_count?: number;
  dislike_count?: number;
  comment_count?: number;
}

type DetailView = 'tracks' | 'programs';

export const StudioTracksEngagement: React.FC = () => {
  const { token } = useAuth();
  const [view, setView] = useState<'accounts' | DetailView>('accounts');
  const [selectedAccount, setSelectedAccount] = useState<EngagementAccountRow | null>(null);
  const [accountSearch, setAccountSearch] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [engagementTrack, setEngagementTrack] = useState<TrackRow | null>(null);
  const [engagementProgram, setEngagementProgram] = useState<ProgramRow | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [programs, setPrograms] = useState<ProgramRow[]>([]);
  const [programsLoading, setProgramsLoading] = useState(false);

  const accountsList = useLazyList<EngagementAccountRow>({
    fetchPage: useCallback(async (offset, limit) => {
      if (!token) return { items: [], hasMore: false };
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (accountSearch.trim()) params.set('search', accountSearch.trim());
      const res = await fetch(`/api/auth/admin/engagements/accounts?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (offset === 0) {
          setAccountsError(typeof data.detail === 'string' ? data.detail : 'Could not load accounts.');
        }
        return { items: [], hasMore: false };
      }
      if (offset === 0) setAccountsError(null);
      const data = await res.json();
      return { items: data.items ?? [], hasMore: Boolean(data.has_more) };
    }, [token, accountSearch]),
    resetKey: view === 'accounts' ? accountSearch : 'detail-view',
    enabled: view === 'accounts' && !!token,
    pageSize: DEFAULT_LAZY_PAGE_SIZE,
  });

  const tracksList = useLazyList<TrackRow>({
    fetchPage: useCallback(async (offset, limit) => {
      if (!token || !selectedAccount || selectedAccount.kind !== 'studio') {
        return { items: [], hasMore: false };
      }
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (itemSearch.trim()) params.set('search', itemSearch.trim());
      const res = await fetch(
        `/api/auth/admin/studios/${selectedAccount.id}/tracks?${params}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (offset === 0) {
          setItemsError(typeof data.detail === 'string' ? data.detail : 'Could not load tracks.');
        }
        return { items: [], hasMore: false };
      }
      if (offset === 0) setItemsError(null);
      const data = await res.json();
      return { items: data.items ?? [], hasMore: Boolean(data.has_more) };
    }, [token, selectedAccount?.id, selectedAccount?.kind, itemSearch]),
    resetKey:
      view === 'tracks' && selectedAccount
        ? `${selectedAccount.id}-${itemSearch}`
        : 'accounts-view',
    enabled: view === 'tracks' && !!token && selectedAccount?.kind === 'studio',
    pageSize: DEFAULT_LAZY_PAGE_SIZE,
  });

  const loadPrograms = useCallback(async () => {
    if (!token || !selectedAccount || selectedAccount.kind !== 'radio') {
      setPrograms([]);
      return;
    }
    setProgramsLoading(true);
    setItemsError(null);
    try {
      const params = new URLSearchParams();
      if (itemSearch.trim()) params.set('search', itemSearch.trim());
      const res = await fetch(
        `/api/auth/admin/radio/${selectedAccount.id}/programs?${params}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setItemsError(typeof data.detail === 'string' ? data.detail : 'Could not load programs.');
        setPrograms([]);
        return;
      }
      const data = await res.json();
      setPrograms(data.items ?? []);
    } catch {
      setItemsError('Could not load programs.');
      setPrograms([]);
    } finally {
      setProgramsLoading(false);
    }
  }, [token, selectedAccount?.id, selectedAccount?.kind, itemSearch]);

  React.useEffect(() => {
    if (view === 'programs') {
      void loadPrograms();
    }
  }, [view, loadPrograms]);

  const canOpenAccount = (account: EngagementAccountRow) =>
    account.kind === 'studio' || (account.kind === 'radio' && account.has_programs);

  const openAccount = (account: EngagementAccountRow) => {
    if (!canOpenAccount(account)) return;
    setSelectedAccount(account);
    setItemSearch('');
    setItemsError(null);
    setView(account.kind === 'studio' ? 'tracks' : 'programs');
  };

  const backToAccounts = () => {
    setView('accounts');
    setSelectedAccount(null);
    setEngagementTrack(null);
    setEngagementProgram(null);
    setItemsError(null);
    setPrograms([]);
  };

  const renderTypeBadge = (kind: EngagementAccountRow['kind']) => (
    <span
      className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase border ${
        kind === 'studio'
          ? 'bg-violet-500/10 border-violet-500/25 text-violet-300'
          : 'bg-sky-500/10 border-sky-500/25 text-sky-300'
      }`}
    >
      {kind === 'studio' ? 'Studio' : 'Radio'}
    </span>
  );

  const renderEngagementCell = (
    counts: { like_count?: number; dislike_count?: number; comment_count?: number },
    onOpen: () => void,
  ) => (
    <button
      type="button"
      onClick={onOpen}
      className="inline-flex items-center gap-2 text-[10px] font-bold text-slate-400 hover:text-white transition"
      title="View engagement"
    >
      <span className="inline-flex items-center gap-0.5 text-emerald-400">
        <ThumbsUp className="w-3 h-3" /> {counts.like_count ?? 0}
      </span>
      <span className="text-slate-600">·</span>
      <span className="inline-flex items-center gap-0.5 text-rose-400">
        <ThumbsDown className="w-3 h-3" /> {counts.dislike_count ?? 0}
      </span>
      <span className="text-slate-600">·</span>
      <span className="inline-flex items-center gap-0.5 text-slate-300">
        <MessageSquare className="w-3 h-3" /> {counts.comment_count ?? 0}
      </span>
    </button>
  );

  if (view === 'accounts') {
    const accounts = accountsList.items;
    const isLoading = accountsList.loading;

    return (
      <div className="space-y-6 w-full max-w-[90rem] animate-page-entry font-sans">
        <div className="hidden md:block">
          <h2 className="text-3xl font-extrabold tracking-tight text-white">Engagements</h2>
        </div>

        <ListSearchInput
          value={accountSearch}
          onChange={setAccountSearch}
          placeholder="Search studios and radio stations..."
          className="w-full sm:w-auto"
        />

        {accountsError && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            {accountsError}
          </div>
        )}

        <div className="hidden md:block overflow-x-auto rounded-3xl border border-white/5 bg-slate-900/10 backdrop-blur-md">
          {isLoading && accounts.length === 0 ? (
            <TableSkeleton rows={6} columns={5} variant="generic" />
          ) : accounts.length === 0 ? (
            <div className="p-16 text-center space-y-3">
              <Disc className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-xs text-slate-500">No studios or radio stations found.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/5 bg-slate-950/40 text-slate-400 uppercase font-bold tracking-wider">
                  <th className="p-5">Type</th>
                  <th className="p-5">Name</th>
                  <th className="p-5">Location</th>
                  <th className="p-5">Owner</th>
                  <th className="p-5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {accounts.map((account) => {
                  const clickable = canOpenAccount(account);
                  return (
                    <tr
                      key={`${account.kind}-${account.id}`}
                      onClick={() => openAccount(account)}
                      className={`transition ${
                        clickable ? 'hover:bg-slate-900/20 cursor-pointer' : 'opacity-70 cursor-default'
                      }`}
                    >
                      <td className="p-5">{renderTypeBadge(account.kind)}</td>
                      <td className="p-5 font-bold text-slate-200">{account.name}</td>
                      <td className="p-5 text-slate-400">
                        {[account.city, account.country].filter(Boolean).join(', ') || '—'}
                      </td>
                      <td className="p-5 text-slate-400">{account.owner_name || '—'}</td>
                      <td className="p-5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase border ${
                            account.is_active
                              ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-450'
                              : 'bg-rose-500/10 border-rose-500/25 text-rose-400'
                          }`}
                        >
                          {account.is_active ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <LazyListSentinel
            hasMore={accountsList.hasMore}
            loading={accountsList.loadingMore}
            onLoadMore={accountsList.loadMore}
          />
        </div>

        <div className="md:hidden space-y-3">
          {isLoading && accounts.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-8">Loading accounts...</p>
          ) : accounts.length === 0 ? (
            <div className="p-12 text-center space-y-3 rounded-2xl border border-white/5 bg-slate-900/10">
              <Disc className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-xs text-slate-500">No studios or radio stations found.</p>
            </div>
          ) : (
            accounts.map((account) => {
              const clickable = canOpenAccount(account);
              const Wrapper = clickable ? 'button' : 'div';
              return (
                <Wrapper
                  key={`${account.kind}-${account.id}`}
                  {...(clickable
                    ? {
                        type: 'button' as const,
                        onClick: () => openAccount(account),
                        className:
                          'w-full text-left rounded-2xl border border-white/5 bg-slate-900/20 p-4 space-y-2 active:bg-slate-900/40 transition',
                      }
                    : {
                        className:
                          'w-full text-left rounded-2xl border border-white/5 bg-slate-900/20 p-4 space-y-2 opacity-70',
                      })}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-bold text-slate-200">{account.name}</div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {renderTypeBadge(account.kind)}
                      <span
                        className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase border ${
                          account.is_active
                            ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-450'
                            : 'bg-rose-500/10 border-rose-500/25 text-rose-400'
                        }`}
                      >
                        {account.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    {[account.city, account.country].filter(Boolean).join(', ') || 'No location'}
                  </p>
                  <p className="text-[10px] text-slate-500">{account.owner_name || 'Unknown owner'}</p>
                  {account.kind === 'radio' && !account.has_programs && (
                    <p className="text-[10px] text-slate-500 flex items-center gap-1">
                      <Radio className="w-3 h-3" />
                      No programs — engagement unavailable
                    </p>
                  )}
                </Wrapper>
              );
            })
          )}
          <LazyListSentinel
            hasMore={accountsList.hasMore}
            loading={accountsList.loadingMore}
            onLoadMore={accountsList.loadMore}
          />
        </div>
      </div>
    );
  }

  if (view === 'programs') {
    return (
      <div className="space-y-6 w-full max-w-[90rem] animate-page-entry font-sans">
        <div className="flex items-start gap-4">
          <button
            type="button"
            onClick={backToAccounts}
            className="p-2 rounded-xl border border-white/5 bg-slate-900/60 text-slate-400 hover:text-white transition flex-shrink-0"
            aria-label="Back to engagements"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0 hidden md:block">
            <h2 className="text-3xl font-extrabold tracking-tight text-white truncate">
              {selectedAccount?.name || 'Radio Station'}
            </h2>
          </div>
        </div>

        <ListSearchInput
          value={itemSearch}
          onChange={setItemSearch}
          placeholder="Search programs..."
          className="w-full sm:w-auto"
        />

        {itemsError && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            {itemsError}
          </div>
        )}

        <div className="hidden md:block overflow-x-auto rounded-3xl border border-white/5 bg-slate-900/10 backdrop-blur-md">
          {programsLoading ? (
            <TableSkeleton rows={6} columns={3} variant="generic" />
          ) : programs.length === 0 ? (
            <div className="p-16 text-center space-y-3">
              <Radio className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-xs text-slate-500">No programs for this radio station.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/5 bg-slate-950/40 text-slate-400 uppercase font-bold tracking-wider">
                  <th className="p-5">Program</th>
                  <th className="p-5">Schedule</th>
                  <th className="p-5">Engagement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {programs.map((program) => (
                  <tr key={program.program_key} className="hover:bg-slate-900/20 transition">
                    <td className="p-5">
                      <div className="font-bold text-slate-200">{program.title}</div>
                      {program.rj_name && (
                        <div className="text-[10px] text-slate-455 mt-0.5">Host: {program.rj_name}</div>
                      )}
                    </td>
                    <td className="p-5 text-slate-400">
                      {formatProgramSchedule({
                        id: program.program_key,
                        title: program.title,
                        timeFrom: program.time_from,
                        timeTo: program.time_to,
                      })}
                    </td>
                    <td className="p-5">
                      {renderEngagementCell(program, () => setEngagementProgram(program))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="md:hidden space-y-3">
          {programsLoading ? (
            <p className="text-xs text-slate-500 text-center py-8">Loading programs...</p>
          ) : programs.length === 0 ? (
            <div className="p-12 text-center space-y-3 rounded-2xl border border-white/5 bg-slate-900/10">
              <Radio className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-xs text-slate-500">No programs for this radio station.</p>
            </div>
          ) : (
            programs.map((program) => (
              <div
                key={program.program_key}
                className="rounded-2xl border border-white/5 bg-slate-900/20 p-4 space-y-3"
              >
                <div className="min-w-0">
                  <div className="font-bold text-slate-200">{program.title}</div>
                  {program.rj_name && (
                    <div className="text-[10px] text-slate-455 mt-0.5">Host: {program.rj_name}</div>
                  )}
                  <div className="text-[10px] text-slate-500 mt-1">
                    {formatProgramSchedule({
                      id: program.program_key,
                      title: program.title,
                      timeFrom: program.time_from,
                      timeTo: program.time_to,
                    })}
                  </div>
                </div>
                {renderEngagementCell(program, () => setEngagementProgram(program))}
              </div>
            ))
          )}
        </div>

        <ProgramEngagementModal
          stationId={engagementProgram?.station_id ?? null}
          programKey={engagementProgram?.program_key ?? null}
          programTitle={engagementProgram?.title}
          open={!!engagementProgram}
          onClose={() => setEngagementProgram(null)}
        />
      </div>
    );
  }

  const tracks = tracksList.items;
  const tracksLoading = tracksList.loading;

  return (
    <div className="space-y-6 w-full max-w-[90rem] animate-page-entry font-sans">
      <div className="flex items-start gap-4">
        <button
          type="button"
          onClick={backToAccounts}
          className="p-2 rounded-xl border border-white/5 bg-slate-900/60 text-slate-400 hover:text-white transition flex-shrink-0"
          aria-label="Back to engagements"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0 hidden md:block">
          <h2 className="text-3xl font-extrabold tracking-tight text-white truncate">
            {selectedAccount?.name || 'Studio'}
          </h2>
        </div>
      </div>

      <ListSearchInput
        value={itemSearch}
        onChange={setItemSearch}
        placeholder="Search tracks..."
        className="w-full sm:w-auto"
      />

      {itemsError && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {itemsError}
        </div>
      )}

      <div className="hidden md:block overflow-x-auto rounded-3xl border border-white/5 bg-slate-900/10 backdrop-blur-md">
        {tracksLoading && tracks.length === 0 ? (
          <TableSkeleton rows={6} columns={2} variant="generic" />
        ) : tracks.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <Disc className="w-10 h-10 text-slate-600 mx-auto" />
            <p className="text-xs text-slate-500">No approved tracks for this studio.</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/5 bg-slate-950/40 text-slate-400 uppercase font-bold tracking-wider">
                <th className="p-5">Track</th>
                <th className="p-5">Engagement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {tracks.map((t) => (
                <tr key={t.id} className="hover:bg-slate-900/20 transition">
                  <td className="p-5">
                    <div className="font-bold text-slate-200">{t.title}</div>
                    {t.album_title && (
                      <div className="text-[10px] text-slate-455 mt-0.5">Album: {t.album_title}</div>
                    )}
                  </td>
                  <td className="p-5">
                    {renderEngagementCell(t, () => setEngagementTrack(t))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <LazyListSentinel
          hasMore={tracksList.hasMore}
          loading={tracksList.loadingMore}
          onLoadMore={tracksList.loadMore}
        />
      </div>

      <div className="md:hidden space-y-3">
        {tracksLoading && tracks.length === 0 ? (
          <TrackCardSkeleton count={4} withCheckbox={false} />
        ) : tracks.length === 0 ? (
          <div className="p-12 text-center space-y-3 rounded-2xl border border-white/5 bg-slate-900/10">
            <Disc className="w-10 h-10 text-slate-600 mx-auto" />
            <p className="text-xs text-slate-500">No approved tracks for this studio.</p>
          </div>
        ) : (
          tracks.map((t) => (
            <div
              key={t.id}
              className="rounded-2xl border border-white/5 bg-slate-900/20 p-4 space-y-3"
            >
              <div className="min-w-0">
                <div className="font-bold text-slate-200 truncate">{t.title}</div>
                {t.album_title && (
                  <div className="text-[10px] text-slate-455 truncate mt-0.5">Album: {t.album_title}</div>
                )}
              </div>
              {renderEngagementCell(t, () => setEngagementTrack(t))}
            </div>
          ))
        )}
        <LazyListSentinel
          hasMore={tracksList.hasMore}
          loading={tracksList.loadingMore}
          onLoadMore={tracksList.loadMore}
        />
      </div>

      <TrackEngagementModal
        trackId={engagementTrack?.id ?? null}
        trackTitle={engagementTrack?.title}
        open={!!engagementTrack}
        onClose={() => setEngagementTrack(null)}
      />
    </div>
  );
};
