# VeriSonic

VeriSonic is a high-fidelity audio platform for **lossless music streaming**, **live radio broadcasting**, **studio-grade catalog management**, **listener engagement** (likes, threaded comments), and **owner revenue sharing via daily settlement**. It combines a React web portal, a FastAPI backend with Celery worker + beat, Razorpay subscription checkout, owner wallets, and a PyQt5 desktop broadcaster for real-time station ingest.

---

## Features

### Listeners
- **Home Feed** — recently played, trending tracks, popular artists (click artist → search)
- **Radio Stations** — browse live and external stations; tiles with cover art, frequency, location
- **Search** — header dropdown preview + full search page (tracks, albums, radio, artists, playlists); detail views and Play All
- **Favorites & Playlists** — sync favorites to the API; create playlists with drag-reorder
- **Engagement** — like/dislike tracks and radio programs; threaded comments with reactions
- **Global audio player** — queue, lyrics (plain + timed), shuffle/repeat, playback speed, quality tiers, MediaSession
- **Mobile-first UI** — bottom navigation, expanded full-screen player, banner notifications

### Studio admins
- Studio profile onboarding (`profile_complete` gate before track management)
- **Studio cover image** and licence document upload
- Upload lossless audio (FLAC/WAV/AIFF/ALAC) with automatic metadata extraction
- Celery pipeline: spectral analysis, **authenticity / fake-lossless detection**, quality scoring, spectrogram, FFmpeg transcoding (MP3/AAC + **per-quality HLS**)
- Track management, approval workflow, optional **hybrid AI lyrics** extraction (lrclib / LALAL / Chirp-2 / Gemini)
- Reactivation appeals when profile is disabled
- **My Wallet** — earnings from **daily settlement**, instant withdrawals

### Radio admins
- Register and manage radio station nodes (profile, location, frequency, programs)
- **Station cover image** and licence document upload (shown in radio listings & search)
- **Live broadcast** via desktop broadcaster (WebSocket MP3 ingest → HTTP/WebRTC listeners)
- Stream key generation/regeneration (time-limited OTP-style keys)
- Program schedule editor with timezone-aware active program detection
- Program engagement counts (likes / comments) in dashboard
- **My Wallet** — daily settlement earnings, withdrawals
- Admin/listener mode toggle

### Platform admins
- User management (roles, subscriptions)
- **Studios Management** and **Radio Stations Management** — moderation, licence doc review
- **Engagements** — drill into studio tracks and radio programs (likes, dislikes, comments)
- Analytics dashboard (plays, bandwidth, quality distribution)
- Acoustic quality reports with authenticity fields + admin approve/reject
- **Accounts** — overview, owners, withdrawals (view/export + date filters), subscriptions, revenue settings, optional **manual daily settle**
- Owner withdrawals are **instant self-service** (Accounts is view-only for payouts)
- Mandatory password reset gate for seeded admin account

### Subscriptions
- **Free** — 7-day full-access trial, then 30s track preview / 60s radio preview / AAC 128 only
- **Premium** — full playback, higher quality streams (MP3 320, AAC 256, lossless master)
  - Self-service via Razorpay: Premium Monthly (₹99) or Premium Yearly (₹999)
  - Plan changes can be queued for end of billing period; cancel-at-period-end supported
  - Premium listens feed **daily revenue settlement** to content owners
- **Unlimited** — admin-assigned only (full playback; **does not** contribute to settlement pool)
- Checkout UI: Landing page pricing, Settings, and in-player Premium modal

### Account & profiles
- **My Profile** — display name, email, password; hover initials circle → upload display picture
- Initials avatar derived from display name when no photo is set

---

## Architecture

