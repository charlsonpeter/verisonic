# VeriSonic — Complete Application Build Guide

This document is a **full blueprint** to rebuild an application with the **same layout, roles, features, and behavior** as VeriSonic. Use it as a product + engineering spec: if a capability is listed here, the reference app implements it (or notes an intentional exception).

**Companion docs:** [README.md](README.md) (quick start), [implementation_plan.md](implementation_plan.md) (status & gaps), [task.md](task.md) (checklist), [walkthrough.md](walkthrough.md) (broadcaster), [broadcaster/distributing_broadcaster.md](broadcaster/distributing_broadcaster.md).

**Aligned with codebase:** July 2026.

---

## 0. What you are building

A **high-fidelity audio platform** with four product surfaces in one stack:

| Surface | Who | What |
|---------|-----|------|
| Consumer web portal | Listeners (+ staff in Listen mode) | Browse, search, play music & live radio, favorites, playlists, subscribe |
| Studio admin portal | Studio admins | Profile/onboarding, lossless uploads, quality pipeline, track library, wallet |
| Radio admin portal | Radio admins | Station profile, live broadcast (desktop app), schedule, wallet |
| Platform admin portal | Super admins | Users, studios/stations moderation, analytics, quality reports, **Accounts** (owners / withdrawals / subscriptions / revenue settings) |

**Monetization model (must match):**

1. Listeners pay the **company** via Razorpay (Premium Monthly / Yearly).
2. Company + owner **revenue split** credits **owner wallets** from billable track plays and radio listen sessions.
3. Owners **withdraw instantly** to their bank (self-service; status `paid` immediately). Accounts admin is **view/export only** for withdrawals — no approval queue.

**Not included (intentional):** Auto-DJ when a broadcaster is offline; real Google OAuth (email/password only until OAuth is configured).

---

## 1. Technology stack (reproduce exactly)

| Layer | Choice |
|-------|--------|
| Web UI | React 18 + TypeScript + Vite + Tailwind CSS |
| Routing | **Hash tabs** in `App.tsx` (`#home`, `#radio`, …) — **no React Router** |
| Global state | `AuthContext`, `AudioContext` |
| API | FastAPI + Uvicorn + SQLAlchemy + PostgreSQL |
| Schema changes | Custom SQL migrations in `backend/app/db/migrations.py` + `schema_migrations` table |
| Jobs | Celery + Redis (analyze + transcode) |
| Object storage | MinIO (S3-compatible) + presigned URLs |
| Auth | JWT access (short) + refresh cookie/token (Redis JTI when Redis required) |
| Payments | Razorpay Orders API (INR) |
| Live radio | PyQt5 desktop broadcaster → WebSocket MP3 ingest → HTTP / WebSocket / WebRTC listeners |
| Edge | Nginx reverse proxy (port 3000 → frontend + `/api`) |
| Local run | Docker Compose (db, redis, minio, backend, worker, frontend, nginx) |

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

**Hide chrome** on: `#landing`, `#auth`, admin password-reset gate.

**Visual language:** dark slate background (`slate-950`), rose accents, glass cards (`glass-card`), premium gradient text where branded. Prefer expressive type via Tailwind theme — not a generic Inter-only dashboard look for marketing surfaces.

### 2.2 Hash routes → pages

Implement every tab below (same IDs):

