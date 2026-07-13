import React, { useEffect, useState } from 'react';
import {
  ChevronLeft, Disc, Play, Sparkles, Users, Info,
} from 'lucide-react';
import { useAudio, Track } from '../context/AudioContext';
import { TrackRow } from '../components/shared/TrackRow';
import { TrackRowSkeleton } from '../components/shared/skeleton';
import { DEFAULT_COVER_FALLBACK } from '../utils/constants';

interface StudioInfo {
  id: number;
  stage_name: string;
  bio?: string | null;
  category?: string | null;
  cover_art_url?: string | null;
  city?: string | null;
  country?: string | null;
  track_count?: number;
}

interface AlbumSummary {
  title: string;
  cover_art_url?: string | null;
  release_year?: number | null;
  track_count: number;
}

interface RelatedArtist {
  name: string;
  track_count: number;
  cover_art_url?: string | null;
}

interface ArtistDetail {
  name: string;
  track_count: number;
  studio?: StudioInfo | null;
  tracks: Track[];
  albums: AlbumSummary[];
  related_artists: RelatedArtist[];
}

interface ArtistProps {
  artistName: string | null;
  onViewDetails: (track: Track) => void;
  onArtistClick: (name: string) => void;
  onBack?: () => void;
}

export const Artist: React.FC<ArtistProps> = ({
  artistName,
  onViewDetails,
  onArtistClick,
  onBack,
}) => {
  const { playTrack, addToQueue } = useAudio();
  const [detail, setDetail] = useState<ArtistDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!artistName?.trim()) {
      setDetail(null);
      return;
    }
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/discovery/artists/${encodeURIComponent(artistName.trim())}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || 'Artist not found');
        }
        setDetail(await res.json());
      } catch (e) {
        setDetail(null);
        setError(e instanceof Error ? e.message : 'Could not load artist');
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, [artistName]);

  const handlePlayAll = () => {
    if (!detail?.tracks.length) return;
    detail.tracks.forEach((track) => addToQueue(track));
    playTrack(detail.tracks[0]);
  };

  if (!artistName?.trim()) {
    return (
      <div className="text-center py-20 text-slate-500 text-sm">
        Select an artist to view their profile.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-72 rounded-3xl bg-slate-900/40 animate-pulse" />
        <TrackRowSkeleton count={5} />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="text-center py-20 space-y-3">
        <p className="text-rose-400 text-sm font-semibold">{error || 'Artist not found'}</p>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="px-4 py-2 bg-slate-900 border border-white/5 rounded-xl text-xs font-bold text-slate-300"
          >
            Go back
          </button>
        )}
      </div>
    );
  }

  const bannerCover = detail.studio?.cover_art_url || detail.tracks[0]?.cover_art_url || DEFAULT_COVER_FALLBACK;
  const avatarCover = detail.studio?.cover_art_url || detail.tracks[0]?.cover_art_url || DEFAULT_COVER_FALLBACK;

  return (
    <div className="space-y-10 w-full overflow-x-hidden">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white transition"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
      )}

      <section
        className="relative min-h-[18rem] rounded-3xl overflow-hidden bg-cover bg-center flex flex-col justify-end p-8 md:p-12 border border-white/5 shadow-2xl"
        style={{
          backgroundImage: `linear-gradient(to top, rgba(2,6,23,0.98) 0%, rgba(2,6,23,0.35) 60%, rgba(2,6,23,0.15) 100%), url(${bannerCover})`,
        }}
      >
        <div className="flex flex-col md:flex-row items-center md:items-end gap-6 relative z-10">
          <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-white/10 shadow-lg flex-shrink-0 bg-slate-800">
            <img src={avatarCover} alt="" className="w-full h-full object-cover" />
          </div>
          <div className="text-center md:text-left space-y-3 flex-1">
            <h1 className="text-3xl md:text-5xl font-extrabold text-gradient-premium tracking-tight">
              {detail.name}
            </h1>
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 text-xs text-slate-400 font-bold">
              <span>{detail.track_count} track{detail.track_count === 1 ? '' : 's'}</span>
              {detail.studio?.category && (
                <>
                  <span>•</span>
                  <span className="text-rose-400">{detail.studio.category}</span>
                </>
              )}
              {detail.studio?.city && (
                <>
                  <span>•</span>
                  <span>{[detail.studio.city, detail.studio.country].filter(Boolean).join(', ')}</span>
                </>
              )}
            </div>
            {detail.tracks.length > 0 && (
              <button
                type="button"
                onClick={handlePlayAll}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl transition"
              >
                <Play className="w-4 h-4 fill-current" /> Play All
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-lg font-extrabold text-white flex items-center gap-1.5">
          <Sparkles className="w-5 h-5 text-rose-400" /> Popular Tracks
        </h3>
        <div className="space-y-2.5 bg-slate-900/10 border border-white/3 p-4 rounded-3xl">
          {detail.tracks.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-4">No tracks found.</p>
          ) : (
            detail.tracks.slice(0, 10).map((track, idx) => (
              <TrackRow key={track.id} track={track} index={idx} onViewDetails={onViewDetails} />
            ))
          )}
        </div>
      </section>

      {detail.albums.length > 0 && (
        <section className="space-y-4">
          <h3 className="text-lg font-extrabold text-white flex items-center gap-1.5">
            <Disc className="w-5 h-5 text-rose-400" /> Albums
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {detail.albums.map((album) => (
              <div key={album.title} className="glass-card p-4 rounded-3xl">
                <div className="w-full aspect-square rounded-2xl overflow-hidden bg-slate-800 border border-white/5 mb-3">
                  <img
                    src={album.cover_art_url || DEFAULT_COVER_FALLBACK}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
                <h4 className="font-bold text-white text-xs truncate">{album.title}</h4>
                <p className="text-[10px] text-slate-500 font-semibold uppercase mt-1">
                  {album.release_year ? `${album.release_year} · ` : ''}
                  {album.track_count} track{album.track_count === 1 ? '' : 's'}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="grid grid-cols-1 md:grid-cols-12 gap-8">
        <div className="md:col-span-8 bg-slate-900/20 border border-white/5 p-6 rounded-3xl space-y-4">
          <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest flex items-center gap-1.5">
            <Info className="w-4 h-4" /> About
          </h3>
          <p className="text-xs text-slate-355 leading-relaxed font-medium">
            {detail.studio?.bio || `Tracks by ${detail.name} on VeriSonic.`}
          </p>
        </div>

        {detail.related_artists.length > 0 && (
          <div className="md:col-span-4 bg-slate-900/10 border border-white/3 p-5 rounded-3xl space-y-4">
            <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest flex items-center gap-1.5">
              <Users className="w-4 h-4" /> Related Artists
            </h3>
            <div className="space-y-3">
              {detail.related_artists.map((rel) => (
                <button
                  key={rel.name}
                  type="button"
                  onClick={() => onArtistClick(rel.name)}
                  className="w-full flex items-center gap-3 p-1 rounded-2xl hover:bg-white/[0.02] transition text-left"
                >
                  <div className="w-10 h-10 rounded-full overflow-hidden border border-white/5 flex-shrink-0 bg-slate-800">
                    <img
                      src={rel.cover_art_url || DEFAULT_COVER_FALLBACK}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-bold text-slate-200 truncate">{rel.name}</h4>
                    <p className="text-[9px] text-slate-500 truncate mt-0.5">
                      {rel.track_count} track{rel.track_count === 1 ? '' : 's'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default Artist;
