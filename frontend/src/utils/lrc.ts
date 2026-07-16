export interface ParsedLyricLine {
  time: number;
  end: number;
  text: string;
  words: string[];
}

const LRC_TIMESTAMP_REGEX = /^\[(\d{1,2}):(\d{2})(?:\.(\d{2}))?\]\s*(.*)$/;

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
  return lines.some(line => LRC_TIMESTAMP_REGEX.test(line));
}

export function parseLyricsFromText(lyricsText: string): ParsedLyricLine[] {
  const rawLines = lyricsText
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && l !== 'None' && l !== 'null');

  if (rawLines.length === 0) return [];

  if (!hasLrcTimestamps(rawLines)) {
    return rawLines.map(lineText => ({
      time: -1,
      end: -1,
      text: lineText,
      words: [],
    }));
  }

  return parseLyricsLines(rawLines);
}

function parseLyricsLines(lines: string[]): ParsedLyricLine[] {
  const parsed: ParsedLyricLine[] = [];

  lines.forEach((line) => {
    const timestamped = parseLrcTimestamp(line);
    if (timestamped) {
      parsed.push({
        time: timestamped.time,
        end: timestamped.time + 3.5,
        text: timestamped.text,
        words: timestamped.text.split(/\s+/).filter(w => w.length > 0),
      });
      return;
    }

    const prevTime = parsed.length > 0 ? parsed[parsed.length - 1].time + 3.5 : 0;
    parsed.push({
      time: prevTime,
      end: prevTime + 3.5,
      text: line,
      words: line.split(/\s+/).filter(w => w.length > 0),
    });
  });

  for (let i = 0; i < parsed.length; i += 1) {
    if (i + 1 < parsed.length) {
      parsed[i].end = parsed[i + 1].time;
    }
  }

  return parsed;
}

export function isSynchronizedLyrics(parsedLines: ParsedLyricLine[]): boolean {
  return parsedLines.length > 0 && parsedLines.every(l => l.time >= 0);
}

export function lineIndexForTime(parsedLines: ParsedLyricLine[], time: number): number {
  let activeIdx = -1;
  for (let i = 0; i < parsedLines.length; i++) {
    const line = parsedLines[i];
    if (time >= line.time && time < line.end) {
      return i;
    }
    if (time >= line.time) {
      activeIdx = i;
    }
  }
  return activeIdx;
}
