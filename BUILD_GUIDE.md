# VeriSonic — Complete Application Build Guide

This document is a **full blueprint** to rebuild an application with the **same layout, roles, features, APIs, data model, and behavior** as VeriSonic. If a capability is listed here, the reference app implements it (or notes an intentional exception).

**Companion docs:** [README.md](README.md) (quick start), [implementation_plan.md](implementation_plan.md) (status & gaps), [task.md](task.md) (checklist), [walkthrough.md](walkthrough.md) (broadcaster), [broadcaster/distributing_broadcaster.md](broadcaster/distributing_broadcaster.md).

**Aligned with codebase:** July 2026 (migrations **001–029**, daily settlement, engagement, hybrid lyrics, authenticity analysis).

---

## 0. What you are building

A **high-fidelity audio platform** with four product surfaces in one stack:

| Surface | Who | What |
|---------|-----|------|
| Consumer web portal | Listeners (+ staff in Listen mode) | Browse, search, play music & live radio, favorites, playlists, like/dislike, comments, subscribe |
| Studio admin portal | Studio admins | Profile/onboarding, lossless uploads, quality + authenticity pipeline, track library, optional AI lyrics, wallet |
| Radio admin portal | Radio admins | Station profile, live broadcast (desktop app), schedule, program engagement, wallet |
| Platform admin portal | Super admins | Users, studios/stations moderation, **Engagements**, analytics, quality reports, **Accounts** (owners / withdrawals / subscriptions / revenue settings / manual settle) |

**Monetization model (must match):**

1. Listeners pay the **company** via Razorpay (Premium Monthly / Yearly).
2. Qualifying **premium** listens are **recorded** (track plays + radio sessions) but do **not** credit wallets immediately.
3. **Celery Beat** runs **daily settlement** (00:30 UTC): for each premium listener that day, compute `daily_subscription_value × owner_share_bps`, then allocate that creator pool across owners weighted by that listener’s valid listen seconds.
4. Owners **withdraw instantly** to bank (self-service; status `paid` immediately). Accounts admin is **view/export** (+ optional manual settle trigger) — no withdrawal approval queue.

**Billable vs playback access:**

| Listener type | Full playback? | Records billable listens? | Included in daily settlement pool? |
|---------------|----------------|---------------------------|------------------------------------|
| Free (post-trial) | Preview only | No | No |
| Free (7-day trial) | Yes | No | No |
| Premium (active) | Yes | Yes | Yes |
| Unlimited (admin-assigned) | Yes | No | No |
| Staff in Admin mode | Yes (role bypass) | No | No |

**Not included (intentional):** Auto-DJ when a broadcaster is offline; real Google OAuth (email/password only until OAuth is configured); public playlist discovery endpoint; radio schedule list/delete/reorder API.

---

## 1. Technology stack (reproduce exactly)

| Layer | Choice |
|-------|--------|
| Web UI | React 18 + TypeScript + Vite + Tailwind CSS + Framer Motion + Lucide + SweetAlert2 + hls.js |
| Routing | **Hash tabs** in `App.tsx` (`#home`, `#radio`, …) — **no React Router** for app navigation (package may be present unused) |
| Global state | `AuthContext`, `AudioContext` |
| API | FastAPI + Uvicorn + SQLAlchemy + PostgreSQL |
| Schema changes | Custom SQL migrations in `backend/app/db/migrations.py` + `schema_migrations` table (**001–029**) |
| Jobs | Celery **worker** + Celery **beat** + Redis |
| Object storage | MinIO (S3-compatible) + presigned URLs; nginx `/storage/` proxy |
| Auth | JWT access (short) + refresh cookie/token (Redis JTI when Redis required) |
| Payments | Razorpay Orders API (INR) |
| Live radio | PyQt5 desktop broadcaster → WebSocket MP3 ingest → HTTP / WebSocket / WebRTC listeners |
| Optional AI lyrics | lrclib + LALAL.AI + Google Cloud Speech (Chirp-2) + Gemini (Vertex) |
| Edge | Nginx reverse proxy (port 3000 → frontend + `/api` + live stream + downloads + storage) |
| Local run | Docker Compose: `db`, `redis`, `minio`, `backend`, `worker`, **`beat`**, `frontend`, `nginx` |

---

## 2. Application shell & layout (must match)

### 2.1 Viewport composition

```
┌─────────────────────────────────────────────────────────────┐
│ Header (desktop): brand/title · nav · HeaderSearch · avatar │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Main scrollable content (active tab page)                  │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ OptionalPanel (queue / radio programs) when open            │
├─────────────────────────────────────────────────────────────┤
│ AudioPlayer (global) — collapsed bar / expanded mobile      │
├─────────────────────────────────────────────────────────────┤
│ MobileNav (bottom) — Home · Radio · Search · Library …      │
└─────────────────────────────────────────────────────────────┘
```

