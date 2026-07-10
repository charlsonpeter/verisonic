import React from 'react';
import { Heart } from 'lucide-react';
import { useAudio, Track } from '../context/AudioContext';
import { TrackRow } from '../components/shared/TrackRow';

interface FavoritesProps {
  onViewReport?: (track: Track) => void;
  onViewDetails: (track: Track) => void;
}

export const Favorites: React.FC<FavoritesProps> = ({ onViewReport, onViewDetails }) => {
  const { favorites } = useAudio();
  const [favoriteTracks, setFavoriteTracks] = React.useState<Track[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const loadFavoriteTracks = async () => {
      setIsLoading(true);
      try {
        const res = await fetch('/api/music?approved_only=true');
        if (res.ok) {
          const data = await res.json();
          setFavoriteTracks(data.filter((t: Track) => favorites.includes(t.id)));
        } else {
          setFavoriteTracks([]);
        }
      } catch (e) {
        console.error('Failed to load favorite tracks:', e);
        setFavoriteTracks([]);
      } finally {
        setIsLoading(false);
      }
    };
    loadFavoriteTracks();
  }, [favorites]);

  return (
    <div className="space-y-6 w-full">
      <div>
        <h2 className="text-2xl font-extrabold text-white flex items-center gap-2">
          <Heart className="w-6 h-6 text-rose-500 fill-rose-500" /> My Favorites
        </h2>
        <p className="text-xs text-slate-400 mt-1">Tracks you have saved to your library.</p>
      </div>

      {isLoading ? (
        <p className="text-xs text-slate-500 text-center py-14">Loading favorites...</p>
      ) : favoriteTracks.length === 0 ? (
        <div className="text-center py-14 bg-slate-900/10 border border-dashed border-white/5 rounded-3xl p-6">
          <Heart className="w-8 h-8 mx-auto mb-2 text-slate-600" />
          <p className="text-xs text-slate-450">No favorite songs added yet.</p>
        </div>
      ) : (
        <div className="space-y-2.5 bg-slate-900/10 border border-white/3 p-4 rounded-3xl shadow-inner">
          {favoriteTracks.map((track, idx) => (
            <TrackRow
              key={track.id}
              track={track}
              index={idx}
              onViewReport={onViewReport}
              onViewDetails={onViewDetails}
            />
          ))}
        </div>
      )}
    </div>
  );
};
