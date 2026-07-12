/** Date/time helpers for custom pickers (YYYY-MM-DD and HH:mm, local time). */

export function formatDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateInputValue(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }
  return date;
}

export function todayDateInputValue(): string {
  return formatDateInputValue(new Date());
}

export function monthStartDateInputValue(): string {
  const d = new Date();
  return formatDateInputValue(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function compareDateInput(a: string, b: string): number {
  return a.localeCompare(b);
}

export function isDateWithinBounds(
  value: string,
  min?: string,
  max?: string,
): boolean {
  if (min && compareDateInput(value, min) < 0) return false;
  if (max && compareDateInput(value, max) > 0) return false;
  return true;
}

export function formatDateDisplay(value: string): string {
  const date = parseDateInputValue(value);
  if (!date) return 'Select date';
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date: Date, count: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + count, 1);
}

export function buildCalendarDays(viewMonth: Date): Array<Date | null> {
  const first = startOfMonth(viewMonth);
  const startOffset = (first.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const cells: Array<Date | null> = [];
  for (let i = 0; i < startOffset; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function parseTimeValue(value: string): { hours: number; minutes: number } | null {
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

export function formatTimeValue(hours: number, minutes: number): string {
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function formatTimeDisplay(value: string): string {
  const parsed = parseTimeValue(value);
  if (!parsed) return 'Select time';
  const date = new Date();
  date.setHours(parsed.hours, parsed.minutes, 0, 0);
  return date.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function compareTimeValue(a: string, b: string): number {
  return a.localeCompare(b);
}

export function isTimeWithinBounds(
  value: string,
  min?: string,
  max?: string,
): boolean {
  if (min && compareTimeValue(value, min) < 0) return false;
  if (max && compareTimeValue(value, max) > 0) return false;
  return true;
}

export function buildMinuteOptions(step = 1): number[] {
  const safeStep = Math.max(1, Math.min(30, step));
  const options: number[] = [];
  for (let m = 0; m < 60; m += safeStep) options.push(m);
  return options;
}

export function normalizeDateInput(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const iso = parseDateInputValue(trimmed);
  if (iso) return formatDateInputValue(iso);

  const dmy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    ) {
      return formatDateInputValue(date);
    }
  }

  return null;
}

export function normalizeTimeInput(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const colonMatch = trimmed.match(/^(\d{1,2}):(\d{1,2})$/);
  if (colonMatch) {
    const hours = Number(colonMatch[1]);
    const minutes = Number(colonMatch[2]);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return formatTimeValue(hours, minutes);
    }
  }

  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.length === 1) {
    const hours = Number(digits);
    if (hours >= 0 && hours <= 9) return formatTimeValue(hours, 0);
  }

  if (digits.length === 2) {
    const hours = Number(digits);
    if (hours >= 0 && hours <= 23) return formatTimeValue(hours, 0);
  }

  if (digits.length === 3) {
    const hours = Number(digits[0]);
    const minutes = Number(digits.slice(1));
    if (hours >= 0 && hours <= 9 && minutes >= 0 && minutes <= 59) {
      return formatTimeValue(hours, minutes);
    }
  }

  if (digits.length >= 4) {
    const hours = Number(digits.slice(0, 2));
    const minutes = Number(digits.slice(2, 4));
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return formatTimeValue(hours, minutes);
    }
  }

  return null;
}

export function buildHourOptions(): number[] {
  return Array.from({ length: 24 }, (_, i) => i);
}