**Hide chrome** on: `#landing`, `#auth`, admin password-reset gate, and unauthenticated `#contact`.

**Visual language:** dark slate background (`slate-950`), rose accents, glass cards (`glass-card`), premium gradient text where branded.

### 2.2 Hash routes → pages

Implement every tab below (same IDs):

| Hash tab | Page component | Audience |
|----------|----------------|----------|
| `landing` | `LandingPage` | Logged-out marketing + pricing |
| `auth` | `AuthPage` | Login / register (email+password; Google disabled until real OAuth) |
| `admin-password-reset` | `ForceAdminPasswordReset` | Seeded admin must change password |
| `home` | `Home` | Recently played, trending, popular artists/studios |
| `radio` | `Radio` | Listener tiles **or** radio-admin dashboard (programs + engagement counts) |
| `search` | `Search` | Full search + album/artist/playlist detail |
| `artist` | `Artist` | Discovery artist page |
| `favorites` | `Favorites` | API favorites |
| `playlists` | `Playlist` | CRUD + drag reorder |
| `details` | `MusicDetails` | Track detail, lyrics, threaded comments, share |
| `profile` | `UserProfile` | Name, email, password, avatar upload |
| `wallet` | `Wallet` | Owner balance, ledger, withdraw, CSV export |
| `settings` | `Settings` | Quality, subscription UI, output device; admin revenue panel |
| `contact` | `Contact` | Support + studio/radio upgrade requests |
| `broadcaster-download` | `BroadcasterDownload` | Desktop app download |
| `studio-profile` | `StudioProfile` **or** `StudiosManagement` (admin) | Onboarding / moderation |
| `station-profile` | `StationProfile` **or** `RadioStationsManagement` (admin) | Station / moderation |
| `tracks` | `TracksManagement` | Upload + quality + approve + lyrics extract |
| `track-list` | `StudioTrackList` | Studio library |
| `engagements` | `StudioTracksEngagement` | **Admin only** — studio tracks & radio programs engagement |
| `studio-tracks-engagement` | Alias → redirect to `engagements` | Legacy hash |
| `users` | `UsersManagement` | **Admin only** — roles & subscriptions |
| `accounts` | `AccountsManagement` | **Admin only** — finance overview |
| `analytics` | `AdminAnalytics` | **Admin only** |
| `reports` | Inline acoustic report UI in `App.tsx` | Admin, or studio_admin in admin mode |
| `history` | Redirect → `home` | History lives on Home |
| `discover` | Redirect → `home` | Legacy |

**Default post-login tab** (`frontend/src/utils/navigation.ts` → `getPostLoginTab`):

- Radio admin (admin mode) → `radio`
- Studio admin (admin mode) → `track-list` if profile complete, else `studio-profile`
- Everyone else → `home`

**Route guards (required):**

- Admin-only tabs: `accounts`, `users`, `analytics`, `engagements` (redirect non-admin to post-login tab).
- `reports`: admin, or studio_admin in admin mode.
- Studio admin in **Listen mode**: only `STAFF_LISTENER_TABS` (home, radio, search, favorites, playlists, contact, profile, artist, details, settings, admin-password-reset).
- Radio admin without station (Admin mode): force onboarding toward station profile / contact / wallet / settings / radio.
- `history` → `home`; `studio-tracks-engagement` → `engagements`; `discover` → `home`.
- Header search + playlists disabled in staff **Admin mode**.
- Unauthenticated → `landing` (except `auth`, `contact`).

### 2.3 Header & navigation

**Header (`Header.tsx`):**

- Page title from `pageTitles.ts` (or override for track/artist).
- Role-aware nav icons (listener vs studio vs radio vs admin), including **Engagements** for platform admin.
- Compact **HeaderSearch** (not on `#search`, not in admin mode): debounced preview → track play / radio / artist / album / playlist detail.
- Tier badge (Premium / trial).
- Avatar dropdown: profile, settings, wallet (owners), mode switch (staff), logout.
- Mode switch: Admin ↔ Listen (`POST /api/auth/switch-mode`; API calls may send `X-User-Mode: listener`).

**MobileNav:** primary destinations for small screens; expanded player overlays content.

### 2.4 Global audio player (`AudioContext` + `AudioPlayer`)

Must support:

- Track + live radio playback (HTTP live / WebRTC / WS as implemented)
- Queue, shuffle, repeat **none / one / all**
- Playback speed, mute, volume, seek
- Quality tiers: normal / high / hires / lossless (premium-gated) via per-quality HLS/MP3/AAC candidates
- Ticketed **master** streams; on ticket failure fall through to lossy candidates
- Favorites sync
- **Like / dislike** on current track or current radio program (`/api/reactions`)
- `playQueueTracks(tracks)` for Play All
- MediaSession
- Radio listen-session start / heartbeat / end (records seconds for settlement)
- Track `listen-progress` + `/music/{id}/play` using **current** access token (ref, not stale closure)
- Premium modal when free preview ends
- Timed lyrics display when `lyrics_timed` present
- Staff radio admins cannot play library tracks in admin mode

