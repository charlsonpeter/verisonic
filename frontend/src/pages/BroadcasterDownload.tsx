import React from 'react';
import { Laptop, Download, Info, HelpCircle } from 'lucide-react';
import {
  BROADCASTER_INSTALLERS,
  detectBroadcasterPlatform,
  getBroadcasterInstallerUrl,
  platformLabel,
  type BroadcasterPlatform,
} from '../config/broadcasterDownloads';

const ALL_PLATFORMS: BroadcasterPlatform[] = ['windows', 'macos', 'linux'];

export const BroadcasterDownload: React.FC = () => {
  const detectedPlatform = detectBroadcasterPlatform();
  const detectedOS = platformLabel(detectedPlatform);
  const alternatives = ALL_PLATFORMS.filter((p) => p !== detectedPlatform);

  return (
    <div className="space-y-10 w-full animate-page-entry font-sans max-w-5xl">
      <div className="hidden md:block">
        <h2 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
          <Laptop className="w-8 h-8 text-rose-455 animate-pulse" /> Desktop Broadcaster App
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-7 bg-slate-900/40 border border-white/3 p-8 rounded-3xl space-y-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-rose-600/5 rounded-full blur-3xl pointer-events-none" />

          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-0.5 bg-rose-500/10 border border-rose-500/20 rounded-full text-[10px] text-rose-400 font-extrabold uppercase tracking-wide">
              Primary Ingestion Software
            </span>
            <h3 className="text-xl font-extrabold text-white tracking-tight">VeriSonic Broadcast Link</h3>
            <p className="text-xs text-slate-450 leading-relaxed font-semibold">
              Download the installer for your platform. It installs the broadcaster as a background tray service,
              registers auto-start at login, and guides you through audio input permissions (microphone, line-in,
              USB interfaces, and loopback/system audio sources).
            </p>
          </div>

          <div className="bg-slate-950/45 p-5 border border-white/3 rounded-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between text-xs border-b border-white/5 pb-3">
              <span className="text-slate-500 font-bold uppercase tracking-wider">Detected Operating System:</span>
              <span className="font-black text-rose-455 uppercase tracking-wide">{detectedOS}</span>
            </div>

            <a
              href={getBroadcasterInstallerUrl(detectedPlatform)}
              download
              className="flex items-center justify-center gap-2 py-3 px-5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-black rounded-xl shadow-lg transition duration-300 uppercase tracking-widest cursor-pointer"
            >
              <Download className="w-4.5 h-4.5" /> Download Installer for {detectedOS}
            </a>

            <div className="border-t border-white/5 pt-4 mt-2 space-y-2.5">
              <span className="text-[10px] text-slate-550 font-bold uppercase tracking-wider block">
                Other supported platforms:
              </span>
              <div className="grid grid-cols-2 gap-3 text-[10px] font-bold text-center uppercase tracking-wider">
                {alternatives.map((platform) => (
                  <a
                    key={platform}
                    href={getBroadcasterInstallerUrl(platform)}
                    download
                    className="py-2 bg-slate-900/60 hover:bg-slate-800 text-slate-350 hover:text-white border border-white/3 rounded-xl transition cursor-pointer"
                  >
                    {platformLabel(platform)}
                  </a>
                ))}
              </div>
            </div>
          </div>

          <div className="text-[10px] text-slate-500 leading-relaxed space-y-1">
            <p>
              <strong className="text-slate-400">Windows:</strong> {BROADCASTER_INSTALLERS.windows.split('/').pop()}
            </p>
            <p>
              <strong className="text-slate-400">macOS:</strong> {BROADCASTER_INSTALLERS.macos.split('/').pop()}
            </p>
            <p>
              <strong className="text-slate-400">Linux:</strong> {BROADCASTER_INSTALLERS.linux.split('/').pop()}
            </p>
          </div>
        </div>

        <div className="lg:col-span-5 bg-slate-900/40 border border-white/3 p-8 rounded-3xl space-y-6 shadow-xl relative overflow-hidden">
          <h3 className="text-xs font-black text-rose-400 uppercase tracking-widest flex items-center gap-1.5 font-sans pt-1">
            <HelpCircle className="w-4.5 h-4.5" /> 4-Step Quick Connection Guide
          </h3>

          <div className="space-y-5 text-xs text-slate-400">
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-rose-600/10 border border-rose-500/20 text-rose-455 font-black flex items-center justify-center flex-shrink-0">
                1
              </div>
              <p className="leading-relaxed">
                <strong className="text-slate-200">Download &amp; install</strong> the platform installer from this page.
                Allow administrator access, then grant audio input/recording permissions for your chosen capture device
                (microphone, line-in, USB audio, or loopback).
              </p>
            </div>

            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-rose-600/10 border border-rose-500/20 text-rose-455 font-black flex items-center justify-center flex-shrink-0">
                2
              </div>
              <p className="leading-relaxed">
                Open your <strong className="text-slate-200">Station Profile</strong> manager page in the dropdown menu on the top-right header.
              </p>
            </div>

            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-rose-600/10 border border-rose-500/20 text-rose-455 font-black flex items-center justify-center flex-shrink-0">
                3
              </div>
              <p className="leading-relaxed">
                Click the <strong className="text-slate-200">Connection Settings</strong> button on your station card and copy the unique Stream Key.
              </p>
            </div>

            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-rose-600/10 border border-rose-500/20 text-rose-455 font-black flex items-center justify-center flex-shrink-0">
                4
              </div>
              <p className="leading-relaxed">
                Paste the copied Stream Key inside the desktop broadcaster client, select your audio source, and hit{' '}
                <strong className="text-slate-200">Connect Live</strong>.
              </p>
            </div>
          </div>

          <div className="border-t border-white/5 pt-4 text-[10px] text-slate-500 flex items-start gap-2 leading-relaxed">
            <Info className="w-4 h-4 text-rose-400/50 flex-shrink-0 mt-0.5" />
            <span>
              Installers register background auto-start and open OS privacy settings where needed. For loopback/system
              audio (BlackHole, Stereo Mix), see <code className="text-slate-400">broadcaster/distributing_broadcaster.md</code>.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BroadcasterDownload;
