import React, { useEffect, useState } from 'react';
import { IndianRupee, Percent, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { showError, showSuccess } from '../utils/swal';
import {
  bpsToPercent,
  fetchRevenueSettings,
  formatInrFromPaise,
  saveRevenueSettings,
  type RevenueSettings,
} from '../utils/wallet';
import { Skeleton } from '../components/shared/skeleton';

export const RevenueSettingsPanel: React.FC = () => {
  const { token } = useAuth();
  const [settings, setSettings] = useState<RevenueSettings | null>(null);
  const [form, setForm] = useState<Partial<RevenueSettings>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const cfg = await fetchRevenueSettings(token);
      setSettings(cfg);
      setForm(cfg);
    } catch (err) {
      showError('Revenue settings', err instanceof Error ? err.message : 'Could not load settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, [token]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    try {
      const saved = await saveRevenueSettings(token, {
        premium_monthly_paise: Number(form.premium_monthly_paise),
        premium_yearly_paise: Number(form.premium_yearly_paise),
        company_share_bps: Number(form.company_share_bps),
        owner_share_bps: Number(form.owner_share_bps),
        min_track_seconds: Number(form.min_track_seconds),
        min_radio_heartbeat_sec: Number(form.min_radio_heartbeat_sec),
        min_withdrawal_paise: Number(form.min_withdrawal_paise),
        daily_settlement_enabled: Boolean(form.daily_settlement_enabled),
        min_valid_daily_listen_seconds: Number(form.min_valid_daily_listen_seconds),
      });
      setSettings(saved);
      setForm(saved);
      showSuccess('Revenue settings saved. Daily settlement uses company/owner shares and listen duration.');
    } catch (err) {
      showError('Save failed', err instanceof Error ? err.message : 'Could not save settings.');
    } finally {
      setBusy(false);
    }
  };

  const setField = (key: keyof RevenueSettings, value: string) => {
    setForm((prev) => ({ ...prev, [key]: Number(value) }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <IndianRupee className="w-4 h-4 text-rose-400" /> Revenue & Payouts
        </h3>
        <button
          type="button"
          onClick={() => void reload()}
          className="p-2 rounded-xl border border-white/10 text-slate-300 hover:text-white transition flex-shrink-0"
          aria-label="Refresh revenue settings"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <form onSubmit={handleSave} className="rounded-2xl border border-white/10 bg-slate-950/40 p-5 space-y-5">
        {loading && !settings ? (
          <div className="space-y-5">
            <Skeleton className="h-4 w-40" />
            <div className="grid sm:grid-cols-2 gap-3">
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
            <Skeleton className="h-4 w-48" />
            <div className="grid sm:grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, idx) => (
                <Skeleton key={idx} className="h-10 w-full rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-4 w-56" />
            <div className="grid sm:grid-cols-2 gap-3">
              {Array.from({ length: 5 }).map((_, idx) => (
                <Skeleton key={idx} className="h-10 w-full rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-9 w-40 rounded-xl" />
          </div>
        ) : (
        <>
        <h4 className="text-sm font-bold text-white flex items-center gap-2">
          <IndianRupee className="w-4 h-4" /> Subscription prices
        </h4>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-xs text-slate-400 space-y-1">
            Premium monthly (paise)
            <input
              type="number"
              value={form.premium_monthly_paise ?? ''}
              onChange={(e) => setField('premium_monthly_paise', e.target.value)}
              className="w-full bg-slate-950/70 border border-white/10 rounded-xl px-3 py-2 text-white"
            />
          </label>
          <label className="text-xs text-slate-400 space-y-1">
            Premium yearly (paise)
            <input
              type="number"
              value={form.premium_yearly_paise ?? ''}
              onChange={(e) => setField('premium_yearly_paise', e.target.value)}
              className="w-full bg-slate-950/70 border border-white/10 rounded-xl px-3 py-2 text-white"
            />
          </label>
        </div>

        <h4 className="text-sm font-bold text-white flex items-center gap-2 pt-2">
          <Percent className="w-4 h-4" /> Daily settlement split (basis points, total 10000 = 100%)
        </h4>
        <div className="grid sm:grid-cols-2 gap-3">
          {(['company_share_bps', 'owner_share_bps'] as const).map((key) => (
            <label key={key} className="text-xs text-slate-400 space-y-1">
              {key.replace(/_/g, ' ')}
              <input
                type="number"
                value={form[key] ?? ''}
                onChange={(e) => setField(key, e.target.value)}
                className="w-full bg-slate-950/70 border border-white/10 rounded-xl px-3 py-2 text-white"
              />
              <span className="text-[10px] text-slate-500">{form[key] != null ? bpsToPercent(form[key] as number) : ''}</span>
            </label>
          ))}
        </div>
        <p className="text-[10px] text-slate-500">
          Each subscriber&apos;s daily creator pool is shared by listen duration among creators they heard that day.
        </p>

        <h4 className="text-sm font-bold text-white pt-2">Playback & settlement rules</h4>
        <div className="grid sm:grid-cols-2 gap-3">
          {([
            ['min_track_seconds', 'Min track seconds for qualifying play'],
            ['min_radio_heartbeat_sec', 'Radio heartbeat interval (sec)'],
            ['min_valid_daily_listen_seconds', 'Min total listen seconds / day to settle'],
            ['min_withdrawal_paise', 'Min withdrawal (paise)'],
          ] as const).map(([key, label]) => (
            <label key={key} className="text-xs text-slate-400 space-y-1">
              {label}
              <input
                type="number"
                value={form[key] ?? ''}
                onChange={(e) => setField(key, e.target.value)}
                className="w-full bg-slate-950/70 border border-white/10 rounded-xl px-3 py-2 text-white"
              />
            </label>
          ))}
          <label className="text-xs text-slate-400 space-y-1 flex items-center gap-2 sm:col-span-2 pt-2">
            <input
              type="checkbox"
              checked={Boolean(form.daily_settlement_enabled)}
              onChange={(e) => setForm((prev) => ({ ...prev, daily_settlement_enabled: e.target.checked }))}
              className="rounded border-white/20"
            />
            Daily settlement enabled
          </label>
        </div>

        {settings && (
          <p className="text-[10px] text-slate-500">
            Current checkout prices: {formatInrFromPaise(settings.premium_monthly_paise)}/month ·{' '}
            {formatInrFromPaise(settings.premium_yearly_paise)}/year
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 rounded-xl text-xs font-bold text-white"
        >
          Save revenue settings
        </button>
        </>
        )}
      </form>
    </div>
  );
};
