import { apiRequest } from '@/api/client';
import type {
  CreateOrderResponse,
  Playlist,
  RadioStation,
  SubscriptionPlan,
  Track,
  User,
} from '@/types/models';

export async function login(email: string, password: string): Promise<{ access_token: string }> {
  return apiRequest('/auth/login', {
    method: 'POST',
    auth: false,
    body: { email, password },
  });
}

export async function register(
  email: string,
  password: string,
  fullName: string,
): Promise<User> {
  return apiRequest('/auth/register', {
    method: 'POST',
    auth: false,
    body: { email, password, full_name: fullName },
  });
}

export async function fetchMe(token?: string): Promise<User> {
  return apiRequest('/auth/me', { token });
}

export async function updateProfile(fullName: string, email: string): Promise<User> {
  return apiRequest('/auth/profile', {
    method: 'PUT',
    body: { full_name: fullName, email },
  });
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  await apiRequest('/auth/change-password', {
    method: 'PUT',
    body: { old_password: oldPassword, new_password: newPassword },
  });
}

export async function fetchTrending(limit = 24): Promise<Track[]> {
  return apiRequest(`/discovery/trending?limit=${limit}`, { auth: false });
}

export async function fetchStudios(): Promise<Array<{ id: number; stage_name: string; cover_art_url?: string }>> {
  return apiRequest('/discovery/studios', { auth: false });
}

export async function searchMusic(term: string): Promise<Track[]> {
  return apiRequest(`/music?search=${encodeURIComponent(term)}&approved_only=true`, { auth: false });
}

export async function fetchTrack(id: number): Promise<Track> {
  return apiRequest(`/music/${id}`, { auth: false });
}

export async function fetchListeningHistory(limit = 20, offset = 0): Promise<Array<{ track: Track }>> {
  return apiRequest(`/music/listening-history?limit=${limit}&offset=${offset}`);
}

export async function reportTrackListenProgress(
  trackId: number,
  listenedSeconds: number,
): Promise<{ credited: boolean; credit_paise?: number }> {
  return apiRequest(`/music/${trackId}/listen-progress`, {
    method: 'POST',
    body: { listened_seconds: listenedSeconds },
  });
}

export async function fetchRadioStations(): Promise<RadioStation[]> {
  return apiRequest('/radio', { auth: false });
}

export async function startRadioListenSession(
  stationId: number,
): Promise<{ session_token: string | null; billable: boolean }> {
  return apiRequest(`/radio/${stationId}/listen-session/start`, { method: 'POST' });
}

export async function heartbeatRadioListenSession(
  stationId: number,
  sessionToken: string,
): Promise<void> {
  await apiRequest(`/radio/${stationId}/listen-session/heartbeat`, {
    method: 'POST',
    body: { session_token: sessionToken },
  });
}

export async function endRadioListenSession(stationId: number, sessionToken: string): Promise<void> {
  await apiRequest(`/radio/${stationId}/listen-session/end`, {
    method: 'POST',
    body: { session_token: sessionToken },
  });
}

export async function fetchFavorites(): Promise<Track[]> {
  return apiRequest('/favorites');
}

export async function addFavorite(trackId: number): Promise<void> {
  await apiRequest(`/favorites/${trackId}`, { method: 'POST' });
}

export async function removeFavorite(trackId: number): Promise<void> {
  await apiRequest(`/favorites/${trackId}`, { method: 'DELETE' });
}

export async function fetchPlaylists(): Promise<Playlist[]> {
  return apiRequest('/playlist');
}

export async function fetchPlaylist(id: number): Promise<Playlist> {
  return apiRequest(`/playlist/${id}`);
}

export async function createPlaylist(name: string): Promise<Playlist> {
  return apiRequest('/playlist', { method: 'POST', body: { name } });
}

export async function deletePlaylist(playlistId: number): Promise<void> {
  await apiRequest(`/playlist/${playlistId}`, { method: 'DELETE' });
}

export async function addTrackToPlaylist(playlistId: number, trackId: number): Promise<void> {
  await apiRequest(`/playlist/${playlistId}/track`, {
    method: 'POST',
    body: { track_id: trackId },
  });
}

export async function removeTrackFromPlaylist(
  playlistId: number,
  trackId: number,
): Promise<Playlist> {
  return apiRequest(`/playlist/${playlistId}/track/${trackId}`, {
    method: 'DELETE',
  });
}

export async function reorderPlaylistTracks(
  playlistId: number,
  trackIds: number[],
): Promise<Playlist> {
  return apiRequest(`/playlist/${playlistId}/tracks/reorder`, {
    method: 'PUT',
    body: { track_ids: trackIds },
  });
}

export async function fetchSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  return apiRequest('/subscriptions/plans', { auth: false });
}

export async function createSubscriptionOrder(planId: string): Promise<CreateOrderResponse> {
  return apiRequest('/subscriptions/create-order', {
    method: 'POST',
    body: { plan_id: planId },
  });
}

export async function verifySubscriptionPayment(payload: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}): Promise<{ message: string }> {
  return apiRequest('/subscriptions/verify', { method: 'POST', body: payload });
}

export type ReactionValue = 'like' | 'dislike';

export async function fetchTrackReactions(): Promise<Record<string, ReactionValue>> {
  return apiRequest('/reactions');
}

/** Tracks the current user liked (thumbs-up). Server-filtered. */
export async function fetchLikedTracks(): Promise<Track[]> {
  return apiRequest('/reactions/liked');
}

export async function setTrackReaction(
  trackId: number,
  reaction: ReactionValue,
): Promise<void> {
  await apiRequest(`/reactions/${trackId}`, {
    method: 'PUT',
    body: { reaction },
  });
}

export async function clearTrackReaction(trackId: number): Promise<void> {
  await apiRequest(`/reactions/${trackId}`, { method: 'DELETE' });
}