### 2.5 Shared UI building blocks

| Area | Components |
|------|------------|
| Layout | `Header`, `HeaderSearch`, `MobileNav`, `OptionalPanel`, `Sidebar` (legacy unused) |
| Player | `AudioPlayer`, `Equalizer`, `TrackInfoPanel`, `RadioProgramInfoPanel`, `visualizer/*` |
| Subscription | `SubscriptionPlans`, `SubscriptionDates`, `SubscriptionQueueNotice`, `PremiumModal` |
| Wallet | `WithdrawModal`, `WithdrawalsExportModal`, `EarningsChart` |
| Engagement | `CommentThread`, `TrackEngagementModal`, `ProgramEngagementModal` |
| Shared | `UserAvatar`, `TrackRow` / `TrackSearchRow`, `RadioCard` / `RadioSearchRow`, `DatePicker`, `TimePicker`, `ListSearchInput`, `LazyListSentinel`, `AppModal`, `BannerHost`, `LyricsModal`, `CoverImageUpload`, `ProfileAvatarUpload`, `LicenceDocumentUpload`, `AddToPlaylistButton`, `AcousticScoreBreakdown` |
| Skeletons | Full set under `shared/skeleton/` |

**List UX pattern (Accounts & admin lists):** `useLazyList` + `LazyListSentinel` + `ListSearchInput` + backend CSV downloads.

---

## 3. Roles & entitlements

| Role | Capabilities |
|------|----------------|
| `listener` | Browse/play (gated by subscription), favorites, playlists, reactions, comments, contact/upgrade requests, subscribe |
| `studio_admin` | Studio profile (`profile_complete` gate), uploads, track manage, lyrics extract (if enabled), wallet, cover/licence |
| `radio_admin` | Station(s), broadcast key, live ingest, schedule, program engagement view, wallet, cover/licence |
| `admin` | Users, Accounts, Engagements, analytics, reports, studios/stations moderation, revenue settings, manual settle |

**Subscription tiers:**

| Tier | How obtained | Playback | Revenue contribution |
|------|--------------|----------|----------------------|
| `free` | Default | 7-day full trial, then 30s track / 60s radio preview, AAC 128 only | None |
| `premium` | Razorpay Monthly/Yearly | Full catalog + quality tiers; plan queue / cancel-at-period-end | Billable listens + daily settlement |
| `unlimited` | **Admin assign only** | Full access; cannot self-checkout; payment failure must not downgrade | **No** billable listens / settlement |

Staff roles (`admin`, `studio_admin`, `radio_admin`) always have premium-level **playback** access while in their staff role (not listener mode).

---

## 4. Feature catalog (do not omit)

### 4.1 Listener

- [ ] Landing + Auth (register/login/refresh/logout)
- [ ] Home: recently played (paginated), trending (`/api/discovery/trending`), popular artists → Search/Artist, studio covers from discovery
- [ ] Radio browse (covers, frequency, location); play live or external URL
- [ ] Search: header preview + full page filters (all/tracks/albums/radio/artists/playlists); album/playlist detail; Play All
- [ ] Artist page (discovery API): tracks, albums, related, Play All
- [ ] Track details: lyrics (plain + timed), **threaded comments** with like/dislike, share, add to playlist
- [ ] Favorites + Playlists (reorder)
- [ ] Player like/dislike for track or active radio program
- [ ] Radio program comments (threaded) while listening
- [ ] Settings: stream quality, subscription checkout/manage, audio output device
- [ ] Contact: studio upgrade → artist request; radio upgrade → radio-admin request; general support honest “not online yet” if no mailbox API

### 4.2 Studio admin

- [ ] Studio profile onboarding + cover + licence document
- [ ] Upload lossless (FLAC/WAV/AIFF/ALAC) → Celery analyze (score + **authenticity**) → approve → transcode (MP3/AAC + **per-quality HLS**)
- [ ] Tracks management + studio track list; optional **hybrid lyrics extraction** (manual trigger)
- [ ] WebSocket track status / analysis progress for upload UX
- [ ] Reactivation appeal if disabled
- [ ] Wallet: summary, ledger (`daily_settlement` entries), bank account (encrypted), **instant withdraw**, CSV/email export

### 4.3 Radio admin

- [ ] Create/edit station profile + cover + licence
- [ ] Stream key get/regenerate; Connection Settings
- [ ] Desktop broadcaster (PyQt5) WebSocket ingest
- [ ] Listener delivery: HTTP live, WS listener, WebRTC
- [ ] Program schedule editor + timezone-aware “now playing” metadata (`programs_list` JSON)
- [ ] Program engagement counts + detail modal (likes/dislikes/comments)
- [ ] Wallet same as studio

### 4.4 Platform admin

