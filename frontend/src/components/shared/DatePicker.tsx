import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  buildCalendarDays,
  compareDateInput,
  formatDateInputValue,
  isDateWithinBounds,
  normalizeDateInput,
  parseDateInputValue,
  startOfMonth,
  addMonths,
} from '../../utils/dateTime';

const SIZE_CLASS = {
  sm: 'px-2.5 py-1.5 text-[11px]',
  md: 'px-3 py-2 text-sm',
  xs: 'px-2 py-2 text-xs',
} as const;

const POPOVER_WIDTH = 280;
const POPOVER_HEIGHT = 320;

export interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  size?: keyof typeof SIZE_CLASS;
  placeholder?: string;
}

export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  min,
  max,
  disabled = false,
  className = '',
  buttonClassName = '',
  size = 'md',
  placeholder = 'YYYY-MM-DD',
}) => {
  const listboxId = useId();
  const anchorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value);
  const [invalid, setInvalid] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});
  const selected = parseDateInputValue(value);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(selected ?? new Date()));

  useEffect(() => {
    setText(value);
    setInvalid(false);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const selectedDate = parseDateInputValue(value);
    if (selectedDate) setViewMonth(startOfMonth(selectedDate));
  }, [open, value]);

  const updatePopoverPosition = () => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < POPOVER_HEIGHT && rect.top > POPOVER_HEIGHT;
    const top = openUp ? rect.top - POPOVER_HEIGHT - 6 : rect.bottom + 6;
    let left = rect.left;
    if (left + POPOVER_WIDTH > window.innerWidth - 8) {
      left = window.innerWidth - POPOVER_WIDTH - 8;
    }
    left = Math.max(8, left);
    setPopoverStyle({
      position: 'fixed',
      top,
      left,
      width: POPOVER_WIDTH,
      zIndex: 200,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePopoverPosition();
    window.addEventListener('resize', updatePopoverPosition);
    window.addEventListener('scroll', updatePopoverPosition, true);
    return () => {
      window.removeEventListener('resize', updatePopoverPosition);
      window.removeEventListener('scroll', updatePopoverPosition, true);
    };
  }, [open, viewMonth]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const applyText = () => {
    if (!text.trim()) {
      setText(value);
      setInvalid(false);
      return;
    }
    const normalized = normalizeDateInput(text);
    if (!normalized || !isDateWithinBounds(normalized, min, max)) {
      setText(value);
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setText(normalized);
    if (normalized !== value) onChange(normalized);
  };

  const isDisabledDay = (date: Date): boolean => {
    const key = formatDateInputValue(date);
    if (min && compareDateInput(key, min) < 0) return true;
    if (max && compareDateInput(key, max) > 0) return true;
    return false;
  };

  const selectDay = (date: Date) => {
    const next = formatDateInputValue(date);
    if (isDisabledDay(date)) return;
    setText(next);
    setInvalid(false);
    onChange(next);
    setOpen(false);
  };

  const monthLabel = viewMonth.toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });

  const canGoPrev =
    !min ||
    compareDateInput(
      formatDateInputValue(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 0)),
      min,
    ) >= 0;
  const canGoNext =
    !max ||
    compareDateInput(formatDateInputValue(addMonths(viewMonth, 1)), max) <= 0;

  const fieldClass = `w-full inline-flex items-center gap-2 bg-slate-950/70 border rounded-lg text-white transition ${SIZE_CLASS[size]} ${
    invalid ? 'border-red-500/50' : 'border-white/10 focus-within:border-emerald-500/40'
  } ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${buttonClassName}`;

  const popover = open
    ? createPortal(
        <div
          ref={popoverRef}
          id={listboxId}
          role="dialog"
          aria-label="Choose date"
          style={popoverStyle}
          className="rounded-xl border border-white/10 bg-[#0a0d1a] shadow-2xl p-3"
        >
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              disabled={!canGoPrev}
              onClick={() => setViewMonth((m) => addMonths(m, -1))}
              className="p-1.5 rounded-lg border border-white/10 text-slate-400 hover:text-white disabled:opacity-30"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-bold text-white">{monthLabel}</span>
            <button
              type="button"
              disabled={!canGoNext}
              onClick={() => setViewMonth((m) => addMonths(m, 1))}
              className="p-1.5 rounded-lg border border-white/10 text-slate-400 hover:text-white disabled:opacity-30"
              aria-label="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((label) => (
              <span
                key={label}
                className="text-[9px] font-bold uppercase text-slate-500 text-center py-1"
              >
                {label}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {buildCalendarDays(viewMonth).map((day, index) => {
              if (!day) {
                return <span key={`empty-${index}`} />;
              }
              const key = formatDateInputValue(day);
              const selectedDay = value === key;
              const disabledDay = isDisabledDay(day);
              const isToday = key === formatDateInputValue(new Date());
              return (
                <button
                  key={key}
                  type="button"
                  disabled={disabledDay}
                  onClick={() => selectDay(day)}
                  className={`h-8 rounded-lg text-[11px] font-medium transition ${
                    selectedDay
                      ? 'bg-emerald-600 text-white'
                      : disabledDay
                        ? 'text-slate-600 cursor-not-allowed'
                        : isToday
                          ? 'border border-emerald-500/40 text-emerald-200 hover:bg-white/5'
                          : 'text-slate-300 hover:bg-white/5'
                  }`}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className={className}>
      <div ref={anchorRef} className={fieldClass}>
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          disabled={disabled}
          value={text}
          placeholder={placeholder}
          aria-invalid={invalid}
          onChange={(e) => {
            setText(e.target.value);
            setInvalid(false);
          }}
          onBlur={applyText}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              applyText();
              inputRef.current?.blur();
            }
            if (e.key === 'Escape') {
              setText(value);
              setInvalid(false);
              inputRef.current?.blur();
            }
          }}
          className="flex-1 min-w-0 bg-transparent outline-none text-inherit placeholder:text-slate-500"
        />
        <button
          type="button"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-label="Open calendar"
          onClick={() => !disabled && setOpen((prev) => !prev)}
          className="p-0.5 rounded-md text-slate-400 hover:text-white transition flex-shrink-0"
        >
          <Calendar className="w-3.5 h-3.5" />
        </button>
      </div>
      {popover}
    </div>
  );
};
