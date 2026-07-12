const API = '/api';

export interface WalletSummary {
  balance_paise: number;
  balance_rupees: number;
  pending_withdrawal_paise: number;
  available_paise: number;
  min_withdrawal_paise: number;
  has_saved_bank_account: boolean;
}

export interface WalletLedgerEntry {
  id: number;
  amount_paise: number;
  entry_type: string;
  description: string | null;
  created_at: string;
}

export interface BankAccount {
  account_holder_name: string;
  bank_name: string | null;
  account_number_masked: string;
  ifsc_code: string;
  updated_at: string | null;
}

export interface WithdrawalRequest {
  id: number;
  amount_paise: number;
  status: string;
  created_at: string;
  processed_at: string | null;
  admin_note: string | null;
}

export interface RevenueSettings {
  premium_monthly_paise: number;
  premium_yearly_paise: number;
  premium_monthly_rupees: number;
  premium_yearly_rupees: number;
  company_share_bps: number;
  owner_share_bps: number;
  studio_pool_bps: number;
  radio_pool_bps: number;
  min_track_seconds: number;
  min_radio_heartbeat_sec: number;
  estimated_qualifying_plays_per_day: number;
  estimated_radio_minutes_per_day: number;
  min_withdrawal_paise: number;
  updated_at: string | null;
}

export interface AdminWithdrawal extends WithdrawalRequest {
  user_id: number;
  user_email: string;
  user_name: string | null;
  account_holder_name: string | null;
  bank_name: string | null;
  account_number_masked: string | null;
  account_number?: string | null;
  ifsc_code: string | null;
}