- [ ] Users: roles, subscriptions (including Unlimited), activate/deactivate
- [ ] Studios / Radio Stations management: moderation, licence review, covers
- [ ] **Engagements** (`#engagements`): list studio/radio accounts → drill into tracks or programs → engagement modals
- [ ] Analytics dashboard (`GET /api/analytics/dashboard`)
- [ ] Acoustic quality reports + approve/reject (authenticity fields visible)
- [ ] **Accounts** tabs in this order:
  1. **Overview** — summary cards
  2. **Owners** — list + detail (tracks/stations revenue attribution), search, CSV
  3. **Withdrawals** — owners with withdrawal activity; detail with From/To date filter, search, CSV (**opening balance** when From set)
  4. **Subscriptions** — subscribers list, detail payments with date filter + search + CSV
  5. **Settings** — revenue settings (prices, company/owner share BPS, min listen/withdraw, **daily_settlement_enabled**, min valid daily listen seconds); optional manual settle
- [ ] All finance CSVs **generated on backend**
- [ ] Seed helper: `backend/scripts/seed_accounts_test_data.py`

### 4.5 Security (ship these)

- [ ] Access JWT must **reject** `type: refresh` and `type: stream`
- [ ] Production: `ENVIRONMENT=production` → require strong `SECRET_KEY`, `REQUIRE_REDIS=true`
- [ ] Rate-limit login/register
- [ ] Password policy; admin `must_reset_password` gate
- [ ] Bank fields encrypted at rest; withdrawal snapshots encrypted
- [ ] Wallet withdraw + radio heartbeat use **row locks** (`SELECT … FOR UPDATE`)
- [ ] Settlement credits idempotent per owner/day (`uq_daily_settlement_credits_date_owner`)
- [ ] Destructive scripts require explicit confirm flags (e.g. `--i-know-what-im-doing`)

---

## 5. Backend architecture

### 5.1 Process topology

```text
Browser / Broadcaster / Razorpay
              │
           Nginx :3000
    ┌─────────┼──────────┐
 Frontend  Backend :8001 ──► Postgres
              │         ──► Redis (Celery broker + refresh JTI + optional live pub/sub)
              │         ──► MinIO
         Celery worker
         Celery beat ──► settle_daily_revenue_task (00:30 UTC)
```

### 5.2 API modules (mount under `/api`)

| Prefix | Module file | Responsibility |
|--------|-------------|----------------|
| `/auth` | `auth.py` | Register, login, refresh, me, profile, avatar, studio profile, licence/cover, request-artist/radio-admin, admin users/studios/engagements, mode, reactivation, subscription override |
| `/music` | `music.py` | Parse metadata, upload, CRUD, search/manage, engagement, approve, play, listen-progress, comments (threaded), stream ticket + master, listening-history, lyrics extract, status WS |
| `/radio` | `radio.py` | Stations CRUD, covers/licence, live WS/HTTP/WebRTC, keys, schedule add, listen sessions, programs + engagement, program comments |
| `/reactions` | `reactions.py` | Track/program/comment like-dislike upsert/delete; list user reactions |
| `/playlist` | `playlists.py` | CRUD + reorder (**serialize tracks with `viewer=`**) |
| `/favorites` | `favorites.py` | List/add/remove |
| `/analytics` | `analytics.py` | Admin dashboard |
| `/subscriptions` | `subscriptions.py` | Plans, order, verify, fail, schedule/cancel/reactivate |
| `/wallet` | `wallet.py` | Summary, ledger, bank, withdraw (instant paid), exports |
| `/admin/revenue` | `revenue_admin.py` | Settings, owners, subscribers, withdrawals, summary, **settle** |
| `/discovery` | `discovery.py` | Studios browse, artist by name, trending, track radio |
| `/albums`, `/genres` | `catalog.py` | Album/genre CRUD |

OpenAPI: `/docs` in development only.

### 5.3 Endpoint inventory (rebuild checklist)

#### Auth (`/api/auth`)

| Method | Path | Notes |
|--------|------|-------|
| POST | `/register`, `/login`, `/login-form`, `/logout`, `/refresh` | Rate-limited register/login |
| POST | `/google` | Present but not real OAuth — do not enable in product |
| GET | `/me` | Current user + artist_profile |
| PUT | `/me/settings` | Stream quality etc. |
| POST | `/switch-mode` | Admin ↔ listener |
| PUT | `/profile`, POST `/profile/avatar` | Display name / avatar |
| PUT | `/change-password`, POST `/reset-initial-password` | Password flows |
| PUT | `/studio-profile`, POST `…/licence-document`, POST `…/cover` | Studio onboarding |
| POST | `/request-artist`, `/request-radio-admin`, `/request-reactivation` | Upgrade / appeal |
| GET/PUT/DELETE | `/admin/users…` | Users + role + subscription |
| GET/PUT | `/admin/studios…` | Studio moderation + studio tracks list |
| GET | `/admin/engagements/accounts` | Paginated studio+radio accounts for Engagements UI |
| GET | `/admin/radio/{station_id}/programs` (+ `…/engagement`) | Admin program engagement |

