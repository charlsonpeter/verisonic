# Tasks — VeriSonic

> **Living status:** see [implementation_plan.md](implementation_plan.md) for the full technical spec, API summary, and remaining gaps.

---

## Live broadcaster (complete)

- [x] Database schema — `stream_key` on `RadioStation`; tracked migrations in `backend/app/db/migrations.py`
- [x] Backend streaming — `LiveStreamManager`, WebSocket ingest, HTTP/WebRTC playback, key rotation
- [x] Frontend — Radio admin dashboard, connection settings, route guards, live player routing
- [x] Desktop app — `broadcaster/verisonic_broadcaster.py` (PyQt5), CI builds for macOS/Linux/Windows
- [x] Infrastructure — Docker Compose + nginx live-stream proxy

---

## Subscriptions (complete)

- [x] Backend — Razorpay orders, payment verify, plan queue/cancel/reactivate (`/api/subscriptions`)
- [x] Plans — Premium Monthly (₹99) and Premium Yearly (₹999); Unlimited admin-assigned
- [x] Premium gating — 7-day trial, 30s/60s previews, AAC 128 for free tier (`app/core/premium.py`)
- [x] Frontend — `SubscriptionPlans`, Settings/Landing checkout, `PremiumModal`, admin tier assignment

---

## Known open items

- [ ] Radio schedule — list/delete/reorder API; no automated scheduled playback
- [ ] Playlists — public discovery endpoint
- [ ] Artists — route `Artist.tsx`; dedicated artist browse
- [ ] Listening history — user-facing API/page
- [ ] Google OAuth — real token verification
- [ ] Track comments — persist beyond client mock
- [ ] Album/genre — standalone CRUD APIs