```mermaid
graph TD
    subgraph Clients
        Browser[React Web Portal]
        Broadcaster[PyQt5 Broadcaster]
        Razorpay[Razorpay Checkout]
    end

    subgraph Docker Compose Stack
        Nginx[Nginx :80]
        Frontend[Vite/React :5173]
        Backend[FastAPI :8001]
        Worker[Celery Worker]
        Beat[Celery Beat]
        Redis[(Redis)]
        Postgres[(PostgreSQL)]
        MinIO[(MinIO S3)]
    end

    Browser --> Nginx
    Broadcaster -->|WebSocket MP3| Backend
    Browser --> Razorpay
    Razorpay -->|Payment verify| Backend
    Nginx --> Frontend
    Nginx --> Backend
    Backend --> Redis
    Backend --> Postgres
    Backend --> MinIO
    Worker --> Redis
    Worker --> Postgres
    Worker --> MinIO
    Beat --> Redis
    Beat -->|settle_daily_revenue_task| Worker
```

**Live radio path:** Broadcaster → `WS /api/radio/stream/ws` → `LiveStreamManager` → listeners via `GET /api/radio/{id}/live` or WebRTC.

**Music path:** Upload → Celery analyze (quality + authenticity) → approve → transcode → S3 → HLS/MP3/AAC playback. Lossless master streams use short-lived tickets.

**Revenue path:** Premium listens recorded → Celery Beat daily settlement → owner wallet (`daily_settlement`) → **instant withdrawal** → Accounts admin view/export.

**Subscription path:** Client → Razorpay Checkout → `POST /api/subscriptions/verify` → plan activated.

---

## Repository layout

```text
verisonic/
├── BUILD_GUIDE.md           # Full rebuild blueprint (layout + every feature)
├── backend/                 # FastAPI API, WebSockets, Celery tasks, services
│   ├── app/
│   │   ├── api/             # auth, music, radio, reactions, playlist, favorites,
│   │   │                    # analytics, subscriptions, wallet, revenue_admin,
│   │   │                    # discovery, catalog
│   │   ├── core/            # config, premium, plans, security, upload validation
│   │   ├── db/              # migrations 001–029
│   │   ├── services/        # storage, live_stream, wallet, settlement, engagement,
│   │   │                    # lyrics, razorpay, accounts CSV export, …
│   │   └── tasks/           # analyze, transcode, lyrics, daily settlement
│   ├── celery_worker.py     # worker + beat schedule
│   └── scripts/             # seed_accounts_test_data, reset helpers
├── frontend/                # Vite + React + TypeScript + Tailwind
│   └── src/
│       ├── pages/           # Home, Radio, Search, Wallet, Accounts, Engagements, …
│       ├── components/      # player, layout, wallet, subscription, engagement UI
│       ├── context/         # AuthContext, AudioContext
│       └── utils/           # searchMatch, navigation, subscriptionCheckout, …
├── broadcaster/             # PyQt5 desktop live broadcaster + installers
├── .github/workflows/       # backend-tests.yml, build-broadcaster.yml
├── docker-compose.yml       # db, redis, minio, backend, worker, beat, frontend, nginx
├── nginx.conf
├── implementation_plan.md   # Living spec & implementation status
└── task.md                  # Feature checklist
```

---

## Getting started