#### Music (`/api/music`)

| Method | Path | Notes |
|--------|------|-------|
| POST | `/parse-metadata`, `/upload` | Upload returns 202; Celery analyzes |
| GET | ``, `/autocomplete-suggestions`, `/capabilities` | Catalog search / feature flags |
| GET | `/manage`, `/manage/{id}/engagement` | Studio/admin manage + counts |
| GET | `/listening-history` | Home recently played |
| GET/PUT/DELETE | `/{id}` | Detail / update / delete |
| GET | `/{id}/quality`, POST `/{id}/approve` | Reports + approval |
| POST | `/{id}/play`, `/{id}/listen-progress` | History + **record** billable play (no wallet credit) |
| POST | `/{id}/stream/ticket`, GET `/{id}/stream/master` | Lossless tickets |
| GET/POST | `/{id}/comments` | Threaded (`parent_id`); reactions via `/reactions` |
| POST | `/{id}/extract-lyrics`, GET `/extract-lyrics/status/{task_id}` | Hybrid pipeline (gated by settings) |
| WS | `/ws/tracks/status`, `/ws/analysis/{track_id}` | Upload/analysis UX |

#### Radio (`/api/radio`)

| Method | Path | Notes |
|--------|------|-------|
| POST/PUT | ``, `/{id}` | Create/update station |
| POST | `/{id}/cover`, `/{id}/licence-document` | Media |
| GET | ``, `/admin` | Public list / admin paginated |
| POST | `/{id}/schedule` | Add schedule entry (list/delete/reorder not implemented) |
| WS | `/stream/ws` | Broadcaster ingest |
| GET | `/{id}/live`, WS `/{id}/stream/ws/listener`, POST `/{id}/webrtc/listener` | Listeners |
| GET/POST | `/{id}/broadcast-key`, `verify-broadcast-key`, `regenerate-key` | Keys |
| POST | `/{id}/listen-session/start|heartbeat|end` | Accrue seconds for settlement |
| GET | `/{id}/programs`, `/{id}/programs/{key}/engagement` | Admin engagement |
| GET/POST | `/{station_id}/programs/{key}/comments` | Public comments (threaded) |

#### Reactions (`/api/reactions`)

| Method | Path |
|--------|------|
| GET | `` (map track_id → like/dislike), `/radio-programs` |
| PUT/DELETE | `/{track_id}` |
| PUT/DELETE | `/radio/{station_id}/{program_key}` |
| PUT/DELETE | `/comments/{comment_id}` |
| PUT/DELETE | `/radio-program-comments/{comment_id}` |

Reaction values: `"like"` \| `"dislike"` only.

#### Subscriptions (`/api/subscriptions`)

`GET /plans`, `GET /status`, `POST /create-order`, `/verify`, `/payment-failed`, `/schedule-change`, `/cancel`, `/reactivate`, `/clear-scheduled-change`.

#### Wallet (`/api/wallet`)

`GET /summary`, `/ledger`, `GET|PUT|DELETE /bank-account`, `POST /withdraw`, `GET /withdrawals`, `GET /withdrawals/export.csv`, `POST /withdrawals/export/email`.

#### Admin revenue (`/api/admin/revenue`)

`GET /summary`, owners (+ export/detail), subscribers (+ export/detail), withdrawals users (+ export/detail), `GET|PUT /settings`, `POST /settle`, `GET /settle/{date}`, legacy `GET /withdrawals`.

#### Discovery / catalog / favorites / playlists / analytics

As mounted in `main.py` — implement list/detail/CRUD per module tables above.

### 5.4 Core domain services

| Service | Purpose |
|---------|---------|
| `live_stream.py` | Ingest fan-out, buffers, optional Redis pub/sub |
| `wallet_service.py` | Record listens, withdraw, bank encrypt/decrypt (**no realtime play credit**) |
| `daily_settlement_service.py` | User-centric daily pool allocation + wallet credits |
| `billing_period.py` | Resolve subscription billing period / daily value for a date |
| `owner_revenue_service.py` | Accounts earned totals; attribute track/station INR from settlements |
| `subscription_service.py` | Activate, queue, cancel, apply pending, unlimited guards |
| `razorpay_service.py` | Orders + signature verify |
| `revenue_settings_service.py` | Platform BPS/prices; validate merged PATCH totals = 100% |
| `accounts_export_service.py` | Admin CSV builders |
| `withdrawal_export_service.py` | Owner payout CSV |
| `engagement.py` | Track/comment counts, author display names |
| `radio_engagement.py` | Program engagement counts + comment serialization |
| `radio_programs.py` | Ensure stable program IDs in `programs_list` |
| `acoustic_quality.py` | Spectral analysis + **authenticity / fake-lossless** |
| `lyrics_pipeline.py` | Hybrid lyrics (lrclib → LALAL → Chirp-2 → Gemini → LRC) |
| `cover_images.py` / `licence_documents.py` | Presigned URLs + storage keys |
| `field_encryption.py` | Fernet field encryption |
| `email_service.py` | Optional SMTP for withdrawal CSV |
| `track_management.py` / `audio.py` / `storage.py` | Upload helpers |

