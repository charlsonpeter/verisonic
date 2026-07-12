import React, { useEffect, useState } from 'react';
import { Download, Mail } from 'lucide-react';
import { AppModal } from '../shared/AppModal';
import { DatePicker } from '../shared/DatePicker';
import {
  downloadWithdrawalsCsv,
  emailWithdrawalsCsv,
} from '../../utils/wallet';
import { showSuccess } from '../../utils/swal';
import { monthStartDateInputValue, todayDateInputValue } from '../../utils/dateTime';

interface WithdrawalsExportModalProps {
  open: boolean;
  onClose: () => void;
  token: string;
  userEmail: string;
}

export const WithdrawalsExportModal: React.FC<WithdrawalsExportModalProps> = ({
  open,
  onClose,
  token,
  userEmail,
}) => {
  const [fromDate, setFromDate] = useState(monthStartDateInputValue);
  const [toDate, setToDate] = useState(todayDateInputValue);
  const [busy, setBusy] = useState<'download' | 'email' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFromDate(monthStartDateInputValue());
    setToDate(todayDateInputValue());
    setError(null);
    setBusy(null);
  }, [open]);

  const validateRange = (): boolean => {
    if (!fromDate || !toDate) {
      setError('Select both start and end dates.');
      return false;
    }
    if (toDate < fromDate) {
      setError('End date must be on or after start date.');
      return false;
    }
    setError(null);
    return true;
  };

  const handleDownload = async () => {
    if (!validateRange()) return;
    setBusy('download');
    setError(null);
    try {
      await downloadWithdrawalsCsv(token, fromDate, toDate);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed.');
    } finally {
      setBusy(null);
    }
  };

  const handleEmail = async () => {
    if (!validateRange()) return;
    setBusy('email');
    setError(null);
    try {
      const result = await emailWithdrawalsCsv(token, fromDate, toDate);
      showSuccess(result.message);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send email.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <AppModal
      open={open}
      onClose={() => !busy && onClose()}
      maxWidth="md"
      header={
        <div>
          <h2 className="text-lg font-bold text-white">Export withdrawals</h2>
          <p className="text-xs text-slate-400 mt-1">Payout register for bank reconciliation</p>
        </div>
      }
      footer={
        <div className="flex flex-col sm:flex-row gap-2 sm:justify-end w-full">
          <button
            type="button"
            onClick={() => void handleEmail()}
            disabled={Boolean(busy)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 text-slate-200 hover:bg-white/5 disabled:opacity-50 text-xs font-bold transition"
          >
            <Mail className="w-4 h-4" />
            {busy === 'email' ? 'Sending…' : 'Send to email'}
          </button>
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={Boolean(busy)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition"
          >
            <Download className="w-4 h-4" />
            {busy === 'download' ? 'Downloading…' : 'Download CSV'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">From</span>
            <DatePicker
              value={fromDate}
              max={toDate}
              onChange={setFromDate}
              className="mt-1.5"
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">To</span>
            <DatePicker
              value={toDate}
              min={fromDate}
              max={todayDateInputValue()}
              onChange={setToDate}
              className="mt-1.5"
            />
          </label>
        </div>

        <p className="text-xs text-slate-400">
          Email will be sent to <span className="text-slate-200 font-medium">{userEmail}</span>.
        </p>

        {error && (
          <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </div>
    </AppModal>
  );
};
