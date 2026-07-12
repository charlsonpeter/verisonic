import React, { useEffect, useState } from 'react';
import {
  Wallet as WalletIcon,
  ArrowDownToLine,
  Download,
  RefreshCw,
  History,
  Lightbulb,
  Radio,
  Music,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { showConfirm, showError, showSuccess } from '../utils/swal';
import { EarningsChart } from '../components/wallet/EarningsChart';
import { WithdrawModal } from '../components/wallet/WithdrawModal';
import { WithdrawalsExportModal } from '../components/wallet/WithdrawalsExportModal';
import {
  deleteSavedBankAccount,
  fetchBankAccount,
  fetchMyWithdrawals,
  fetchWalletSummary,
  formatInrFromPaise,
  requestWithdrawal,
  type BankAccount,
  type WalletSummary,
  type WithdrawalRequest,
} from '../utils/wallet';

export const Wallet: React.FC = () => {
  const { token, currentUser } = useAuth();
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [savedBank, setSavedBank] = useState<BankAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartRefreshKey, setChartRefreshKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const role = currentUser?.real_role || currentUser?.role;

  const reload = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [sum, reqs, acct] = await Promise.all([
        fetchWalletSummary(token),
        fetchMyWithdrawals(token),
        fetchBankAccount(token),
      ]);
      setSummary(sum);
      setWithdrawals(reqs.slice(0, 10));
      setSavedBank(acct);
      setChartRefreshKey((k) => k + 1);
    } catch (err) {
      showError('Wallet', err instanceof Error ? err.message : 'Could not load wallet.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, [token]);

  const handleWithdrawSubmit = async (payload: {
    amountPaise: number;
    bank: {
      account_holder_name: string;
      bank_name: string;
      account_number: string;
      ifsc_code: string;
    };
    saveBankAccount: boolean;
  }) => {
    if (!token) return;
    setBusy(true);
    try {
      await requestWithdrawal(token, {
        amount_paise: payload.amountPaise,
        account_holder_name: payload.bank.account_holder_name,
        bank_name: payload.bank.bank_name || undefined,
        account_number: payload.bank.account_number,
        ifsc_code: payload.bank.ifsc_code,
        save_bank_account: payload.saveBankAccount,
      });
      showSuccess('Withdrawal completed.');
      setWithdrawOpen(false);
      await reload();
    } catch (err) {
      showError('Withdrawal', err instanceof Error ? err.message : 'Could not complete withdrawal.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveSavedBank = async () => {
    if (!token) return;
    const ok = await showConfirm(
      'Remove saved bank details',
      'This will delete your saved bank account from VeriSonic.',
      'Remove',
    );
    if (!ok) return;
    setBusy(true);
    try {
      await deleteSavedBankAccount(token);
      setSavedBank(null);
      showSuccess('Saved bank details removed.');
      await reload();
    } catch (err) {
      showError('Bank details', err instanceof Error ? err.message : 'Could not remove saved details.');
    } finally {
      setBusy(false);
    }
  };

  if (role !== 'studio_admin' && role !== 'radio_admin') {
    return (
      <div className="w-full min-h-[50vh] flex items-center justify-center text-slate-400">
        Wallet is available to studio and radio admins only.
      </div>
    );
  }

  const tips =
    role === 'radio_admin'
      ? [
          'Only active Premium listeners count — free accounts do not.',
          'Credits apply while someone is tuned in to your station, not from your own listens.',
          'Withdraw anytime; the amount is deducted from your balance immediately.',
        ]
      : [
          'Only active Premium listeners count — free accounts do not.',
          'A track must pass the minimum listen time before that play pays out.',
          'Withdraw anytime; the amount is deducted from your balance immediately.',
        ];

  return (
    <div className="w-full min-h-full flex flex-col pb-8 md:pb-10">
      {/* Top bar — title left, actions right */}
      <div className="flex items-center justify-between gap-4 mb-6 md:mb-8">
        <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
          <WalletIcon className="w-5 h-5 md:w-6 md:h-6 text-rose-400" />
          Wallet
        </h1>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => setWithdrawOpen(true)}
            disabled={!summary || summary.balance_paise <= 0 || busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-[11px] font-bold text-white transition"
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
            Withdraw
          </button>
          <button
            type="button"
            onClick={() => void reload()}
            disabled={loading}
            className="p-2 rounded-xl border border-white/10 text-slate-300 hover:text-white transition"
            aria-label="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 3-column body — col 3 narrower */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 md:gap-6 min-h-0 items-stretch">
        {/* Col 1 — recent earnings */}
        <div className="lg:col-span-6 flex flex-col min-h-[280px]">
          <EarningsChart token={token!} refreshKey={chartRefreshKey} />
        </div>

        {/* Col 2 — recent withdrawals */}
        <div className="lg:col-span-4 rounded-2xl border border-white/10 bg-slate-900/40 p-5 flex flex-col min-h-[280px]">
          <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2 flex-shrink-0">
            <History className="w-4 h-4 text-slate-400" />
            Recent withdrawals
            <span className="text-[10px] font-normal text-slate-500">Last 10</span>
            <button
              type="button"
              onClick={() => setExportOpen(true)}
              className="ml-auto p-1.5 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:border-white/20 transition"
              aria-label="Export withdrawals"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </h2>
          {withdrawals.length === 0 ? (
            <p className="text-xs text-slate-500 py-8 text-center border border-dashed border-white/10 rounded-xl flex-1 flex items-center justify-center">
              No withdrawals yet.
            </p>
          ) : (
            <div className="overflow-y-auto flex-1 min-h-0 -mx-1 px-1">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-900/95 backdrop-blur-sm">
                  <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 border-b border-white/5">
                    <th className="pb-2 font-bold">Date</th>
                    <th className="pb-2 font-bold">Amount</th>
                    <th className="pb-2 font-bold text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {withdrawals.map((row) => (
                    <tr key={row.id} className="border-b border-white/5 last:border-0">
                      <td className="py-2.5 text-slate-400">
                        {new Date(row.created_at).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </td>
                      <td className="py-2.5 text-white font-bold">{formatInrFromPaise(row.amount_paise)}</td>
                      <td className="py-2.5 text-right">
                        <span className="inline-block px-2 py-0.5 rounded-md bg-slate-800 text-[10px] font-bold uppercase text-slate-300">
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Col 3 — balance (top) + tips (below) */}
        <div className="lg:col-span-2 flex flex-col gap-4 min-h-[280px]">
          <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4 flex-shrink-0 text-right">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Available balance</p>
            <p className="text-2xl font-extrabold text-white mt-1 tracking-tight tabular-nums">
              {summary ? formatInrFromPaise(summary.balance_paise) : '—'}
            </p>
          </div>

          <div className="rounded-2xl border border-amber-500/15 bg-amber-500/5 p-4 flex-1 flex flex-col min-h-0">
            <h2 className="text-xs font-bold text-amber-200 mb-2 flex items-center gap-2 flex-shrink-0">
              <Lightbulb className="w-3.5 h-3.5" />
              How it works
            </h2>
            <ul className="space-y-2 overflow-y-auto flex-1 min-h-0">
              {tips.map((tip) => (
                <li key={tip} className="flex items-start gap-2 text-[11px] leading-snug text-amber-100/80">
                  {role === 'radio_admin' ? (
                    <Radio className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                  ) : (
                    <Music className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                  )}
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <WithdrawModal
        open={withdrawOpen}
        onClose={() => !busy && setWithdrawOpen(false)}
        summary={summary}
        savedBank={savedBank}
        busy={busy}
        onSubmit={handleWithdrawSubmit}
        onRemoveSavedBank={() => void handleRemoveSavedBank()}
      />

      {token && currentUser?.email && (
        <WithdrawalsExportModal
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          token={token}
          userEmail={currentUser.email}
        />
      )}
    </div>
  );
};