### 5.5 Celery tasks (`backend/app/tasks/tasks.py` + `celery_worker.py`)

| Task | Trigger | Purpose |
|------|---------|---------|
| `analyze_audio_task` | After upload | FFprobe, librosa, spectrogram, quality + authenticity, metadata lyrics seed |
| `transcode_audio_task` | After approve | MP3 320, AAC 256/128, HLS per quality → S3 |
| `cleanup_old_hls_gens_task` | After retranscode | Remove superseded HLS prefixes |
| `queue_missing_hls_retranscodes_task` | Sweep | Backfill missing quality HLS |
| `extract_lyrics_task` | Manual API | Hybrid lyrics pipeline → `lyrics` + `lyrics_timed` |
| `settle_daily_revenue_task` | **Beat 00:30 UTC** | Settle previous UTC day (or date arg) |

Worker command: `celery -A celery_worker.celery_app worker`  
Beat command: `celery -A celery_worker.celery_app beat`

### 5.6 Daily settlement rules (critical)

For settlement date `D` (UTC):

1. Skip if `platform_revenue_settings.daily_settlement_enabled` is false (status `skipped`).
2. Load active **premium** listeners whose subscription covers `D` (exclude platform admins; exclude staff not in listener role).
3. For each listener:
   - Resolve billing period → `daily_value_paise = plan_price / cycle_days`
   - `creator_pool = daily_value × owner_share_bps / 10000`
   - Aggregate listen seconds from `billable_track_plays` (that UTC date) + `radio_listen_sessions` (started that UTC day)
   - If total seconds `< min_valid_daily_listen_seconds` → retain on platform (no owner credit)
   - Else `allocate_by_duration(creator_pool, seconds_by_owner)` (floor + remainder to largest)
4. Credit each owner wallet once per day with ledger `entry_type=daily_settlement`, reference `settlement:{date}:owner:{id}`; write `daily_settlement_credits`.
5. Idempotent: completed run for date is not re-applied unless force; unique constraint on (date, owner).

Admin can also `POST /api/admin/revenue/settle`.

**Track listen recording** (`process_track_listen_progress`): premium paying listener, not own track, listened ≥ `min_track_seconds` (or 50% of short tracks), one row per listener/track/UTC day (updates max seconds). Sets `credit_paise=0`.

**Radio recording**: start session → heartbeat every ≥ `min_radio_heartbeat_sec` accumulates `total_seconds` under row lock → end session. No wallet credit on heartbeat.

### 5.7 Data model (tables to implement)

**Identity & catalog:** `users`, `artists`, `albums`, `genres`, `track_genres`, `tracks`, `playlists`, `playlist_tracks`, `favorites`, `listening_history`, `track_comments` (+ `parent_id`), `comment_reactions`, `track_reactions`, `audio_analysis_reports`, `streaming_logs`

**Radio:** `radio_stations`, `radio_schedules`, `radio_program_reactions`, `radio_program_comments`, `radio_program_comment_reactions`

**Billing:** `subscription_payments` (+ billing period columns), `platform_revenue_settings` (+ settlement flags)

**Wallet:** `owner_wallets`, `wallet_ledger_entries`, `owner_bank_accounts`, `withdrawal_requests`, `billable_track_plays`, `radio_listen_sessions`, `daily_settlement_runs`, `daily_settlement_credits`

**Meta:** `schema_migrations`

#### Migration map (001–029)

| ID | Summary |
|----|---------|
| 001 | Track metadata columns |
| 002–003 | Radio station core + profile |
| 004–005 | Artist/station moderation |
| 006–012 | Subscription, payments, stream quality, queue, activated_at, reset password |
| 013 | Artist profile onboarding |
| 014 | Wallet/revenue + billable plays + radio sessions |
| 015–017 | Encrypted bank + withdrawal snapshots |
| 018 | Licence document paths |
| 019–020 | Studio cover + user profile image |
| 021 | Track comments |
| 022 | Daily settlement settings + runs/credits + payment billing periods |
| 023 | Track metadata tags (track_number, album_artist, …) |
| 024 | Quality-specific HLS paths |
| 025 | Timed lyrics + language |
| 026 | Authenticity columns on analysis reports |
| 027 | `track_reactions` |
| 028 | Comment replies (`parent_id`) + `comment_reactions` |
| 029 | Radio program reactions/comments/comment reactions |

Do **not** wipe bank accounts in migrations; encrypt on read/write.

#### Notable fields

**User:** subscription fields, `stream_quality`, `must_reset_password`, `profile_image_path`