### Prerequisites
- [Docker & Docker Compose](https://www.docker.com/)
- Python 3.10+ (local broadcaster or backend dev)
- Node.js 18+ (frontend dev outside Docker)

### 1. Start the stack

```bash
docker compose up --build
```

| Service | URL |
|---------|-----|
| Web portal | http://localhost:3000 |
| API docs (development) | http://localhost:8001/docs |
| MinIO console | http://localhost:9001 (`minioadmin` / `minioadmin`) |

Nginx listens on port 3000 and proxies `/api` to FastAPI (8001). Confirm containers include **`verisonic_worker`** and **`verisonic_beat`** (daily settlement at 00:30 UTC).

### 2. Default admin account

On first startup the backend seeds this local-development account:

- **Email:** `admin@verisonic.com`
- **Password:** `admin12345`

You will be prompted to set a new password before admin features are unlocked. Do not use these credentials in a deployed environment.

Use this account to promote users to studio/radio admin roles and assign subscription tiers.

### 3. Desktop broadcaster (local dev)

```bash
python -m pip install -r broadcaster/requirements.txt
python broadcaster/verisonic_broadcaster.py
```

Only **radio admin** accounts can broadcast. Copy the stream key from the Radio Stations dashboard (Connection Settings).

Packaging and CI builds: see [broadcaster/distributing_broadcaster.md](broadcaster/distributing_broadcaster.md).

### 4. Subscriptions (optional)

To enable Razorpay checkout, set in `.env` / environment:

```yaml
RAZORPAY_KEY_ID: your_key_id
RAZORPAY_KEY_SECRET: your_key_secret
```

Without keys, plan listing works but checkout returns a configuration error.

### 5. Hybrid lyrics (optional)

Set `LYRICS_EXTRACTION_ENABLED=true` and configure `LALAL_API_KEY` / Google Cloud vars (see `.env.example`). Mount a service-account JSON under `./cert` and set `GOOGLE_APPLICATION_CREDENTIALS`.

### 6. Accounts demo data (optional)

```bash
docker exec -w /app verisonic_backend env PYTHONPATH=/app \
  python scripts/seed_accounts_test_data.py
```

Use `--reset` to wipe prior demo users first. Demo emails use `@accounts-demo.verisonic.local` (password `demo12345`).

---

## Development

### Backend tests

```bash
cd backend && pytest tests/ -v
```

CI runs on push/PR when `backend/**` changes (`.github/workflows/backend-tests.yml`).

### Frontend dev (outside Docker)

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` to the backend.

### Environment variables

```bash
cp .env.example .env
```

Key settings (see `.env.example`, `docker-compose.yml`, `backend/app/core/config.py`):

- `POSTGRES_*`, `REDIS_HOST`, `S3_ENDPOINT_URL`
- `SECRET_KEY` — required in production (32+ characters)
- `ENVIRONMENT` — set to `production` in deployed environments (forces Redis for refresh tokens)
- `CORS_ORIGINS` — comma-separated allowed web origins
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` — Premium checkout (INR)
- `LYRICS_*`, `LALAL_API_KEY`, `GOOGLE_*` — optional lyrics pipeline
- SMTP settings — optional withdrawal CSV email export

**Production checklist:** set `ENVIRONMENT=production`, a strong `SECRET_KEY`, strong database/MinIO credentials, Razorpay live keys, restrict service ports, and keep Celery **beat** running for settlement.

---

## User roles

| Role | Capabilities |
|------|----------------|
| `listener` | Browse, play, favorites, playlists, reactions, comments, search, subscribe |
| `studio_admin` | Upload/manage tracks, studio profile, cover & licence, lyrics extract, wallet |
| `radio_admin` | Own station(s), live broadcast, schedule, program engagement, wallet |
| `admin` | Users, Accounts, Engagements, studios/stations moderation, analytics, reports, revenue settings |

Staff roles support **Admin mode** vs **Listen mode** (toggle in header). Playlists and header search are disabled in admin mode.

---

## Profiles & cover images

| What | Where to update |
|------|-----------------|
| Display picture | **My Profile** — hover the initials circle → camera icon → upload |
| Studio cover | **Studio Profile** → Core Info → Studio Cover (save profile first) |
| Radio station cover | **Station Profile** → edit station → Station Cover |

Radio station covers appear in browse and search listings automatically.

---

## Documentation

| Document | Purpose |
|----------|---------|
| **[BUILD_GUIDE.md](BUILD_GUIDE.md)** | **Complete rebuild blueprint** — layout, every role/feature, APIs, settlement rules, data model 001–029, build order, acceptance |
| [implementation_plan.md](implementation_plan.md) | Technical spec, API summary, migrations, status, gaps |
| [task.md](task.md) | Completed feature checklist and open items |
| [walkthrough.md](walkthrough.md) | Live broadcaster setup walkthrough |
| [broadcaster/distributing_broadcaster.md](broadcaster/distributing_broadcaster.md) | Build & distribute desktop broadcaster |

---

## License

Proprietary — VeriSonic project.
