export interface ParsedRadioProgram {
  id: string;
  title: string;
  rj?: string;
  timeFrom?: string;
  timeTo?: string;
}

export function parseRadioPrograms(programsList?: string | null): ParsedRadioProgram[] {
  if (!programsList) return [];
  try {
    const parsed = JSON.parse(programsList);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === 'object' && String(item.title || '').trim())
      .map((item, index) => ({
        id: String(item.id || `idx:${index}`),
        title: String(item.title || 'Untitled Program'),
        rj: item.rj ? String(item.rj) : undefined,
        timeFrom: item.timeFrom ? String(item.timeFrom) : undefined,
        timeTo: item.timeTo ? String(item.timeTo) : undefined,
      }));
  } catch {
    return [];
  }
}

export function stationHasPrograms(programsList?: string | null): boolean {
  return parseRadioPrograms(programsList).length > 0;
}

function currentMinutesLocal(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function utcTimeToLocalMinutes(utcTimeStr: string): number | null {
  if (!utcTimeStr) return null;
  try {
    const [utcHours, utcMinutes] = utcTimeStr.split(':').map(Number);
    const date = new Date();
    date.setUTCHours(utcHours, utcMinutes, 0, 0);
    return date.getHours() * 60 + date.getMinutes();
  } catch {
    return null;
  }
}

export function getActiveRadioProgram(station: {
  programs_list?: string | null;
  current_program_title?: string | null;
  rj_name?: string | null;
}): ParsedRadioProgram | null {
  const programs = parseRadioPrograms(station.programs_list);
  if (programs.length === 0) return null;

  const currentMinutes = currentMinutesLocal();
  for (const program of programs) {
    if (!program.timeFrom || !program.timeTo) continue;
    const fromMinutes = utcTimeToLocalMinutes(program.timeFrom);
    const toMinutes = utcTimeToLocalMinutes(program.timeTo);
    if (fromMinutes === null || toMinutes === null) continue;
    if (toMinutes > fromMinutes) {
      if (currentMinutes >= fromMinutes && currentMinutes <= toMinutes) return program;
    } else if (currentMinutes >= fromMinutes || currentMinutes <= toMinutes) {
      return program;
    }
  }

  return programs[0];
}

export function formatProgramSchedule(program: ParsedRadioProgram): string {
  const formatTime = (value?: string) => {
    if (!value) return '--:--';
    try {
      const [utcHours, utcMinutes] = value.split(':').map(Number);
      const date = new Date();
      date.setUTCHours(utcHours, utcMinutes, 0, 0);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return value;
    }
  };
  return `${formatTime(program.timeFrom)} - ${formatTime(program.timeTo)}`;
}

export function radioProgramReactionKey(stationId: number, programKey: string): string {
  return `${stationId}:${programKey}`;
}