**Track:** multi-bitrate paths, per-quality HLS paths, `lyrics` / `lyrics_timed` / language, metadata overrides

**AudioAnalysisReport:** quality metrics + `is_fake_upscaled`, `authenticity_score`, `true_quality_tier`, `spectral_entropy_high_band`

**PlatformRevenueSettings:** prices, `company_share_bps` / `owner_share_bps` (must sum 10000), min thresholds, `daily_settlement_enabled`, `min_valid_daily_listen_seconds` (legacy studio/radio pool BPS unused by settlement)

---

## 6. Frontend architecture

### 6.1 Contexts

**AuthContext:** token in `sessionStorage`; refresh; `currentUser` + `real_role`; mode switch; `fetchCurrentUser`; feature flags (`canUsePlaylists`, `canAccessPlatformSettings`, …). Never invent social identity client-side.

**AudioContext:** single `HTMLAudioElement`; queue refs; radio WebRTC/WS; quality via `streamQuality.ts`; favorites; reactions; equalizer analyser optional; listen-progress + radio session heartbeats.

### 6.2 Utilities to port

| File | Role |
|------|------|
| `authTokens.ts` | Access token + stream tickets |
| `streamQuality.ts` | Candidate URLs per quality (incl. HLS paths) |
| `searchMatch.ts` | Token ranking, album/artist candidates |
| `subscriptionCheckout.ts` | Razorpay checkout glue |
| `wallet.ts` | Wallet + Accounts API + CSV downloads |
| `accountTier.ts` | Labels / trial helpers |
| `dateTime.ts` | Local format + date inputs |
| `pageTitles.ts` | Header titles |
| `navigation.ts` | Post-login tab + `STAFF_LISTENER_TABS` |
| `programSchedule.ts` / `radioPrograms.ts` | Program IDs, schedule formatting |
| `radioMetadataPoll.ts` / `radioDomPatch.ts` | Live metadata / DOM helpers |
| `lrc.ts` | Timed lyrics parsing |
| `trackStatusWs.ts` | Upload/analysis websocket client |
| `audioOutputDevices.ts` / `userSettings.ts` | Device + prefs |
| `compressImage.ts` | Client image compress before upload |
| `banner.ts` / `swal.ts` / `toast.ts` | Feedback |
| `constants.ts` | Shared sizes (Accounts page size) |

### 6.3 Hooks

- `useLazyList` — infinite scroll for Accounts, Engagements, admin tables

### 6.4 Config

- `config/broadcasterDownloads.ts` — installer URLs; override with `VITE_BROADCASTER_DOWNLOAD_BASE`

### 6.5 Design tokens / CSS

- Global dark theme, rose primary, glass borders (`border-white/5`)
- Responsive: desktop header nav; mobile bottom nav + expanded player
- Skeletons for every major list

---

## 7. Desktop broadcaster

- App: `broadcaster/verisonic_broadcaster.py` (PyQt5; Tkinter fallback)
- Auth as **radio admin only** (platform admin rejected)
- Paste/select stream key; capture audio → MP3 frames → `WS /api/radio/stream/ws`
- Connect Live auto-picks input from system default output (loopback matching)
- Package via CI — see [broadcaster/distributing_broadcaster.md](broadcaster/distributing_broadcaster.md)
- Web portal `#broadcaster-download`; nginx serves `/downloads/broadcaster/` from `broadcaster/dist`

---

## 8. Infrastructure & environments

### 8.1 Docker Compose services

| Service | Role |
|---------|------|
| `db` | Postgres 15 |
| `redis` | Broker, refresh JTI, optional live fan-out |
| `minio` | S3 audio/covers |
| `backend` | FastAPI `:8001` (mount `./cert` for Google credentials) |
| `worker` | Celery worker |
| `beat` | Celery beat (daily settlement) |
| `frontend` | Vite `:5173` |
| `nginx` | `:3000` → UI, API, live, storage, broadcaster downloads |

### 8.2 Key environment variables

| Variable | Purpose |
|----------|---------|
| `ENVIRONMENT` | `development` / `production` |
| `SECRET_KEY` | JWT signing (32+ chars in prod) |
| `POSTGRES_*` | Database |
| `REDIS_HOST` / `REDIS_PORT` | Cache, Celery, refresh JTI |
| `S3_*` / AWS keys | MinIO bucket |
| `CORS_ORIGINS` | Allowed web origins |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Premium checkout |
| `SMTP_*` | Optional wallet CSV email |
| `WEBRTC_BUFFER_SEC` | Live buffer |
| `LYRICS_EXTRACTION_ENABLED` | Gate extract-lyrics API |
| `LYRICS_API_URL` | lrclib base (default `https://lrclib.net/api`) |
| `LALAL_API_KEY` | Optional vocal separation |
| `GOOGLE_CLOUD_PROJECT_ID`, `GOOGLE_VERTEX_LOCATION`, `GEMINI_MODEL` | Speech + Gemini |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to service account JSON in container |

