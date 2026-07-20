import React, { useEffect, useMemo, useState } from 'react';
import { DatePicker } from '../shared/DatePicker';
import {
  EARNINGS_PERIOD_OPTIONS,
  buildEarningsSeriesForRange,
  earningsRangeQueryParams,
  fetchWalletLedger,
  formatInrFromPaise,
  resolveEarningsChartRange,
  type EarningsPeriod,
  type WalletLedgerEntry,
} from '../../utils/wallet';
import { formatDateInputValue, todayDateInputValue } from '../../utils/dateTime';

interface EarningsChartProps {
  token: string;
  refreshKey?: number;
}

function weekAgoInputValue(): string {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return formatDateInputValue(d);
}

export const EarningsChart: React.FC<EarningsChartProps> = ({ token, refreshKey = 0 }) => {
  const [period, setPeriod] = useState<EarningsPeriod>('today');
  const [customStart, setCustomStart] = useState(weekAgoInputValue);
  const [customEnd, setCustomEnd] = useState(todayDateInputValue);
  const [ledger, setLedger] = useState<WalletLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(
    () => resolveEarningsChartRange(period, customStart, customEnd),
    [period, customStart, customEnd],
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const { from, to } = earningsRangeQueryParams(range);
        const rows = await fetchWalletLedger(token, from, to);
        if (!cancelled) setLedger(rows);
      } catch (err) {
        if (!cancelled) {
          setLedger([]);
          setError(err instanceof Error ? err.message : 'Failed to load earnings.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [token, range, refreshKey]);

  const data = useMemo(
    () => buildEarningsSeriesForRange(ledger, range),
    [ledger, range],
  );

  const maxAmount = useMemo(
    () => Math.max(...data.map((d) => d.amountPaise), 1),
    [data],
  );

  const periodTotal = useMemo(
    () => data.reduce((sum, d) => sum + d.amountPaise, 0),
    [data],
  );

  const denseChart = data.length > 14;

  if (loading) {
    return (
      <div className="h-56 rounded-2xl bg-slate-900/40 border border-white/5 animate-pulse" />
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-5 flex flex-col min-h-[280px]">
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-white">{range.title}</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">Premium listener plays & radio listen time</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{range.totalLabel}</p>
            <p className="text-sm font-bold text-emerald-300">{formatInrFromPaise(periodTotal)}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {EARNINGS_PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setPeriod(opt.id)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide transition ${
                period === opt.id
                  ? 'bg-emerald-600/25 border border-emerald-500/40 text-emerald-200'
                  : 'bg-slate-950/50 border border-white/10 text-slate-400 hover:text-white hover:border-white/20'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {period === 'custom' && (
          <div className="flex flex-wrap items-center gap-2">
            <DatePicker
              value={customStart}
              max={customEnd}
              onChange={setCustomStart}
              size="sm"
              className="w-[9.5rem]"
            />
            <span className="text-[10px] text-slate-500">to</span>
            <DatePicker
              value={customEnd}
              min={customStart}
              max={todayDateInputValue()}
              onChange={setCustomEnd}
              size="sm"
              className="w-[9.5rem]"
            />
          </div>
        )}
      </div>

      {error ? (
        <div className="flex-1 min-h-[10rem] flex items-center justify-center rounded-xl border border-dashed border-red-500/20 bg-red-500/5">
          <p className="text-xs text-red-300">{error}</p>
        </div>
      ) : periodTotal === 0 ? (
        <div className="flex-1 min-h-[10rem] flex items-center justify-center rounded-xl border border-dashed border-white/10 bg-slate-950/30">
          <p className="text-xs text-slate-500">No earnings recorded for this period.</p>
        </div>
      ) : (
        <div
          className={`flex-1 min-h-[10rem] flex items-end gap-1 px-0.5 ${
            denseChart ? 'overflow-x-auto pb-1' : 'justify-between gap-2'
          }`}
        >
          {data.map((point) => {
            const heightPct = maxAmount > 0 ? (point.amountPaise / maxAmount) * 100 : 0;
            const barHeight = Math.max(heightPct, point.amountPaise > 0 ? 8 : 2);
            return (
              <div
                key={point.date}
                className={`flex flex-col items-center gap-1.5 min-w-0 ${
                  denseChart ? 'flex-shrink-0 w-9' : 'flex-1'
                }`}
              >
                {!denseChart && (
                  <span className="text-[9px] text-slate-500 font-medium truncate w-full text-center">
                    {point.amountPaise > 0 ? formatInrFromPaise(point.amountPaise) : '—'}
                  </span>
                )}
                <div className={`w-full ${denseChart ? 'h-24' : 'h-28'} flex items-end justify-center`}>
                  <div
                    className={`rounded-t-md bg-gradient-to-t from-emerald-600/80 to-emerald-400/90 transition-all duration-500 ${
                      denseChart ? 'w-5' : 'w-full max-w-[2.25rem]'
                    }`}
                    style={{ height: `${barHeight}%` }}
                    title={`${point.label}: ${formatInrFromPaise(point.amountPaise)}`}
                  />
                </div>
                <span
                  className={`text-slate-400 font-bold truncate w-full text-center ${
                    denseChart ? 'text-[8px]' : 'text-[10px]'
                  }`}
                >
                  {point.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