export function formatInrFromPaise(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

export interface DailyEarningsPoint {
  date: string;
  label: string;
  amountPaise: number;
}

export type EarningsPeriod =
  | 'today'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'custom';

export interface EarningsChartRange {
  period: EarningsPeriod;
  title: string;
  totalLabel: string;
  start: Date;
  end: Date;
  bucket: 'day' | 'month' | 'hour';
}

export const EARNINGS_PERIOD_OPTIONS: { id: EarningsPeriod; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'this_week', label: 'This week' },
  { id: 'last_week', label: 'Last week' },
  { id: 'this_month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'this_year', label: 'This year' },
  { id: 'custom', label: 'Custom' },
];

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function startOfWeekMonday(d: Date): Date {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function earningsRangeQueryParams(range: EarningsChartRange): {
  from: string;
  to: string;
} {
  return {
    from: toDateKey(range.start),
    to: toDateKey(range.end),
  };
}

function positiveLedgerInRange(
  ledger: WalletLedgerEntry[],
  start: Date,
  end: Date,
): WalletLedgerEntry[] {
  const startMs = start.getTime();
  const endMs = end.getTime();
  return ledger.filter((entry) => {
    if (entry.amount_paise <= 0) return false;
    const t = new Date(entry.created_at).getTime();
    return t >= startMs && t <= endMs;
  });
}

export function resolveEarningsChartRange(
  period: EarningsPeriod,
  customStart?: string,
  customEnd?: string,
): EarningsChartRange {
  const today = startOfDay(new Date());

  if (period === 'today') {
    return {
      period,
      title: 'Earnings today',
      totalLabel: 'Today total',
      start: today,
      end: endOfDay(today),
      bucket: 'hour',
    };
  }

  if (period === 'this_week') {
    const start = startOfWeekMonday(today);
    return {
      period,
      title: 'Earnings this week',
      totalLabel: 'Week total',
      start,
      end: endOfDay(today),
      bucket: 'day',
    };
  }

  if (period === 'last_week') {
    const thisWeekStart = startOfWeekMonday(today);
    const start = new Date(thisWeekStart);
    start.setDate(start.getDate() - 7);
    const end = new Date(thisWeekStart);
    end.setDate(end.getDate() - 1);
    return {
      period,
      title: 'Earnings last week',
      totalLabel: 'Week total',
      start,
      end: endOfDay(end),
      bucket: 'day',
    };
  }

  if (period === 'this_month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return {
      period,
      title: 'Earnings this month',
      totalLabel: 'Month total',
      start,
      end: endOfDay(today),
      bucket: 'day',
    };
  }

  if (period === 'last_month') {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const end = new Date(today.getFullYear(), today.getMonth(), 0);
    return {
      period,
      title: 'Earnings last month',
      totalLabel: 'Month total',
      start,
      end: endOfDay(end),
      bucket: 'day',
    };
  }

  if (period === 'this_year') {
    const start = new Date(today.getFullYear(), 0, 1);
    return {
      period,
      title: 'Earnings this year',
      totalLabel: 'Year total',
      start,
      end: endOfDay(today),
      bucket: 'month',
    };
  }

  const start = customStart ? startOfDay(new Date(customStart)) : new Date(today);
  start.setDate(start.getDate() - 6);
  let end = customEnd ? endOfDay(new Date(customEnd)) : endOfDay(today);
  if (end < start) {
    end = endOfDay(start);
  }
  const daySpan =
    Math.floor((endOfDay(end).getTime() - start.getTime()) / (86400000)) + 1;
  return {
    period: 'custom',
    title: 'Custom earnings',
    totalLabel: 'Period total',
    start,
    end,
    bucket: daySpan > 62 ? 'month' : 'day',
  };
}

export function buildEarningsSeriesForRange(
  ledger: WalletLedgerEntry[],
  range: EarningsChartRange,
): DailyEarningsPoint[] {
  const credits = positiveLedgerInRange(ledger, range.start, range.end);

  if (range.bucket === 'hour') {
    const points: DailyEarningsPoint[] = [];
    for (let h = 0; h < 24; h += 1) {
      const hourStart = new Date(range.start);
      hourStart.setHours(h, 0, 0, 0);
      const hourEnd = new Date(range.start);
      hourEnd.setHours(h, 59, 59, 999);
      const amountPaise = credits
        .filter((entry) => {
          const t = new Date(entry.created_at).getTime();
          return t >= hourStart.getTime() && t <= hourEnd.getTime();
        })
        .reduce((sum, entry) => sum + entry.amount_paise, 0);
      const label =
        h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`;
      points.push({
        date: `${toDateKey(range.start)}-${h}`,
        label,
        amountPaise,
      });
    }
    return points;
  }

  if (range.bucket === 'month') {
    const points: DailyEarningsPoint[] = [];
    const cursor = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
    const endMonth = new Date(range.end.getFullYear(), range.end.getMonth(), 1);
    while (cursor <= endMonth) {
      const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const monthEnd = endOfDay(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0));
      const sliceStart = monthStart < range.start ? range.start : monthStart;
      const sliceEnd = monthEnd > range.end ? range.end : monthEnd;
      const amountPaise = credits
        .filter((entry) => {
          const t = new Date(entry.created_at).getTime();
          return t >= sliceStart.getTime() && t <= sliceEnd.getTime();
        })
        .reduce((sum, entry) => sum + entry.amount_paise, 0);
      points.push({
        date: toDateKey(monthStart),
        label: monthStart.toLocaleDateString('en-IN', { month: 'short' }),
        amountPaise,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return points;
  }

  const points: DailyEarningsPoint[] = [];
  const cursor = startOfDay(range.start);
  const last = startOfDay(range.end);
  while (cursor <= last) {
    const date = toDateKey(cursor);
    const amountPaise = credits
      .filter((entry) => entry.created_at.slice(0, 10) === date)
      .reduce((sum, entry) => sum + entry.amount_paise, 0);
    const dayCount =
      Math.floor((last.getTime() - startOfDay(range.start).getTime()) / 86400000) + 1;
    const label =
      dayCount <= 7
        ? cursor.toLocaleDateString('en-IN', { weekday: 'short' })
        : cursor.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    points.push({ date, label, amountPaise });
    cursor.setDate(cursor.getDate() + 1);
  }
  return points;
}

/** @deprecated Use buildEarningsSeriesForRange */
export function buildDailyEarningsSeries(
  ledger: WalletLedgerEntry[],
  days = 7,
): DailyEarningsPoint[] {
  const today = startOfDay(new Date());
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  return buildEarningsSeriesForRange(ledger, {
    period: 'this_week',
    title: 'Earnings',
    totalLabel: 'Total',
    start,
    end: endOfDay(today),
    bucket: 'day',
  });
}

export function bpsToPercent(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}

async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || 'Request failed.');
  }
  return data;
}

export async function fetchWalletSummary(token: string): Promise<WalletSummary> {
  const res = await fetch(`${API}/wallet/summary`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson(res);
}

export async function fetchWalletLedger(
  token: string,
  fromDate?: string,
  toDate?: string,
): Promise<WalletLedgerEntry[]> {
  const params = new URLSearchParams();
  if (fromDate) params.set('from', fromDate);
  if (toDate) params.set('to', toDate);
  const qs = params.toString();
  const res = await fetch(`${API}/wallet/ledger${qs ? `?${qs}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson(res);
}

export async function fetchBankAccount(token: string): Promise<BankAccount | null> {
  const res = await fetch(`${API}/wallet/bank-account`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson(res);
}

export async function saveBankAccount(
  token: string,
  payload: {
    account_holder_name: string;
    bank_name?: string;
    account_number: string;
    ifsc_code: string;
  },
): Promise<BankAccount> {
  const res = await fetch(`${API}/wallet/bank-account`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return parseJson(res);
}

export async function deleteSavedBankAccount(token: string): Promise<void> {
  const res = await fetch(`${API}/wallet/bank-account`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 204) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || 'Could not remove saved bank details.');
  }
}

export async function requestWithdrawal(
  token: string,
  payload: {
    amount_paise: number;
    account_holder_name: string;
    bank_name?: string;
    account_number: string;
    ifsc_code: string;
    save_bank_account?: boolean;
  },
): Promise<WithdrawalRequest> {
  const res = await fetch(`${API}/wallet/withdraw`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return parseJson(res);
}

export async function fetchMyWithdrawals(token: string): Promise<WithdrawalRequest[]> {
  const res = await fetch(`${API}/wallet/withdrawals`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson(res);
}

export function clientTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export async function downloadWithdrawalsCsv(
  token: string,
  fromDate: string,
  toDate: string,
  timezone: string = clientTimezone(),
): Promise<void> {
  const params = new URLSearchParams({
    from: fromDate,
    to: toDate,
    timezone,
  });
  const res = await fetch(`${API}/wallet/withdrawals/export.csv?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || 'Could not download export.');
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition');
  const match = disposition?.match(/filename="([^"]+)"/);
  const filename = match?.[1] ?? `verisonic-payouts-${fromDate}-to-${toDate}.csv`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function emailWithdrawalsCsv(
  token: string,
  fromDate: string,
  toDate: string,
  timezone: string = clientTimezone(),
): Promise<{ message: string }> {
  const res = await fetch(`${API}/wallet/withdrawals/export/email`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: fromDate, to: toDate, timezone }),
  });
  return parseJson(res);
}