| Hash tab | Page component | Audience |
|----------|----------------|----------|
| `landing` | `LandingPage` | Logged-out marketing + pricing |
| `auth` | `AuthPage` | Login / register (email+password; Google disabled until real OAuth) |
| `admin-password-reset` | `ForceAdminPasswordReset` | Seeded admin must change password |
| `home` | `Home` | Recently played, trending, popular artists/studios |
| `radio` | `Radio` | Listener tiles **or** radio-admin dashboard |
| `search` | `Search` | Full search + album/artist/playlist detail |
| `artist` | `Artist` | Discovery artist page |
| `favorites` | `Favorites` | API favorites |
| `playlists` | `Playlist` | CRUD + drag reorder |
| `details` | `MusicDetails` | Track detail, lyrics, comments, share |
| `profile` | `UserProfile` | Name, email, password, avatar upload |
| `wallet` | `Wallet` | Owner balance, ledger, withdraw, CSV export |
| `settings` | `Settings` | Quality, subscription UI, output device; admin revenue panel |
| `contact` | `Contact` | Support + studio/radio upgrade requests |
| `broadcaster-download` | `BroadcasterDownload` | Desktop app download |
| `studio-profile` | `StudioProfile` **or** `StudiosManagement` (admin) | Onboarding / moderation |
| `station-profile` | `StationProfile` **or** `RadioStationsManagement` (admin) | Station / moderation |
| `tracks` | `TracksManagement` | Upload + quality + approve |
| `track-list` | `StudioTrackList` | Studio library |
| `users` | `UsersManagement` | **Admin only** — roles & subscriptions |
| `accounts` | `AccountsManagement` | **Admin only** — finance overview |
| `analytics` | `AdminAnalytics` | **Admin only** |
| `reports` | Inline acoustic report UI in `App.tsx` | **Admin only** |

**Route guards (required):**

- Admin-only tabs: `accounts`, `users`, `analytics`, `reports` (redirect non-admin to `home`).
- Studio admin in **Listen mode**: block `tracks`, `studio-profile`, `track-list`.
- Radio admin without station (Admin mode): force onboarding toward station profile / contact / wallet / settings.
- `history` tab → redirect to `home` (history lives on Home).
- Header search + playlists disabled in staff **Admin mode**.

### 2.3 Header & navigation

**Header (`Header.tsx`):**

- Page title from `pageTitles.ts` (or override for track/artist).
- Role-aware nav icons (listener vs studio vs radio vs admin).
- Compact **HeaderSearch** (not on `#search`, not in admin mode): debounced preview → click opens track play / radio / artist page / **Search album detail** / **Search playlist detail**.
- Tier badge (Premium / trial).
- Avatar dropdown: profile, settings, wallet (owners), mode switch (staff), logout.
- Mode switch: Admin ↔ Listen (`X-User-Mode: listener` on API calls).

**MobileNav:** primary destinations for small screens; expanded player overlays content.

### 2.4 Global audio player (`AudioContext` + `AudioPlayer`)

Must support:

- Track + live radio playback
- Queue, shuffle, repeat **none / one / all** (repeat-all wraps at end)
- Playback speed, mute, volume, seek
- Quality tiers: normal / high / hires / lossless (premium-gated)
- Ticketed **master** streams; on ticket failure fall through to lossy candidates
- Favorites sync
- `playQueueTracks(tracks)` for Play All (set queue once, play first — no double-start)
- MediaSession (lock screen / notification controls)
- Radio listen-session start / heartbeat / end for billable radio
- Track `listen-progress` + `/music/{id}/play` using **current** access token (ref, not stale closure)
- Premium modal when free preview ends
- Staff radio admins cannot play library tracks in admin mode

### 2.5 Shared UI building blocks

Rebuild these patterns (paths under `frontend/src/components/`):

| Area | Components |
|------|------------|
| Layout | `Header`, `HeaderSearch`, `MobileNav`, `OptionalPanel`, `Sidebar` (legacy unused) |
| Player | `AudioPlayer`, `Equalizer` |
| Subscription | `SubscriptionPlans`, `SubscriptionDates`, `SubscriptionQueueNotice`, `PremiumModal` |
| Wallet | `WithdrawModal`, `WithdrawalsExportModal`, `EarningsChart` |
| Shared | `UserAvatar`, `TrackRow` / `TrackSearchRow`, `RadioCard` / `RadioSearchRow`, `DatePicker`, `TimePicker`, `ListSearchInput`, `LazyListSentinel`, `AppModal`, `BannerHost`, `LyricsModal`, `CoverImageUpload`, `ProfileAvatarUpload`, `LicenceDocumentUpload`, `AddToPlaylistButton`, `AcousticScoreBreakdown` |
| Skeletons | Full set under `shared/skeleton/` for lists, radio, wallet, playlists, etc. |

