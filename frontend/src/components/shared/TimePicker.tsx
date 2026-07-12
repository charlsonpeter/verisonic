import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock } from 'lucide-react';
import {
  buildHourOptions,
  buildMinuteOptions,
  formatTimeValue,
  isTimeWithinBounds,
  normalizeTimeInput,
  parseTimeValue,
} from '../../utils/dateTime';

const SIZE_CLASS = {
  sm: 'px-2.5 py-1.5 text-[11px]',
  md: 'px-3 py-2 text-sm',
  xs: 'px-2 py-2 text-xs',
} as const;

const POPOVER_WIDTH = 240;
const POPOVER_HEIGHT = 280;

interface TimeColumnProps {
  label: string;
  options: number[];
  value: number;
  onSelect: (value: number) => void;
  isDisabled?: (value: number) => boolean;
  alignOnMount?: boolean;
}

const TimeColumn: React.FC<TimeColumnProps> = ({
  label,
  options,
  value,
  onSelect,
  isDisabled,
  alignOnMount = false,
}) => {
  const listRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (!alignOnMount) return;
    let cancelled = false;

    const align = () => {
      const list = listRef.current;
      const item = selectedRef.current;
      if (!list || !item) return;
      list.scrollTop = item.offsetTop - list.clientHeight / 2 + item.clientHeight / 2;
    };

    align();
    const raf1 = requestAnimationFrame(() => {
      if (cancelled) return;
      align();
      requestAnimationFrame(() => {
        if (cancelled) return;
        align();
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
    };
  }, [alignOnMount, value]);

  return (
    <div className="min-w-0 flex-1">
      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <div
        ref={listRef}
        className="mt-1 h-44 overflow-y-auto overscroll-contain rounded-lg border border-white/10 bg-slate-950/80 p-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15"
      >
        {options.map((option) => {
          const disabled = isDisabled?.(option) ?? false;
          const selected = option === value;
          return (
            <button
              key={option}
              ref={selected ? selectedRef : undefined}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(option)}
              className={`w-full py-1.5 rounded-md text-xs font-medium transition ${
                selected
                  ? 'bg-emerald-600 text-white'
                  : disabled
                    ? 'text-slate-600 cursor-not-allowed'
                    : 'text-slate-300 hover:bg-white/5'
              }`}
            >
              {String(option).padStart(2, '0')}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export interface TimePickerProps {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  size?: keyof typeof SIZE_CLASS;
  minuteStep?: number;
  placeholder?: string;
}

export const TimePicker: React.FC<TimePickerProps> = ({
  value,
  onChange,
  min,
  max,
  disabled = false,
  className = '',
  buttonClassName = '',
  size = 'md',
  minuteStep = 1,
  placeholder = 'HH:mm',
}) => {
  const listboxId = useId();
  const anchorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value);
  const [invalid, setInvalid] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});
  const parsed = parseTimeValue(value) ?? { hours: 9, minutes: 0 };
  const [hours, setHours] = useState(parsed.hours);
  const [minutes, setMinutes] = useState(parsed.minutes);

  useEffect(() => {
    setText(value);
    setInvalid(false);
  }, [value]);

  useEffect(() => {
    const next = parseTimeValue(value);
    if (next) {
      setHours(next.hours);
      setMinutes(next.minutes);
    }
  }, [value]);

  const updatePopoverPosition = () => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < POPOVER_HEIGHT && rect.top > POPOVER_HEIGHT;
    const top = openUp ? rect.top - POPOVER_HEIGHT - 6 : rect.bottom + 6;
    let left = rect.left;
    const width = Math.max(POPOVER_WIDTH, rect.width);
    if (left + width > window.innerWidth - 8) {
      left = window.innerWidth - width - 8;
    }
    left = Math.max(8, left);
    setPopoverStyle({
      position: 'fixed',
      top,
      left,
      width,
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
  }, [open]);

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
    const normalized = normalizeTimeInput(text);
    if (!normalized || !isTimeWithinBounds(normalized, min, max)) {
      setText(value);
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setText(normalized);
    if (normalized !== value) onChange(normalized);
    const next = parseTimeValue(normalized);
    if (next) {
      setHours(next.hours);
      setMinutes(next.minutes);
    }
  };

  const commit = (nextHours: number, nextMinutes: number) => {
    const next = formatTimeValue(nextHours, nextMinutes);
    if (min && next < min) return;
    if (max && next > max) return;
    setText(next);
    setInvalid(false);
    onChange(next);
  };

  const hourOptions = buildHourOptions();
  const minuteOptions = buildMinuteOptions(minuteStep);

  const isHourDisabled = (hour: number) => {
    const earliest = formatTimeValue(hour, 0);
    const latest = formatTimeValue(hour, 59);
    if (min && latest < min) return true;
    if (max && earliest > max) return true;
    return false;
  };

  const isMinuteDisabled = (minute: number) => {
    const next = formatTimeValue(hours, minute);
    if (min && next < min) return true;
    if (max && next > max) return true;
    return false;
  };

  const fieldClass = `w-full inline-flex items-center gap-2 bg-slate-950/70 border rounded-lg text-white transition ${SIZE_CLASS[size]} ${
    invalid ? 'border-red-500/50' : 'border-white/10 focus-within:border-emerald-500/40'
  } ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${buttonClassName}`;

  const popover = open
    ? createPortal(
        <div
          ref={popoverRef}
          id={listboxId}
          role="dialog"
          aria-label="Choose time"
          style={popoverStyle}
          className="rounded-xl border border-white/10 bg-[#0a0d1a] shadow-2xl p-3"
        >
          <div className="flex gap-2">
            <TimeColumn
              label="Hour"
              options={hourOptions}
              value={hours}
              alignOnMount={open}
              isDisabled={isHourDisabled}
              onSelect={(nextHour) => {
                setHours(nextHour);
                commit(nextHour, minutes);
              }}
            />
            <TimeColumn
              label="Minute"
              options={minuteOptions}
              value={minutes}
              alignOnMount={open}
              isDisabled={isMinuteDisabled}
              onSelect={(nextMinute) => {
                setMinutes(nextMinute);
                commit(hours, nextMinute);
              }}
            />
          </div>

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-3 w-full py-2 rounded-lg bg-emerald-600/20 border border-emerald-500/30 text-emerald-200 text-[11px] font-bold hover:bg-emerald-600/30 transition"
          >
            Done
          </button>
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
          aria-label="Open time picker"
          onClick={() => {
            if (disabled) return;
            if (open) {
              setOpen(false);
              return;
            }
            updatePopoverPosition();
            setOpen(true);
          }}
          className="p-0.5 rounded-md text-slate-400 hover:text-white transition flex-shrink-0"
        >
          <Clock className="w-3.5 h-3.5" />
        </button>
      </div>
      {popover}
    </div>
  );
};
