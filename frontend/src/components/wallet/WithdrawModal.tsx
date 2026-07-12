import React, { useEffect, useState } from 'react';
import { ArrowDownToLine, Landmark } from 'lucide-react';
import { AppModal } from '../shared/AppModal';
import { formatInrFromPaise } from '../../utils/wallet';
import type { BankAccount, WalletSummary } from '../../utils/wallet';

export interface WithdrawFormState {
  account_holder_name: string;
  bank_name: string;
  account_number: string;
  ifsc_code: string;
}

interface WithdrawModalProps {
  open: boolean;
  onClose: () => void;
  summary: WalletSummary | null;
  savedBank: BankAccount | null;
  busy: boolean;
  onSubmit: (payload: {
    amountPaise: number;
    bank: WithdrawFormState;
    saveBankAccount: boolean;
  }) => void;
  onRemoveSavedBank: () => void;
}

export const WithdrawModal: React.FC<WithdrawModalProps> = ({
  open,
  onClose,
  summary,
  savedBank,
  busy,
  onSubmit,
  onRemoveSavedBank,
}) => {
  const [amountRupees, setAmountRupees] = useState('');
  const [useSavedBank, setUseSavedBank] = useState(Boolean(savedBank));
  const [saveBankAccount, setSaveBankAccount] = useState(false);
  const [bankForm, setBankForm] = useState<WithdrawFormState>({
    account_holder_name: '',
    bank_name: '',
    account_number: '',
    ifsc_code: '',
  });

  useEffect(() => {
    if (!open) return;
    setUseSavedBank(Boolean(savedBank));
    setSaveBankAccount(false);
    if (savedBank) {
      setBankForm({
        account_holder_name: savedBank.account_holder_name,
        bank_name: savedBank.bank_name || '',
        account_number: '',
        ifsc_code: savedBank.ifsc_code,
      });
    } else {
      setBankForm({
        account_holder_name: '',
        bank_name: '',
        account_number: '',
        ifsc_code: '',
      });
    }
  }, [open, savedBank]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const rupees = Number(amountRupees);
    if (!Number.isFinite(rupees) || rupees <= 0) return;
    onSubmit({
      amountPaise: Math.round(rupees * 100),
      bank: bankForm,
      saveBankAccount: useSavedBank ? false : saveBankAccount,
    });
  };

  const setMaxAmount = () => {
    if (!summary) return;
    setAmountRupees((summary.balance_paise / 100).toFixed(2));
  };

  return (
    <AppModal
      open={open}
      onClose={onClose}
      maxWidth="md"
      header={
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <ArrowDownToLine className="w-5 h-5 text-rose-400" />
            Withdraw to bank
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Min {summary ? formatInrFromPaise(summary.min_withdrawal_paise) : '—'} · deducted instantly from wallet
          </p>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold block mb-1.5">
            Amount (₹)
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={amountRupees}
              onChange={(e) => setAmountRupees(e.target.value)}
              placeholder="0.00"
              className="flex-1 bg-slate-950/70 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white"
            />
            <button
              type="button"
              onClick={setMaxAmount}
              className="px-3 py-2 rounded-xl border border-white/10 text-[10px] font-bold uppercase text-slate-300 hover:text-white hover:border-rose-500/30"
            >
              Max
            </button>
          </div>
          {summary && (
            <p className="text-[10px] text-slate-500 mt-1">
              Available: {formatInrFromPaise(summary.balance_paise)}
            </p>
          )}
        </div>

        {savedBank && (
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Bank account</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setUseSavedBank(true);
                  setBankForm({
                    account_holder_name: savedBank.account_holder_name,
                    bank_name: savedBank.bank_name || '',
                    account_number: '',
                    ifsc_code: savedBank.ifsc_code,
                  });
                }}
                className={`text-left p-3 rounded-xl border transition ${
                  useSavedBank
                    ? 'border-cyan-500/40 bg-cyan-500/10'
                    : 'border-white/10 bg-slate-950/40 hover:border-white/20'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Landmark className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-[10px] font-bold uppercase text-cyan-300">Saved</span>
                </div>
                <p className="text-xs text-white font-medium truncate">{savedBank.account_holder_name}</p>
                <p className="text-[10px] text-slate-500">{savedBank.account_number_masked} · {savedBank.ifsc_code}</p>
              </button>
              <button
                type="button"
                onClick={() => {
                  setUseSavedBank(false);
                  setSaveBankAccount(false);
                  setBankForm({
                    account_holder_name: '',
                    bank_name: '',
                    account_number: '',
                    ifsc_code: '',
                  });
                }}
                className={`text-left p-3 rounded-xl border transition ${
                  !useSavedBank
                    ? 'border-rose-500/40 bg-rose-500/10'
                    : 'border-white/10 bg-slate-950/40 hover:border-white/20'
                }`}
              >
                <p className="text-[10px] font-bold uppercase text-rose-300 mb-1">New account</p>
                <p className="text-[10px] text-slate-500">Enter different bank details</p>
              </button>
            </div>
            {useSavedBank && (
              <button
                type="button"
                onClick={onRemoveSavedBank}
                className="text-[10px] font-bold text-slate-500 hover:text-rose-300 uppercase tracking-wider"
              >
                Remove saved account
              </button>
            )}
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          <input
            required
            readOnly={useSavedBank && Boolean(savedBank)}
            value={bankForm.account_holder_name}
            onChange={(e) => setBankForm({ ...bankForm, account_holder_name: e.target.value })}
            placeholder="Account holder name"
            className="bg-slate-950/70 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white disabled:opacity-70"
          />
          <input
            readOnly={useSavedBank && Boolean(savedBank)}
            value={bankForm.bank_name}
            onChange={(e) => setBankForm({ ...bankForm, bank_name: e.target.value })}
            placeholder="Bank name (optional)"
            className="bg-slate-950/70 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white disabled:opacity-70"
          />
          <input
            required
            value={bankForm.account_number}
            onChange={(e) => setBankForm({ ...bankForm, account_number: e.target.value })}
            placeholder={
              useSavedBank && savedBank
                ? `Confirm account ···${savedBank.account_number_masked.slice(-4)}`
                : 'Account number'
            }
            className="bg-slate-950/70 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white"
          />
          <input
            required
            readOnly={useSavedBank && Boolean(savedBank)}
            value={bankForm.ifsc_code}
            onChange={(e) => setBankForm({ ...bankForm, ifsc_code: e.target.value.toUpperCase() })}
            placeholder="IFSC code"
            className="bg-slate-950/70 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white disabled:opacity-70"
          />
        </div>

        {!useSavedBank && (
          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={saveBankAccount}
              onChange={(e) => setSaveBankAccount(e.target.checked)}
              className="rounded border-white/20"
            />
            Save for next time (encrypted)
          </label>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full px-5 py-3 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 rounded-xl text-sm font-bold text-white"
        >
          {busy ? 'Processing…' : 'Confirm withdrawal'}
        </button>
      </form>
    </AppModal>
  );
};