export async function fetchRevenueSettings(token: string): Promise<RevenueSettings> {
  const res = await fetch(`${API}/admin/revenue/settings`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson(res);
}

export async function saveRevenueSettings(
  token: string,
  payload: Partial<RevenueSettings>,
): Promise<RevenueSettings> {
  const res = await fetch(`${API}/admin/revenue/settings`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return parseJson(res);
}

export async function fetchAdminWithdrawals(
  token: string,
  status?: string,
): Promise<AdminWithdrawal[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await fetch(`${API}/admin/revenue/withdrawals${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson(res);
}

export async function processAdminWithdrawal(
  token: string,
  withdrawalId: number,
  action: 'paid' | 'rejected',
  adminNote?: string,
): Promise<AdminWithdrawal> {
  const res = await fetch(`${API}/admin/revenue/withdrawals/${withdrawalId}/process`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, admin_note: adminNote || null }),
  });
  return parseJson(res);
}

export async function reportTrackListenProgress(
  token: string,
  trackId: number,
  listenedSeconds: number,
): Promise<{ credited: boolean; credit_paise?: number }> {
  const res = await fetch(`${API}/music/${trackId}/listen-progress`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ listened_seconds: listenedSeconds }),
  });
  return parseJson(res);
}

export async function startRadioListenSession(
  token: string,
  stationId: number,
): Promise<{ session_token: string | null; billable: boolean }> {
  const res = await fetch(`${API}/radio/${stationId}/listen-session/start`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson(res);
}

export async function heartbeatRadioListenSession(
  token: string,
  stationId: number,
  sessionToken: string,
): Promise<{ total_credit_paise: number }> {
  const res = await fetch(`${API}/radio/${stationId}/listen-session/heartbeat`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ session_token: sessionToken }),
  });
  return parseJson(res);
}

export async function endRadioListenSession(
  token: string,
  stationId: number,
  sessionToken: string,
): Promise<void> {
  await fetch(`${API}/radio/${stationId}/listen-session/end`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ session_token: sessionToken }),
  });
}
