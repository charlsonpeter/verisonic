# VeriSonic — Implementation Plan & Technical Spec

Living document describing what is **implemented today**, how the system works, and known gaps. Last aligned with the codebase: July 2026.

---

## 1. Product overview

VeriSonic is a full-stack audio platform:

1. **Music catalog** — lossless uploads, automated quality analysis, multi-bitrate transcoding, HLS VOD playback, ticketed master-stream delivery
2. **Live radio** — desktop broadcaster ingest, real-time listener delivery, station profiles and program schedules
3. **Consumer experience** — web player with queue, lyrics, favorites, playlists, search, mobile-first navigation, stream quality tiers
4. **Monetization** — free trial + preview limits, Razorpay checkout for Premium (INR), admin-assigned Unlimited tier
5. **Administration** — user/role/subscription management, studio & station moderation, analytics

---

## 2. Architecture

### 2.1 Why WebSockets for live broadcast (not webhooks)

Webhooks are stateless HTTP callbacks suited for discrete events. Live audio requires a **persistent, low-overhead, bidirectional** channel. The desktop broadcaster streams continuous MP3 frames over WebSocket; the server fans them out to listener queues.

```mermaid
sequenceDiagram
    participant B as Desktop Broadcaster
    participant API as FastAPI
    participant LSM as LiveStreamManager
    participant W as Web Client

    B->>API: WS /api/radio/stream/ws (stream_key or JWT)
    B->>API: MP3 binary chunks
    API->>LSM: ingest(chunk)
    W->>API: GET /api/radio/{id}/live
    LSM->>W: chunked audio/mpeg stream
```

### 2.2 Music processing pipeline

```mermaid
graph LR
    Upload[POST /api/music/upload] --> Analyze[Celery analyze_audio_task]
    Analyze --> Score[Quality score + spectrogram]
    Score -->|approved| Transcode[Celery transcode_audio_task]
    Transcode --> S3[(MinIO S3)]
    S3 --> Play[HLS / MP3 / AAC / master stream URLs]
```

### 2.3 Subscription checkout

```mermaid
sequenceDiagram
    participant U as Web Client
    participant API as FastAPI
    participant RP as Razorpay

    U->>API: GET /api/subscriptions/plans
    U->>API: POST /api/subscriptions/create-order
    API->>RP: Create order
    RP-->>U: Razorpay Checkout modal
    U->>API: POST /api/subscriptions/verify
    API->>API: Apply plan / queue change
```

### 2.4 Frontend shell

- Hash-based tab routing (`#home`, `#radio`, …) in `App.tsx` — no React Router
- Global state: `AuthContext` (user, role, admin/listener mode, subscription), `AudioContext` (player, queue, favorites, quality)
- Layout: `Header` (desktop nav + mobile app bar), `MobileNav` (bottom tabs), `AudioPlayer`, `OptionalPanel` (queue/programs)
- Subscription UI: `SubscriptionPlans`, `PremiumModal`, `SubscriptionDates`, `SubscriptionQueueNotice`

---

## 3. Backend — implemented

### 3.1 Stack

| Component | Technology |
|-----------|------------|
| API | FastAPI, Uvicorn |
| ORM | SQLAlchemy + PostgreSQL |
| Tasks | Celery + Redis |
| Storage | MinIO (S3-compatible) |
| Live audio | WebSocket ingest, HTTP chunked MP3, WebRTC (aiortc) |
| Auth | JWT + Redis refresh tokens, bcrypt |
| Payments | Razorpay Orders API (INR) |

### 3.2 Database models (14 tables + `schema_migrations`)

`User`, `SubscriptionPayment`, `Artist`, `Album`, `Genre`, `Track`, `Playlist`, `PlaylistTrack`, `RadioStation`, `RadioSchedule`, `ListeningHistory`, `Favorite`, `AudioAnalysisReport`, `StreamingLog`

Association table: `track_genres`

Migrations: custom runner in `backend/app/db/migrations.py` (001–013).

Notable `User` fields: `subscription`, `subscription_cycle`, `subscription_expires_at`, `subscription_activated_at`, `pending_plan_id`, `pending_plan_paid`, `subscription_cancel_at_period_end`, `stream_quality`, `must_reset_password`.

