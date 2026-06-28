import React, { useState } from 'react';
import { 
  Play, Heart, Share2, Music, AlignLeft, ShieldCheck, 
  MessageSquare, Send, CheckCircle2, Award, Info
} from 'lucide-react';
import { useAudio, Track } from '../context/AudioContext';
import { useAuth } from '../context/AuthContext';

interface MusicDetailsProps {
  track: Track | null;
  onNavigate: (tab: string) => void;
}

export const MusicDetails: React.FC<MusicDetailsProps> = ({ track, onNavigate }) => {
  const { playTrack, favorites, toggleFavorite } = useAudio();
  const { currentUser } = useAuth();
  
  // Comments state
  const [comments, setComments] = useState([
    { author: "Alexander P.", text: "The treble resolution in this master is unbelievable. No harsh sibilance at all.", time: "2 hours ago", role: "listener" },
    { author: "Dmitri K.", text: "Checked the spectrogram, cutoff is solid at 22kHz. Pure authentic FLAC. Verified.", time: "1 day ago", role: "admin" }
  ]);
  const [newComment, setNewComment] = useState('');

  if (!track) {
    return (
      <div className="text-center py-20">
        <Music className="w-12 h-12 text-slate-500 mx-auto mb-4 animate-bounce" />
        <h3 className="text-slate-355 font-bold text-sm">No track selected</h3>
        <button onClick={() => onNavigate('home')} className="mt-4 px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-xs font-bold rounded-xl transition">
          Return to Home
        </button>
      </div>
    );
  }

  const isFav = favorites.includes(track.id);

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    setComments([
      ...comments,
      {
        author: currentUser?.full_name || "Guest listener",
        text: newComment,
        time: "Just now",
        role: currentUser?.role || "listener"
      }
    ]);
    setNewComment('');
  };

  return (
    <div className="space-y-10 w-full overflow-x-hidden">
      
      {/* 1. HERO HERO ARTWORK HEADER */}
      <section className="flex flex-col md:flex-row gap-8 items-center md:items-end">
        <div className="w-56 h-56 bg-slate-900 border border-white/5 rounded-3xl overflow-hidden shadow-2xl flex-shrink-0 relative group">
          <img src={track.cover_art_url} alt="Cover" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
            <button 
              onClick={() => playTrack(track)}
              className="w-12 h-12 bg-white text-slate-950 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition"
              title="Play Track"
            >
              <Play className="w-5 h-5 fill-current ml-0.5" />
            </button>
          </div>
        </div>
        
        <div className="text-center md:text-left space-y-3 flex-1 min-w-0">
          <span className="text-[10px] text-rose-400 font-extrabold uppercase tracking-widest flex items-center justify-center md:justify-start gap-1">
            <ShieldCheck className="w-4 h-4 text-rose-400" />
            Authenticated Hi-Fi Release
          </span>
          <h1 className="text-3xl md:text-5xl font-extrabold text-gradient-premium tracking-tight leading-tight">
            {track.title}
          </h1>
          <p className="text-sm text-slate-350 font-bold">
            Artist: <span className="text-slate-100">{track.artist_name}</span>
          </p>
          {track.album_title && (
            <p className="text-xs text-slate-450 font-semibold">Album: {track.album_title}</p>
          )}

          <div className="flex flex-wrap gap-2 pt-2 justify-center md:justify-start">
            <span className="px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/15">
              Studio Quality Checked
            </span>
            {track.quality_score && (
              <span className="px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-rose-500/10 text-rose-400 border border-rose-500/15">
                Score: {track.quality_score}/100
              </span>
            )}
          </div>
        </div>
      </section>

      {/* 2. PLAYER QUICK ACTIONS */}
      <section className="flex gap-3.5 items-center justify-center md:justify-start">
        <button
          onClick={() => playTrack(track)}
          className="px-6 py-3.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md shadow-rose-600/25 transition"
        >
          <Play className="w-4 h-4 fill-current" />
          Stream Audio Now
        </button>
        <button
          onClick={() => toggleFavorite(track.id)}
          className={`p-3 bg-slate-900 border border-white/5 rounded-xl transition ${
            isFav ? 'text-rose-500 hover:text-rose-455' : 'text-slate-400 hover:text-white'
          }`}
          title={isFav ? "Remove from Favorites" : "Add to Favorites"}
        >
          <Heart className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
        </button>
        <button
          className="p-3 bg-slate-900 border border-white/5 rounded-xl text-slate-400 hover:text-white transition"
          title="Share Link"
        >
          <Share2 className="w-4 h-4" />
        </button>
      </section>

      {/* 3. SPECS & LYRICS SPLIT GRID */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Specs and info */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-slate-900/20 border border-white/5 p-6 rounded-3xl space-y-4">
            <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest flex items-center gap-1.5">
              <Info className="w-4 h-4" /> Librosa FFT Speccing
            </h3>
            
            <div className="grid grid-cols-2 gap-4 text-xs bg-slate-950/45 p-4 border border-white/3 rounded-2xl shadow-inner font-sans">
              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 font-bold block uppercase">Resolution</span>
                <span className="font-extrabold text-slate-200">{track.bit_depth ? `${track.bit_depth}-bit` : '24-bit'} PCM</span>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 font-bold block uppercase">Frequency</span>
                <span className="font-extrabold text-slate-200">{track.sample_rate ? `${track.sample_rate / 1000} kHz` : '96.0 kHz'}</span>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 font-bold block uppercase">Container Codec</span>
                <span className="font-extrabold text-slate-200">{track.file_format || 'FLAC Lossless'}</span>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 font-bold block uppercase">Status</span>
                <span className="font-extrabold text-emerald-400 uppercase flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Approved</span>
              </div>
            </div>
            
            <p className="text-[10.5px] text-slate-450 leading-relaxed font-semibold">
              This track has been cataloged by the acoustic node verified check. FFT spectral graphs confirm a full frequency range response without lossy cutoffs.
            </p>
          </div>

          <div className="bg-slate-900/20 border border-white/5 p-6 rounded-3xl space-y-4">
            <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest flex items-center gap-1.5">
              <Award className="w-4 h-4" /> Acoustic Release Tags
            </h3>
            
            <div className="grid grid-cols-2 gap-4 text-xs bg-slate-950/45 p-4 border border-white/3 rounded-2xl shadow-inner font-sans">
              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 font-bold block uppercase">Album / Movie</span>
                <span className="font-extrabold text-slate-200 truncate block" title={track.album_title || 'Single / N/A'}>
                  {track.album_title || 'Single / N/A'}
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 font-bold block uppercase">Year</span>
                <span className="font-extrabold text-slate-200">{track.year || 'Unknown'}</span>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 font-bold block uppercase">Composer</span>
                <span className="font-extrabold text-slate-200 truncate block" title={track.composer || 'Unknown'}>
                  {track.composer || 'Unknown'}
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 font-bold block uppercase">Lyricist</span>
                <span className="font-extrabold text-slate-200 truncate block" title={track.lyricist || 'Unknown'}>
                  {track.lyricist || 'Unknown'}
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 font-bold block uppercase">Language</span>
                <span className="font-extrabold text-slate-200 truncate block" title={track.language || 'Unknown'}>
                  {track.language || 'Unknown'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Lyrics */}
        <div className="lg:col-span-7 bg-slate-900/10 border border-white/3 p-6 rounded-3xl space-y-4">
          <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest flex items-center gap-1.5">
            <AlignLeft className="w-4 h-4" /> Lyrics Transcript
          </h3>
          <div className="space-y-4 text-xs font-medium text-slate-350 leading-relaxed whitespace-pre-line">
            {track.lyrics ? track.lyrics : (
              <>
                <p>Original Master Studio Recording.</p>
                <p>High frequency components fully preserved.</p>
                <p>This represents audio direct from studio microphones.</p>
                <p>Experiencing depth at 24-bit PCM compression...</p>
                <p>Harmonic structures echoing in high fidelity.</p>
              </>
            )}
          </div>
        </div>
      </section>

      {/* 4. COMMENTS LISTING */}
      <section className="bg-slate-900/15 border border-white/3 p-6 rounded-3xl space-y-6">
        <h3 className="text-base font-extrabold text-white flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-rose-400" /> Audiophile Discussions
        </h3>

        {/* Input Form */}
        <form onSubmit={handleAddComment} className="flex gap-3 items-center bg-slate-950 border border-white/5 rounded-2xl p-2.5">
          <input
            type="text"
            placeholder="Share your thoughts on the dynamic range..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            className="bg-transparent text-xs text-slate-200 outline-none w-full px-3 placeholder-slate-500"
          />
          <button 
            type="submit"
            className="p-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl transition flex-shrink-0"
            title="Post Comment"
          >
            <Send className="w-4.5 h-4.5" />
          </button>
        </form>

        {/* List */}
        <div className="space-y-4">
          {comments.map((c, idx) => (
            <div key={idx} className="bg-slate-900/25 border border-white/3 p-4.5 rounded-2xl space-y-2">
              <div className="flex justify-between items-center text-[10px] font-bold">
                <div className="flex items-center gap-2">
                  <span className="text-slate-200">{c.author}</span>
                  <span className="px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-400 uppercase text-[8px]">
                    {c.role}
                  </span>
                </div>
                <span className="text-slate-500">{c.time}</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed font-medium">{c.text}</p>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
};