**List UX pattern (Accounts & admin lists):** `useLazyList` + `LazyListSentinel` + `ListSearchInput` + backend CSV downloads.

---

## 3. Roles & entitlements

| Role | Capabilities |
|------|----------------|
| `listener` | Browse/play (gated by subscription), favorites, playlists, contact/upgrade requests, subscribe |
| `studio_admin` | Studio profile (`profile_complete` gate), uploads, track manage, wallet, cover/licence |
| `radio_admin` | Station(s), broadcast key, live ingest, schedule, wallet, cover/licence |
| `admin` | Users, Accounts, analytics, reports, studios/stations moderation, revenue settings |

**Subscription tiers:**

| Tier | How obtained | Playback |
|------|--------------|----------|
| `free` | Default | 7-day full trial from signup, then 30s track / 60s radio preview, AAC 128 only |
| `premium` | Razorpay Monthly/Yearly | Full catalog + quality tiers; plan queue / cancel-at-period-end |
| `unlimited` | **Admin assign only** | Full access; **cannot** self-checkout; payment failure must **not** downgrade |

Staff roles (`admin`, `studio_admin`, `radio_admin`) always have premium-level playback access.

---

## 4. Feature catalog (do not omit)

### 4.1 Listener

- [ ] Landing + Auth (register/login/refresh)
- [ ] Home: recently played (paginated), trending, popular artists → Search/Artist, studio covers from discovery
- [ ] Radio browse (covers, frequency, location); play live or external URL
- [ ] Search: header preview + full page filters (all/tracks/albums/radio/artists/playlists); album/playlist detail; Play All
- [ ] Artist page (discovery API): tracks, albums, related, Play All
- [ ] Track details: lyrics, comments, share, add to playlist
- [ ] Favorites + Playlists (reorder)
- [ ] Settings: stream quality, subscription checkout/manage, audio output device
- [ ] Contact: studio upgrade → artist request; radio upgrade → **radio-admin request** (inactive station draft); general support honest “not online yet” if no mailbox API

### 4.2 Studio admin

- [ ] Studio profile onboarding + cover + licence document
- [ ] Upload lossless (FLAC/WAV/AIFF/ALAC) → Celery analyze → score/spectrogram → approve → transcode
- [ ] Tracks management + studio track list; optional Whisper lyrics
- [ ] Reactivation appeal if disabled
- [ ] Wallet: summary, ledger, bank account (encrypted), **instant withdraw**, CSV/email export

### 4.3 Radio admin

- [ ] Create/edit station profile + cover + licence
- [ ] Stream key get/regenerate; Connection Settings
- [ ] Desktop broadcaster (PyQt5) WebSocket ingest
- [ ] Listener delivery: HTTP live, WS listener, WebRTC
- [ ] Program schedule + timezone-aware “now playing” metadata
- [ ] Wallet same as studio

### 4.4 Platform admin

- [ ] Users: roles, subscriptions (including Unlimited), activate/deactivate
- [ ] Studios / Radio Stations management: moderation, licence review, covers
- [ ] Analytics dashboard
- [ ] Acoustic quality reports + approve/reject
- [ ] **Accounts** (`AccountsManagement`) tabs in this order:
  1. **Overview** — summary cards
  2. **Owners** — list + detail (tracks/stations revenue), search, CSV
  3. **Withdrawals** — owners with withdrawal activity; detail with From/To date filter, search, CSV (**opening balance** when From set = wallet ledger sum before From; past withdrawals listed)
  4. **Subscriptions** — subscribers list (status filters), detail payments with date filter + search + CSV (transaction number)
  5. **Settings** — revenue settings panel (prices, company/owner share BPS, studio/radio pool BPS, min listen/withdraw)
