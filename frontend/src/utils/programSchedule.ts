export interface ProgramTimeSlot {
  title?: string;
  timeFrom: string;
  timeTo: string;
}

/** Half-open minute range [start, end) — end minute is exclusive. */
type MinuteRange = [number, number];

function parseTimeMinutes(value: string): number | null {
  if (!value || !value.includes(':')) return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Build half-open ranges for one program.
 * Example: 1:00–2:00 => [60, 120), so 2:00–3:00 can start at minute 120.
 */
function buildHalfOpenRanges(fromMin: number, toMin: number): MinuteRange[] {
  if (fromMin === toMin) {
    return [];
  }
  if (fromMin < toMin) {
    return [[fromMin, toMin]];
  }
  return [
    [fromMin, 1440],
    [0, toMin],
  ];
}

/**
 * Ranges overlap only when they share a minute.
 * Back-to-back is allowed: [60, 120) and [120, 180) do not overlap.
 */
function rangesOverlap(a: MinuteRange[], b: MinuteRange[]): boolean {
  for (const [aStart, aEnd] of a) {
    for (const [bStart, bEnd] of b) {
      if (aStart < bEnd && bStart < aEnd) {
        return true;
      }
    }
  }
  return false;
}

function formatTimeLabel(value: string): string {
  const minutes = parseTimeMinutes(value);
  if (minutes === null) return value;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function formatProgramLabel(program: ProgramTimeSlot, index: number): string {
  const title = program.title?.trim();
  if (title) return `"${title}"`;
  return `Program ${index + 1}`;
}

export function getProgramScheduleOverlapError(programs: ProgramTimeSlot[]): string | null {
  const slots: { index: number; program: ProgramTimeSlot; ranges: MinuteRange[] }[] = [];

  for (let index = 0; index < programs.length; index += 1) {
    const program = programs[index];
    const fromMin = parseTimeMinutes(program.timeFrom);
    const toMin = parseTimeMinutes(program.timeTo);
    if (fromMin === null || toMin === null || fromMin === toMin) continue;

    const ranges = buildHalfOpenRanges(fromMin, toMin);
    if (ranges.length === 0) continue;

    slots.push({
      index,
      program,
      ranges,
    });
  }

  for (let i = 0; i < slots.length; i += 1) {
    for (let j = i + 1; j < slots.length; j += 1) {
      if (!rangesOverlap(slots[i].ranges, slots[j].ranges)) continue;

      const first = slots[i];
      const second = slots[j];
      const firstLabel = formatProgramLabel(first.program, first.index);
      const secondLabel = formatProgramLabel(second.program, second.index);
      const firstTime = `${formatTimeLabel(first.program.timeFrom)}–${formatTimeLabel(first.program.timeTo)}`;
      const secondTime = `${formatTimeLabel(second.program.timeFrom)}–${formatTimeLabel(second.program.timeTo)}`;

      return `Program schedules cannot overlap. ${firstLabel} (${firstTime}) overlaps with ${secondLabel} (${secondTime}). Back-to-back slots are allowed when one ends at the same time the next starts (for example 1:00–2:00 then 2:00–3:00).`;
    }
  }

  return null;
}

export function programsHaveOverlappingTimes(programs: ProgramTimeSlot[]): boolean {
  return getProgramScheduleOverlapError(programs) !== null;
}
