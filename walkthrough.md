# Walkthrough — VeriSonic Live Broadcaster

This walkthrough covers the live broadcasting system: stream audio from your computer (microphone or system sound) to your station on the web portal.

For full platform status, API details, search, wallet/revenue, profiles, and known gaps, see [implementation_plan.md](implementation_plan.md).

---

## What is implemented

### Backend
- **`RadioStation.stream_key`** — unique broadcaster credentials (rotatable, time-limited)
- **`LiveStreamManager`** — `backend/app/services/live_stream.py`; in-memory listener queues, optional Redis fan-out
- **Ingest:** `WS /api/radio/stream/ws` (MP3 binary chunks from desktop app)
- **Playback:** `GET /api/radio/{id}/live` (HTTP chunked `audio/mpeg`), WebSocket listener, WebRTC relay
- **Keys:** `GET /api/radio/{id}/broadcast-key`, `POST /api/radio/{id}/verify-broadcast-key`, `POST /api/radio/{id}/regenerate-key`
- **Schema migrations:** tracked runner in `backend/app/db/migrations.py` (not ad-hoc ALTER on startup)

### Frontend
- **Radio admin dashboard** (`frontend/src/pages/Radio.tsx`) — station registration, live/standby indicator, connection settings (stream key copy/regenerate)
- **Route guards** — radio admin without a station is redirected to `#radio` until a node is provisioned
- **Web player** — `AudioContext` routes live stations to `/api/radio/{id}/live` when broadcaster is connected

### Desktop broadcaster
- **`broadcaster/verisonic_broadcaster.py`** — PyQt5 GUI (Tkinter fallback)
- Audio device selection, VU meter, WebSocket MP3 streaming, JWT or stream-key auth
- **Radio admin only** — platform admin accounts are rejected at login
- CI builds: `.github/workflows/build-broadcaster.yml` (macOS, Linux, Windows)

### Infrastructure
- **Docker Compose** bridge network — `backend:8001`, `frontend:5173`, nginx on `:3000`
- **nginx.conf** — live stream location with buffering disabled for real-time MP3

**Note:** There is no Auto-DJ. When the broadcaster disconnects, the station returns to standby unless an external `stream_url` is configured.

---

## How to run

### Option A — Docker (recommended)

```bash
docker compose up --build
```

Open http://localhost:3000

### Option B — Local dev

```bash
# Terminal 1 — backend
cd backend && uvicorn app.main:app --reload --port 8001

# Terminal 2 — frontend
cd frontend && npm install && npm run dev

# Terminal 3 — broadcaster
python -m pip install -r broadcaster/requirements.txt
python broadcaster/verisonic_broadcaster.py
```

---

## Verification steps

1. Log in as platform admin (`admin@verisonic.com` / `admin12345`) and complete the mandatory password reset.
2. Promote a test user to **radio admin** (Users Management).
3. Log in as that radio admin — you should land on **Live Radio** and see onboarding until a station exists.
4. Register a station (**Provision Radio Node**). Confirm the dashboard replaces the registration form and other tabs unlock.
5. Open **Connection Settings** on the station card — copy the stream key; test **Regenerate Stream Key**.
6. Launch `python broadcaster/verisonic_broadcaster.py`:
   - Log in as platform admin → access denied (radio admin only).
   - Log in as radio admin → station appears in dropdown; start broadcast.
7. In the web portal, confirm the station shows **Live** and audio plays in the global player.
8. Stop the broadcaster — station should return to standby (no Auto-DJ fallback).

---

## Packaging

See [broadcaster/distributing_broadcaster.md](broadcaster/distributing_broadcaster.md) for PyInstaller builds and distribution.
