import React, { useEffect, useState } from 'react';
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { BannerPayload, dismissBanner, subscribeBanner } from '../../utils/banner';

const bannerStyles: Record<BannerPayload['type'], string> = {
  success: 'bg-emerald-950/95 border-emerald-500/35 text-emerald-50',
  error: 'bg-rose-950/95 border-rose-500/35 text-rose-50',
  info: 'bg-slate-900/95 border-white/10 text-slate-100',
};

const iconStyles: Record<BannerPayload['type'], string> = {
  success: 'text-emerald-400',
  error: 'text-rose-400',
  info: 'text-slate-300',
};

const BannerIcon: React.FC<{ type: BannerPayload['type'] }> = ({ type }) => {
  const className = `w-5 h-5 flex-shrink-0 ${iconStyles[type]}`;
  if (type === 'success') return <CheckCircle2 className={className} />;
  if (type === 'error') return <AlertCircle className={className} />;
  return <Info className={className} />;
};

export const BannerHost: React.FC = () => {
  const [banner, setBanner] = useState<BannerPayload | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => subscribeBanner(setBanner), []);

  useEffect(() => {
    if (banner) {
      requestAnimationFrame(() => setVisible(true));
      return;
    }
    setVisible(false);
  }, [banner]);

  if (!banner) return null;

  return (
    <div
      className="fixed z-[1002] inset-x-3 top-[calc(env(safe-area-inset-top,0px)+0.5rem)] md:inset-x-auto md:right-6 md:left-auto md:top-[4.75rem] md:w-[min(100%,22rem)] pointer-events-none"
      role="status"
      aria-live="polite"
    >
      <div
        className={`pointer-events-auto flex items-start gap-3 px-3.5 py-3 rounded-2xl border shadow-2xl backdrop-blur-xl transition-all duration-300 ${
          bannerStyles[banner.type]
        } ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}`}
      >
        <BannerIcon type={banner.type} />
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-[13px] font-bold leading-snug">{banner.title}</p>
          {banner.text && (
            <p className="text-[11px] opacity-80 mt-0.5 leading-relaxed">{banner.text}</p>
          )}
        </div>
        <button
          type="button"
          onClick={dismissBanner}
          className="p-1 -mr-1 -mt-0.5 rounded-lg opacity-70 hover:opacity-100 transition flex-shrink-0"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
