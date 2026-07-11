import React from 'react';

export interface ScoreBreakdownItem {
  check: string;
  description: string;
  value: string;
  threshold: string;
  passed: boolean;
  deduction: number;
  max_points?: number;
  points_achieved?: number;
  calculation?: string;
}

const SPLIT_WEIGHTS: Record<string, number> = {
  'Sample Rate': 25,
  'Bit Depth': 20,
  'Spectral Cutoff Frequency': 35,
  'Upscale / Transcode Detection': 20,
};

interface AcousticScoreBreakdownProps {
  finalScore?: number;
  breakdown?: ScoreBreakdownItem[];
}

export const AcousticScoreBreakdown: React.FC<AcousticScoreBreakdownProps> = ({
  finalScore = 0,
  breakdown = [],
}) => {
  const totalFromRows = breakdown.reduce((sum, item) => sum + (item.points_achieved ?? 0), 0);
  const displayTotal = breakdown.length > 0 ? totalFromRows : finalScore;

  return (
    <div className="flex-1 min-w-0 w-full font-sans">
      <table className="w-full text-left border-collapse text-xs">
        <thead>
          <tr className="border-b border-white/5 text-[9px] font-black uppercase tracking-wider text-slate-500">
            <th className="pb-2 pr-3 font-black">Point</th>
            <th className="pb-2 text-right font-black w-12">Score</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {breakdown.map((item) => {
            const weight = item.max_points ?? SPLIT_WEIGHTS[item.check] ?? 0;
            const achieved = item.points_achieved ?? 0;
            return (
              <tr key={item.check}>
                <td className="py-2.5 pr-3 font-semibold text-slate-300 align-top">{item.check}</td>
                <td className="py-2.5 text-right font-bold align-top whitespace-nowrap">
                  <span className={achieved === weight ? 'text-emerald-400' : achieved > 0 ? 'text-cyan-400' : 'text-rose-400'}>
                    {achieved}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-white/10">
            <td className="pt-3 text-[10px] font-black uppercase tracking-wider text-slate-400">
              Total score
            </td>
            <td className="pt-3 text-right text-base font-black text-white">{displayTotal}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};