### 3.3 API modules

| Prefix | Module | Status |
|--------|--------|--------|
| `/api/auth` | Registration, login, refresh, profile, admin user/studio management, mode switch, password reset | ✅ |
| `/api/music` | Upload, CRUD, search, quality, approve, play logging, transcribe, stream ticket + master stream | ✅ |
| `/api/radio` | Stations CRUD, live ingest/playback, broadcast key, WebRTC, schedule add, reactivation fields | ✅ partial schedule |
| `/api/playlist` | CRUD, add/remove/reorder tracks | ✅ |
| `/api/favorites` | List, add, remove | ✅ |
| `/api/analytics` | Admin dashboard metrics | ✅ |
| `/api/subscriptions` | Plans, Razorpay checkout, verify, schedule change, cancel/reactivate | ✅ (requires Razorpay keys) |

### 3.4 Live streaming (implemented)

| Endpoint | Purpose |
|----------|---------|
| `WS /api/radio/stream/ws` | Broadcaster ingest (MP3 chunks) |
| `GET /api/radio/{id}/live` | HTTP listener stream (`audio/mpeg`) |
| `WS /api/radio/{id}/stream/ws/listener` | WebSocket listener |
| `POST /api/radio/{id}/webrtc/listener` | WebRTC relay |
| `GET /api/radio/{id}/broadcast-key` | Fetch current broadcast key |
| `POST /api/radio/{id}/verify-broadcast-key` | Validate key before ingest |
| `POST /api/radio/{id}/regenerate-key` | Rotate stream key (time-limited) |

`LiveStreamManager` (`app/services/live_stream.py`):
- In-memory listener queues + chunk ring buffer
- Optional Redis pub/sub for multi-instance fan-out
- Listener count aggregation
- Dynamic program/RJ from `programs_list` JSON + station timezone

**Intentional behavior:** No Auto-DJ / scheduled track playback when broadcaster is offline. External `stream_url` can still mark a station online.

### 3.5 Auth & access control

- Roles: `listener`, `studio_admin`, `radio_admin`, `admin`
- Header `X-User-Mode: listener` for staff browsing as listener
- Rate limit: login/register 10 req/min per IP
- Password policy: 8+ chars, letter + number
- Mandatory first-login reset: `must_reset_password` → `POST /api/auth/reset-initial-password`
- Premium gating (`app/core/premium.py`):
  - Staff roles (`admin`, `studio_admin`, `radio_admin`) always have premium access
  - `premium` / `unlimited` with valid `subscription_expires_at`
  - `free` users get a **7-day trial** from account creation
  - Non-premium: 30s track preview, 60s radio preview, AAC 128 only

### 3.6 Subscriptions (implemented)

Plans defined in `app/core/subscription_plans.py`:

| Plan ID | Tier | Cycle | Price (INR) |
|---------|------|-------|-------------|
| `premium_monthly` | premium | monthly | ₹99 |
| `premium_yearly` | premium | yearly | ₹999 |

`unlimited` is admin-assigned only (no self-service checkout).

| Endpoint | Purpose |
|----------|---------|
| `GET /api/subscriptions/plans` | Public plan catalog |
| `GET /api/subscriptions/status` | Current user subscription state |
| `POST /api/subscriptions/create-order` | Create Razorpay order |
| `POST /api/subscriptions/verify` | Verify payment signature, activate plan |
| `POST /api/subscriptions/payment-failed` | Mark failed checkout |
| `POST /api/subscriptions/schedule-change` | Queue plan change at period end |
| `POST /api/subscriptions/cancel` | Cancel at period end |
| `POST /api/subscriptions/reactivate` | Undo pending cancellation |
| `POST /api/subscriptions/clear-scheduled-change` | Clear queued plan change |

Admin override: `PUT /api/auth/admin/users/{user_id}/subscription`