- [ ] All finance CSVs **generated on backend** (`accounts_export_service.py` / wallet export)
- [ ] Seed helper: `backend/scripts/seed_accounts_test_data.py` for demo Accounts data

### 4.5 Security (ship these)

- [ ] Access JWT must **reject** `type: refresh` and `type: stream`
- [ ] Production: `ENVIRONMENT=production` → require strong `SECRET_KEY`, `REQUIRE_REDIS=true`
- [ ] Rate-limit login/register
- [ ] Password policy; admin `must_reset_password` gate
- [ ] Bank fields encrypted at rest; withdrawal snapshots encrypted
- [ ] Wallet withdraw + radio heartbeat use **row locks** (`SELECT … FOR UPDATE`)
- [ ] Destructive scripts require explicit confirm flags (e.g. `--i-know-what-im-doing`)

---

## 5. Backend architecture

### 5.1 Process topology

```text
Browser / Broadcaster
        │
     Nginx :3000
    ┌───┴────┐
 Frontend  Backend :8001 ──► Postgres
              │         ──► Redis (Celery + refresh JTI)
              │         ──► MinIO
         Celery worker
```

### 5.2 API modules (mount under `/api`)

| Prefix | Module file | Responsibility |
|--------|-------------|----------------|
| `/auth` | `auth.py` | Register, login, refresh, me, profile, avatar, studio profile, licence/cover, request-artist, request-radio-admin, admin users/studios, mode, reactivation, subscription override |
| `/music` | `music.py` | Upload, CRUD, search/manage, approve, play, listen-progress, comments, stream ticket + master, listening-history |
| `/radio` | `radio.py` | Stations CRUD, covers/licence, live WS/HTTP/WebRTC, keys, schedule, listen sessions |
| `/playlist` | `playlists.py` | CRUD + reorder (**serialize tracks with `viewer=`**) |
| `/favorites` | `favorites.py` | List/add/remove |
| `/analytics` | `analytics.py` | Admin dashboard |
| `/subscriptions` | `subscriptions.py` | Plans, order, verify, fail, schedule/cancel/reactivate |
| `/wallet` | `wallet.py` | Summary, ledger, bank, withdraw (instant paid), exports |
| `/admin/revenue` | `revenue_admin.py` | Settings, owners, subscribers, withdrawals list/detail/**export.csv** (static paths **before** `{user_id}`) |
| `/discovery` | `discovery.py` | Studios browse, artist by name |
| `/albums`, `/genres` | `catalog.py` | Album/genre CRUD |

OpenAPI: `/docs` in development only.

### 5.3 Core domain services

| Service | Purpose |
|---------|---------|
| `live_stream.py` | Ingest fan-out, buffers, optional Redis pub/sub |
| `wallet_service.py` | Credit, billable plays, radio heartbeats, withdraw, bank encrypt/decrypt |
| `subscription_service.py` | Activate, queue, cancel, apply pending, unlimited guards |
| `razorpay_service.py` | Orders + signature verify |
| `revenue_settings_service.py` | Platform BPS/prices; validate **merged** PATCH totals = 100% |
| `accounts_export_service.py` | Admin CSV builders (owners, subscribers, withdrawals + opening balance) |
| `withdrawal_export_service.py` | Owner payout CSV |
| `cover_images.py` / licence upload helpers | Presigned URLs + storage keys |
| `field_encryption.py` | Fernet field encryption |
| Celery `analyze_audio_task` / `transcode_audio_task` | Quality + derivatives |

### 5.4 Data model (tables to implement)

**Identity & catalog:** `users`, `artists`, `albums`, `genres`, `track_genres`, `tracks`, `playlists`, `playlist_tracks`, `favorites`, `listening_history`, `track_comments`, `audio_analysis_reports`, `streaming_logs`

**Radio:** `radio_stations`, `radio_schedules`

**Billing:** `subscription_payments`, `platform_revenue_settings`

**Wallet:** `owner_wallets`, `wallet_ledger_entries`, `owner_bank_accounts`, `withdrawal_requests`, `billable_track_plays`, `radio_listen_sessions`

**Meta:** `schema_migrations`

Migrations: numbered SQL in `migrations.py` (001+). Do **not** wipe bank accounts in migrations; encrypt on read/write.

### 5.5 Critical business rules

**Premium gating** (`premium.py`): trial window; preview limits; staff bypass.

**Track credit:** premium listener, not own track, listened ≥ `min_track_seconds` (or 50% of short tracks), one billable play per listener/track/UTC day → credit owner share to wallet + ledger.

**Radio credit:** start session → heartbeat every ≥ `min_radio_heartbeat_sec` → credit; end session. Lock session row on heartbeat.

**Withdraw:** min amount from settings; lock wallet; deduct; create `withdrawal_requests` with `status=paid` + bank snapshot; ledger negative entry. **No admin approve step.**

**Subscriptions:** unpaid scheduled plan at period end **applies** (downgrade); cancel-at-period-end → free; unlimited blocked from checkout and from failure-to-free.

**CSV opening balance (withdrawal detail):** only when **From** date set → `sum(ledger.amount_paise where created_at < From midnight)` (= earnings before − past withdrawals, including adjustments).

---

## 6. Frontend architecture

### 6.1 Contexts

**AuthContext:** token in `sessionStorage`; refresh; `currentUser` + `real_role`; mode switch; `fetchCurrentUser`; feature flags (`canUsePlaylists`, `canAccessPlatformSettings`, …). Never invent social identity client-side.

**AudioContext:** single `HTMLAudioElement`; queue refs; radio WebRTC/WS; quality via `streamQuality.ts`; favorites; equalizer analyser optional.

### 6.2 Utilities to port

| File | Role |
|------|------|
| `authTokens.ts` | Access token + stream tickets |
| `streamQuality.ts` | Candidate URLs per quality |
| `searchMatch.ts` | Token ranking, album/artist candidates |
| `subscriptionCheckout.ts` | Razorpay checkout glue |
| `wallet.ts` | Wallet + Accounts API + CSV downloads |
| `accountTier.ts` | Labels / trial helpers |
| `dateTime.ts` | Local format + date inputs |
| `pageTitles.ts` | Header titles |
| `swal.ts` / banners | User feedback |
| `constants.ts` | Shared sizes (e.g. Accounts page size) |

### 6.3 Hooks

- `useLazyList` — infinite scroll lists for Accounts and similar admin tables

### 6.4 Design tokens / CSS

- Global dark theme, rose primary, glass borders (`border-white/5`)
- Responsive: desktop header nav; mobile bottom nav + expanded player
- Skeletons for every major list to avoid layout jump

---

## 7. Desktop broadcaster

- App: `broadcaster/verisonic_broadcaster.py` (PyQt5)
- Auth as radio admin; paste stream key; capture/system audio → MP3 frames → `WS /api/radio/stream/ws`
- Package via CI (macOS/Linux/Windows) — see distributing doc
- Web portal page `#broadcaster-download` explains install

---

## 8. Infrastructure & environments

### 8.1 Docker Compose services

`db` (Postgres 15), `redis`, `minio`, `backend`, `worker`, `frontend`, `nginx`

### 8.2 Key environment variables

| Variable | Purpose |
|----------|---------|
| `ENVIRONMENT` | `development` / `production` |
| `SECRET_KEY` | JWT signing (32+ chars in prod) |
| `POSTGRES_*` | Database |
| `REDIS_HOST` / `REDIS_PORT` | Cache, Celery, refresh JTI |
| `S3_*` / AWS keys | MinIO bucket |
| `CORS_ORIGINS` | Allowed web origins |
| `RAZORPAY_KEY_ID` / `SECRET` | Premium checkout |
| SMTP_* | Optional wallet CSV email |
| `WEBRTC_BUFFER_SEC` | Live buffer |

### 8.3 Seed / demo

- First boot: `admin@verisonic.com` / `admin12345` → force password reset
- Accounts demo: `python scripts/seed_accounts_test_data.py` (optionally `--reset`) inside backend container
- Dangerous wipe script: `reset_earned_and_backfill_subscriptions.py --i-know-what-im-doing` (blocked if `VERISONIC_ENV=production`)

---

## 9. Recommended build order (greenfield)

Follow this sequence so dependencies stay valid:

1. **Compose + Postgres + migrations runner + User/auth** (login, JWT, refresh, password reset gate)
2. **MinIO + cover/avatar upload helpers**
3. **Music upload + Celery analyze/transcode + stream URLs + tickets**
4. **Premium gating + trial/preview in AudioContext**
5. **Home / Search / Favorites / Playlists / MusicDetails / Artist discovery**
6. **Radio stations CRUD + LiveStreamManager + broadcaster + listen sessions**
7. **Razorpay subscriptions + Settings/Landing checkout + admin Unlimited**
8. **Wallet credit paths + instant withdraw + owner Wallet UI**
9. **Admin: users, analytics, reports, studios/stations moderation**
10. **Accounts admin + backend CSV exports + date filters + opening balance**
11. **Revenue settings validation, security hardening, seed scripts, CI tests**
12. **Broadcaster packaging + nginx production config**

At each step, match **section 2 layout** before polishing visuals.

---

## 10. Acceptance checklist (parity)

A rebuild is complete only when all of the following pass:

- [ ] Same hash-tab shell, header search, mobile nav, global player behaviors
- [ ] All four roles work with Admin/Listen mode where applicable
- [ ] Lossless upload → analysis → approve → multi-bitrate play + master tickets
- [ ] Live radio: desktop ingest → browser listen (HTTP and/or WebRTC)
- [ ] Premium checkout (with keys) + unlimited admin-only + queue/cancel rules
- [ ] Wallet credits from track + radio; instant withdraw; encrypted bank data
- [ ] Accounts: Owners → Withdrawals → Subscriptions → Settings; CSV on backend; withdrawal opening balance with From date
- [ ] Access tokens reject refresh/stream types; admin tabs gated in UI
- [ ] Docker Compose bring-up documented; admin seed works

---

## 11. File map (reference implementation)

```text
verisonic/
├── BUILD_GUIDE.md              ← this document
├── README.md
├── implementation_plan.md
├── task.md
├── docker-compose.yml
├── nginx.conf
├── backend/app/
│   ├── main.py                 # app factory, routers, seed admin
│   ├── api/                    # HTTP modules (see §5.2)
│   ├── core/                   # config, security, premium, plans, upload validation
│   ├── db/migrations.py
│   ├── models.py
│   ├── schemas.py
│   ├── services/               # wallet, live_stream, exports, …
│   └── tasks/                  # Celery
├── frontend/src/
│   ├── App.tsx                 # shell + hash routes + guards
│   ├── context/                # Auth, Audio
│   ├── pages/                  # one page per major tab
│   ├── components/             # layout, player, wallet, subscription, shared
│   ├── hooks/useLazyList.ts
│   └── utils/
└── broadcaster/                # PyQt5 live encoder client
```

---

## 12. Out of scope / do not copy blindly

- Mock Google login that invents emails — **disabled**; wire real OAuth if needed
- Admin withdrawal **approval** queue — **removed**; withdrawals are instant
- Wiping `owner_bank_accounts` in migrations — **forbidden**
- Running earnings-reset scripts without confirm / against production

Use this guide as the single source for **product completeness**. Use the codebase as the source for **exact request/response shapes** (`/docs` in development).
