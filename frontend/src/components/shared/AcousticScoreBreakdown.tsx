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
}

const FALLBACK_MAX: Record<string, number> = {
  'Sample Rate': 40,
  'Bit Depth': 30,
  'Spectral Cutoff Frequency': 40,
  'Upscale / Transcode Detection': 50,
};

interface AcousticScoreBreakdownProps {
  finalScore?: number;
  breakdown?: ScoreBreakdownItem[];
}

export const AcousticScoreBreakdown: React.FC<AcousticScoreBreakdownProps> = ({
  finalScore = 0,
  breakdown = [],
}) => {
  return (
    <div className="flex-1 min-w-0 w-full font-sans">
      <table className="w-full text-left border-collapse text-xs">
        <thead>
          <tr className="border-b border-white/5 text-[9px] font-black uppercase tracking-wider text-slate-500">
            <th className="pb-2 pr-3 font-black">Point</th>
            <th className="pb-2 pr-3 font-black">Result</th>
            <th className="pb-2 text-right font-black w-20">Score achieved</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {breakdown.map((item) => {
            const maxPts = item.max_points ?? FALLBACK_MAX[item.check] ?? 0;
            const achieved = item.points_achieved ?? maxPts - item.deduction;
            return (
              <tr key={item.check}>
                <td className="py-2.5 pr-3 font-semibold text-slate-300 align-top">{item.check}</td>
                <td className="py-2.5 pr-3 align-top">
                  <span
                    className={`inline-block text-[9px] font-black uppercase px-1.5 py-0.5 rounded mr-1.5 ${
                      item.passed
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    }`}
                  >
                    {item.passed ? 'Pass' : 'Fail'}
                  </span>
                  <span className="text-[10px] text-slate-400">{item.value}</span>
                </td>
                <td className="py-2.5 text-right font-bold align-top whitespace-nowrap">
                  <span className={achieved === maxPts ? 'text-emerald-400' : achieved > 0 ? 'text-cyan-400' : 'text-rose-400'}>
                    {achieved}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-white/10">
            <td colSpan={2} className="pt-3 text-[10px] font-black uppercase tracking-wider text-slate-400">
              Total score
            </td>
            <td className="pt-3 text-right text-base font-black text-white">{finalScore}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};