Requires `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in environment; returns `RazorpayNotConfiguredError` when unset.

### 3.7 Celery tasks

1. **`analyze_audio_task`** — FFprobe metadata, librosa spectral analysis, spectrogram PNG, quality scoring, auto-reject rules
2. **`transcode_audio_task`** — MP3 320, AAC 256/128, HLS VOD segments → S3

### 3.8 Tests (CI)

- `tests/test_api_health.py`
- `tests/test_audio_quality.py`
- `tests/test_live_stream_manager.py`

---

## 4. Frontend — implemented

### 4.1 Pages (tab routes)

| Tab | Page | Notes |
|-----|------|-------|
| `landing` | LandingPage | Marketing, pricing (`SubscriptionPlans`), featured content |
| `home` | Home | Feed with mobile tiles & horizontal scroll |
| `radio` | Radio | Listener tiles; admin dashboard & registration |
| `search` | Search | Debounced search, filters, recent/trending |
| `favorites` | Favorites | API-backed favorites list |
| `playlists` | Playlist | CRUD, drag-reorder, mobile drill-down |
| `details` | MusicDetails | Track detail, lyrics, share |
| `profile` | UserProfile | Profile, password, subscription dates |
| `station-profile` | StationProfile | Radio station management |
| `studio-profile` | StudioProfile | Studio onboarding & profile |
| `settings` | Settings | Quality, subscription management, stream key (radio admin), audio output |
| `tracks` | TracksManagement | Upload queue, approval, acoustic reports |
| `track-list` | StudioTrackList | Studio admin track library (listen mode entry) |
| `users` | UsersManagement | Admin user CRUD + subscription assignment |
| `analytics` | AdminAnalytics | Metrics dashboard |
| `reports` | Inline in App | Acoustic report viewer |
| `contact` | Contact | Support & upgrade requests |
| `broadcaster-download` | BroadcasterDownload | Desktop app download guide |
| `auth` | AuthPage | Login / register / social stub |
| `admin-password-reset` | ForceAdminPasswordReset | Mandatory admin password change gate |

**Not wired:** `Artist.tsx` (imported but no `case` in router; mock data), `Sidebar.tsx` (legacy; navigation uses Header + MobileNav).

### 4.2 Audio player

| Feature | Desktop | Mobile |
|---------|---------|--------|
| Mini player bar | Fixed bottom overlay | In-flow above bottom nav |
| Expanded player | — | Full-screen deck, browser back to dismiss |
| Queue / Programs panel | Right drawer | Full-screen bottom sheet |
| Lyrics | Modal | Tap cover → overlay in expanded player |
| Speed control | Select dropdown | Chevrons + tap speed to reset 1× |
| Visualizer | Canvas spectrum (`Equalizer`) | — |
| Live radio sync | 24h seek bar, edge sync | Same |
| Stream quality | normal / high / hires / lossless (paid) | Same |
| Audio output device | Settings picker (where supported) | — |

Lossless/hi-res playback uses short-lived stream tickets (`POST /api/music/{id}/stream/ticket` → `GET /api/music/{id}/stream/master`).

### 4.3 Subscriptions UI

- **LandingPage** and **Settings** embed `SubscriptionPlans`
- **PremiumModal** opens Razorpay Checkout inline (via `subscriptionCheckout.ts`)
- Supports immediate upgrade, queued plan changes, cancel-at-period-end, reactivation
- **UsersManagement** shows subscription tier and dates; admin can assign tiers

### 4.4 Mobile UI patterns

- **Header:** compact circular logo (left), centered page title, circular avatar (right)
- **Bottom nav:** Home, Radio, Search, Favorites, Playlists (role-aware)
- **Home feed:** horizontal scroll strips; trending 3×3 paged grids
- **Radio (listener):** compact tiles — name + frequency row, location below
- **Notifications:** banner toasts for errors/info/success; Swal retained for confirmations only
- **Track lists:** full-width `TrackRow` (matches playlist layout)

### 4.5 Route guards

- Unauthenticated → `landing`
- `must_reset_password` → `admin-password-reset` (blocks all other tabs)
- `radio_admin` without station → restricted tabs until station registered (admin mode)
- `studio_admin` in admin mode → onboarding flow until `profile_complete`; then tracks/track-list only
- Admin mode → playlists disabled; library playback stopped; radio admin cannot play other stations

---

## 5. Desktop broadcaster — implemented

**Location:** `broadcaster/verisonic_broadcaster.py` (PyQt5 primary UI, Tkinter fallback)

| Feature | Status |
|---------|--------|
| Audio device selection | ✅ |
| WebSocket MP3 streaming | ✅ |
| Stream key / JWT auth | ✅ |
| VU meter, status, duration | ✅ |
| Radio-admin-only login | ✅ |
| PyInstaller CI builds (macOS, Linux, Windows) | ✅ `.github/workflows/build-broadcaster.yml` |

---

## 6. Known gaps & future work

| Area | Gap |
|------|-----|
| Radio schedule | Add-only API; no list/delete/reorder; no automated scheduled playback |
| Playlists | `is_public` stored but no public discovery endpoint |
| Artists | `Artist.tsx` page exists but not routed; search “artists” filter has no dedicated view |
| Listening history | Written on play; no user-facing history API/page |
| Google OAuth | Mock endpoint only; no real token verification |
| Razorpay | Full flow implemented; disabled until server keys are configured |
| Track comments | Client-side mock on MusicDetails; not persisted |
| Album/genre CRUD | Models exist; no standalone management APIs |

---

## 7. Verification checklist

### Live broadcast
1. Start stack: `docker compose up --build`
2. Log in as radio admin, register a station
3. Open Connection Settings → copy stream key
4. Run `python broadcaster/verisonic_broadcaster.py`, authenticate, start broadcast
5. Confirm station shows **Live** in dashboard; play station in web player

### Music upload
1. Promote user to studio admin
2. Complete studio profile (admin mode onboarding)
3. Upload lossless file via Tracks Management
4. Wait for Celery analysis + transcode
5. Approve track (admin) if not auto-approved
6. Play from Home or Search

### Subscription checkout (requires Razorpay keys)
1. Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in `docker-compose.yml` or env
2. Log in as listener, open Settings or Premium modal
3. Select Premium Monthly or Yearly → complete Razorpay test checkout
4. Confirm tier badge updates and full playback unlocked

### Mobile smoke test
1. Open portal on narrow viewport
2. Verify bottom nav, expanded player, queue full-screen sheet
3. Verify banner on offline station tap (not blocking Swal modal)
4. Verify Home trending 3×3 scroll and Radio tile strip

### Automated
```bash
cd backend && pytest tests/ -v
```

---

## 8. Default seed data

| Item | Value |
|------|-------|
| Admin email | `admin@verisonic.com` |
| Admin password | `admin12345` (must reset on first login) |
| Genres | Rock, Electronic, Classical, Jazz, Hip-Hop, Ambient |

---

## 9. File reference (key paths)

| Area | Path |
|------|------|
| API entry | `backend/app/main.py` |
| Radio + live stream | `backend/app/api/radio.py`, `backend/app/services/live_stream.py` |
| Music + upload | `backend/app/api/music.py`, `backend/app/tasks/tasks.py` |
| Subscriptions | `backend/app/api/subscriptions.py`, `backend/app/services/subscription_service.py`, `backend/app/services/razorpay_service.py` |
| Premium gating | `backend/app/core/premium.py`, `backend/app/core/subscription_plans.py` |
| Migrations | `backend/app/db/migrations.py` |
| App router | `frontend/src/App.tsx` |
| Player | `frontend/src/components/player/AudioPlayer.tsx` |
| Audio state | `frontend/src/context/AudioContext.tsx` |
| Auth state | `frontend/src/context/AuthContext.tsx` |
| Subscription checkout | `frontend/src/utils/subscriptionCheckout.ts`, `frontend/src/components/subscription/SubscriptionPlans.tsx` |
| Stream quality | `frontend/src/utils/streamQuality.ts` |
| Banner notifications | `frontend/src/components/shared/BannerHost.tsx`, `frontend/src/utils/banner.ts` |
| Confirm dialogs | `frontend/src/utils/swal.ts` |
| Broadcaster | `broadcaster/verisonic_broadcaster.py` |
