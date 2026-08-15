export interface ParsedLyricLine {
  time: number;
  end: number;
  text: string;
  words: string[];
  stanzaBreak?: boolean;
}

export interface TimedLyricCue {
  start?: number;
  end?: number;
  text?: string;
}

const LRC_TIMESTAMP_REGEX = /^\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.*)$/;
const BARE_LRC_TIMESTAMP_REGEX = /^\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]$/;

function isStanzaMarkerText(text: string): boolean {
  const value = text.trim();
  return !value || BARE_LRC_TIMESTAMP_REGEX.test(value);
}

export function parseLrcTimestamp(line: string): { time: number; text: string } | null {
  const match = line.match(LRC_TIMESTAMP_REGEX);
  if (!match) return null;

  const mins = parseInt(match[1], 10);
  const secs = parseInt(match[2], 10);
  const centis = match[3] ? parseInt(match[3], 10) : 0;
  return {
    time: mins * 60 + secs + centis / 100,
    text: match[4].trim(),
  };
}

export function hasLrcTimestamps(lines: string[]): boolean {
  return lines.some((line) => line.trim().length > 0 && LRC_TIMESTAMP_REGEX.test(line));
}

function stanzaBreakLine(): ParsedLyricLine {
  return { time: -1, end: -1, text: '', words: [], stanzaBreak: true };
}

function collapseLyricSourceLines(lyricsText: string): string[] {
  const rawLines = lyricsText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const lines: string[] = [];
  for (const raw of rawLines) {
    const trimmed = raw.trim();
    if (!trimmed || isStanzaMarkerText(trimmed)) {
      if (lines.length && lines[lines.length - 1] !== '') {
        lines.push('');
      }
      continue;
    }
    if (trimmed === 'None' || trimmed === 'null') continue;
    lines.push(trimmed);
  }
  while (lines.length && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

export function parseLyricsFromTimed(timed: TimedLyricCue[]): ParsedLyricLine[] {
  const parsed: ParsedLyricLine[] = [];
  for (const row of timed) {
    const text = String(row.text || '').trim();
    if (isStanzaMarkerText(text)) {
      if (parsed.length && !parsed[parsed.length - 1].stanzaBreak) {
        parsed.push(stanzaBreakLine());
      }
      continue;
    }
    const time = Number(row.start ?? 0);
    const end = Number(row.end ?? time + 3.5);
    parsed.push({
      time,
      end: end > time ? end : time + 3.5,
      text,
      words: text.split(/\s+/).filter((w) => w.length > 0),
    });
  }
  return assignSungEndTimes(parsed);
}

export function parseLyricsFromText(lyricsText: string): ParsedLyricLine[] {
  const rawLines = collapseLyricSourceLines(lyricsText);
  if (rawLines.length === 0) return [];

  if (!hasLrcTimestamps(rawLines)) {
    return rawLines.map((lineText) => (
      lineText
        ? { time: -1, end: -1, text: lineText, words: [] }
        : stanzaBreakLine()
    ));
  }

  return parseLyricsLines(rawLines);
}

export function parseTrackLyrics(track: {
  lyrics?: string | null;
  lyrics_timed?: TimedLyricCue[] | null;
}): ParsedLyricLine[] {
  if (Array.isArray(track.lyrics_timed) && track.lyrics_timed.length > 0) {
    return parseLyricsFromTimed(track.lyrics_timed);
  }
  if (!track.lyrics) return [];
  return parseLyricsFromText(track.lyrics);
}

function parseLyricsLines(lines: string[]): ParsedLyricLine[] {
  const parsed: ParsedLyricLine[] = [];

  lines.forEach((line) => {
    if (!line) {
      if (parsed.length && !parsed[parsed.length - 1].stanzaBreak) {
        parsed.push(stanzaBreakLine());
      }
      return;
    }

    const timestamped = parseLrcTimestamp(line);
    if (timestamped) {
      if (isStanzaMarkerText(timestamped.text)) {
        if (parsed.length && !parsed[parsed.length - 1].stanzaBreak) {
          parsed.push(stanzaBreakLine());
        }
        return;
      }
      parsed.push({
        time: timestamped.time,
        end: timestamped.time + 3.5,
        text: timestamped.text,
        words: timestamped.text.split(/\s+/).filter((w) => w.length > 0),
      });
      return;
    }

    const prevSung = [...parsed].reverse().find((item) => !item.stanzaBreak);
    const prevTime = prevSung && prevSung.time >= 0 ? prevSung.time + 3.5 : 0;
    parsed.push({
      time: prevTime,
      end: prevTime + 3.5,
      text: line,
      words: line.split(/\s+/).filter((w) => w.length > 0),
    });
  });

  return assignSungEndTimes(parsed);
}

function assignSungEndTimes(parsed: ParsedLyricLine[]): ParsedLyricLine[] {
  for (let i = 0; i < parsed.length; i += 1) {
    if (parsed[i].stanzaBreak) continue;
    let nextTime: number | null = null;
    for (let j = i + 1; j < parsed.length; j += 1) {
      if (!parsed[j].stanzaBreak && parsed[j].time >= 0) {
        nextTime = parsed[j].time;
        break;
      }
    }
    if (nextTime !== null) {
      parsed[i].end = nextTime;
    }
  }
  return parsed;
}

export function isSynchronizedLyrics(parsedLines: ParsedLyricLine[]): boolean {
  const sung = parsedLines.filter((line) => !line.stanzaBreak);
  return sung.length > 0 && sung.every((line) => line.time >= 0);
}

export function lineIndexForTime(parsedLines: ParsedLyricLine[], time: number): number {
  let activeIdx = -1;
  for (let i = 0; i < parsedLines.length; i++) {
    const line = parsedLines[i];
    if (line.stanzaBreak || line.time < 0) continue;
    if (time >= line.time && time < line.end) {
      return i;
    }
    if (time >= line.time) {
      activeIdx = i;
    }
  }
  return activeIdx;
}

export function trackHasLyrics(
  lyrics?: string | null,
  timed?: TimedLyricCue[] | null,
): boolean {
  if (Array.isArray(timed) && timed.some((row) => String(row.text || '').trim())) {
    return true;
  }
  if (!lyrics) return false;
  const trimmed = lyrics.trim();
  return trimmed !== '' && trimmed !== 'None' && trimmed !== 'null';
}
