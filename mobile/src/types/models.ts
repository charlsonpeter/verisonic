export type QualityLevelSetting = 'normal' | 'high' | 'hires' | 'lossless';

export type SubscriptionTier = 'free' | 'premium' | 'unlimited';

export type UserRole = 'listener' | 'studio_admin' | 'radio_admin' | 'admin';

export interface User {
  id: number;
  email: string;
  full_name: string;
  profile_image_url?: string | null;
  role: UserRole;
  real_role?: UserRole;
  subscription: SubscriptionTier;
  subscription_cycle: 'monthly' | 'yearly' | null;
  subscription_expires_at?: string | null;
  subscription_activated_at?: string | null;
  created_at?: string;
  stream_quality?: QualityLevelSetting | null;
  pending_plan_id?: string | null;
  pending_plan_paid?: boolean;
  subscription_cancel_at_period_end?: boolean;
}

export interface Track {
  id: number;
  title: string;
  artist_id?: number;
  artist_name: string;
  artist_name_override?: string;
  album_title?: string;
  album_artist?: string;
  track_number?: number | string;
  year?: number | string;
  composer?: string;
  lyricist?: string;
  language?: string;
  copyright?: string;
  comment?: string;
  cover_art_url?: string;
  stream_url?: string;
  hls_playlist_path?: string;
  hls_normal_path?: string;
  hls_high_path?: string;
  hls_lossless_path?: string;
  hls_hires_path?: string;
  mp3_320_path?: string;
  aac_256_path?: string;
  aac_128_path?: string;
  original_file_path?: string;
  duration: number;
  sample_rate?: number;
  bit_depth?: number;
  bitrate?: number;
  file_format?: string;
  quality_level?: string;
  lyrics?: string;
  genres?: Array<string | { name?: string }>;
}

export interface RadioStation {
  id: number;
  name: string;
  description?: string;
  cover_art_url?: string;
  stream_url: string;
  current_track_title?: string;
  current_track_artist?: string;
  listeners_count?: number;
  category?: string;
  is_online?: boolean;
  is_active?: boolean;
  current_program_title?: string;
  city?: string;
  country?: string;
  broadcast_frequency?: string;
}

export interface Playlist {
  id: number;
  name: string;
  description?: string | null;
  tracks?: Track[];
  track_count?: number;
}

export interface SubscriptionPlan {
  id: string;
  label: string;
  cycle: 'monthly' | 'yearly';
  amount_paise: number;
  amount_rupees: number;
  currency: string;
  description: string;
}

export interface CreateOrderResponse {
  order_id: string;
  amount_paise: number;
  currency: string;
  key_id: string;
  plan_id: string;
  plan_label: string;
  queued?: boolean;
}

export interface DownloadedTrackMeta {
  trackId: number;
  title: string;
  artistName: string;
  coverArtUrl?: string;
  localUri: string;
  quality: 'aac_128' | 'aac_256' | 'mp3_320';
  downloadedAt: string;
  byteSize: number;
}