Copy template: `cp .env.example .env`

### 8.3 Nginx requirements

- `client_max_body_size 100M`
- WebSocket upgrade for `/api`
- **No buffering** on `/api/radio/{id}/live`
- `/storage/` → MinIO
- `/downloads/broadcaster/` → installer artifacts

### 8.4 Seed / demo

- First boot: `admin@verisonic.com` / `admin12345` → force password reset; unlimited subscription
- Genres seeded: Rock, Electronic, Classical, Jazz, Hip-Hop, Ambient
- Accounts demo: `python scripts/seed_accounts_test_data.py` (optionally `--reset`) inside backend container
- Dangerous wipe script: `reset_earned_and_backfill_subscriptions.py --i-know-what-im-doing` (blocked if production)

---

## 9. Recommended build order (greenfield)

1. **Compose + Postgres + migrations runner + User/auth** (login, JWT, refresh, password reset gate)
2. **MinIO + cover/avatar/licence upload helpers + nginx storage**
3. **Music upload + Celery analyze (incl. authenticity) + approve + transcode (multi HLS) + stream URLs + tickets**
4. **Premium gating + trial/preview in AudioContext**
5. **Home / Search / Favorites / Playlists / MusicDetails / Artist discovery / trending**
6. **Reactions + threaded comments** (tracks)
7. **Radio stations CRUD + LiveStreamManager + broadcaster + listen sessions + program comments/reactions**
8. **Razorpay subscriptions + Settings/Landing checkout + admin Unlimited**
9. **Billable listen recording + Celery Beat daily settlement + owner Wallet UI**
10. **Admin: users, analytics, reports, studios/stations moderation, Engagements**
11. **Accounts admin + backend CSV exports + date filters + opening balance + manual settle**
12. **Optional hybrid lyrics pipeline + cert mount**
13. **Security hardening, seed scripts, CI tests, broadcaster packaging**

At each step, match **section 2 layout** before polishing visuals.

---

## 10. Acceptance checklist (parity)

A rebuild is complete only when all of the following pass:

- [ ] Same hash-tab shell, header search, mobile nav, global player (incl. like/dislike)
- [ ] All four roles work with Admin/Listen mode; `navigation.ts` defaults correct
- [ ] Lossless upload → authenticity analysis → approve → multi-bitrate + per-quality HLS + master tickets
- [ ] Live radio: desktop ingest → browser listen (HTTP and/or WebRTC); no Auto-DJ
- [ ] Premium checkout (with keys) + unlimited admin-only + queue/cancel rules
- [ ] Listens recorded without instant credit; Beat (or admin settle) credits `daily_settlement`
- [ ] Instant withdraw; encrypted bank data; Accounts CSV + opening balance
- [ ] Engagements admin page; track + program comments with reactions
- [ ] Access tokens reject refresh/stream types; admin tabs gated
- [ ] Docker Compose includes **worker + beat**; admin seed works
- [ ] Backend tests pass including settlement tests

---

## 11. File map (reference implementation)

```text
verisonic/
├── BUILD_GUIDE.md              ← this document
├── README.md
├── implementation_plan.md
├── task.md
├── walkthrough.md
├── docker-compose.yml          # includes beat
├── nginx.conf
├── .env.example
├── backend/
│   ├── celery_worker.py        # beat_schedule: daily-revenue-settlement
│   ├── requirements.txt
│   ├── app/
│   │   ├── main.py
│   │   ├── models.py / schemas.py
│   │   ├── api/                # auth, music, radio, reactions, …
│   │   ├── core/               # config, security, premium, plans, …
│   │   ├── db/migrations.py    # 001–029
│   │   ├── services/           # wallet, settlement, engagement, lyrics, …
│   │   └── tasks/tasks.py
│   ├── scripts/
│   └── tests/                  # health, live stream, acoustic, settlement
├── frontend/src/
│   ├── App.tsx
│   ├── context/ Auth, Audio
│   ├── pages/                  # includes StudioTracksEngagement
│   ├── components/
│   ├── hooks/useLazyList.ts
│   ├── config/broadcasterDownloads.ts
│   └── utils/                  # includes navigation.ts, lrc.ts, …
└── broadcaster/                # PyQt5 + installers + distributing doc
```

---

## 12. Out of scope / do not copy blindly

- Mock Google login that invents emails — **disabled**; wire real OAuth if needed
- Admin withdrawal **approval** queue — **removed**; withdrawals are instant
- Realtime per-play wallet credit — **replaced** by daily settlement
- Wiping `owner_bank_accounts` in migrations — **forbidden**
- Running earnings-reset scripts without confirm / against production
- Unlimited listeners contributing to settlement — **they do not**

Use this guide for the intended product blueprint. Use `implementation_plan.md` for current completeness notes, and the codebase/`/docs` for exact request/response shapes.
