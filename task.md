# Tasks — VeriSonic

> **Living status:** see [implementation_plan.md](implementation_plan.md) for the technical spec. To rebuild the full app (layout + every feature), use **[BUILD_GUIDE.md](BUILD_GUIDE.md)**.

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

## Search (complete)

- [x] Token-based ranking — `frontend/src/utils/searchMatch.ts`
- [x] Header dropdown preview — `HeaderSearch.tsx` (flat merged results, “Search all” link)
- [x] Full search page — filters, detail views (artist/album/playlist), Play All
- [x] Artists from track metadata — not studio `Artist` profiles
- [x] Unified list rows — `TrackSearchRow`, `RadioSearchRow` with station covers
- [x] Home Popular Artists → Search with artist selected

---

## Profiles, covers & documents (complete)

- [x] User display picture — hover camera on My Profile initials; `POST /api/auth/profile/avatar`
- [x] Studio cover — `StudioProfile` + `POST /api/auth/studio-profile/cover`
- [x] Radio station cover — `StationProfile` edit + `POST /api/radio/{id}/cover`; shown in listings
- [x] Licence document uploads — studio and radio profile forms
- [x] Super-admin moderation — `StudiosManagement`, `RadioStationsManagement` (view licence docs)

---

## Wallet & daily settlement (complete)

- [x] Database — wallets, ledger, bank accounts (encrypted), withdrawals, billable plays, radio listen sessions, daily settlement runs/credits (migration 014–022+)
- [x] Listen recording — track `listen-progress` and radio heartbeats record seconds only (no realtime credit)
- [x] Celery Beat — `settle_daily_revenue_task` at 00:30 UTC; Compose `beat` service
- [x] Owner API — `/api/wallet` (summary, instant withdraw, bank account, export)
- [x] Admin API — `/api/admin/revenue` (settings, owners, subscribers, withdrawals, **settle**)
- [x] Accounts UI — Overview → Owners → Withdrawals → Subscriptions → Settings; date filters; opening balance on filtered withdrawal CSV
- [x] Attribution — `owner_revenue_service.py` attributes track/station INR from settlements

---

## Consumer discovery & engagement (complete)

- [x] Artists page — `#artist` route, `Artist.tsx`, `GET /api/discovery/artists/{name}`
- [x] Recently played on Home — lazy-loaded via `GET /api/music/listening-history`
- [x] Trending — `GET /api/discovery/trending`
- [x] Track comments — threaded (`parent_id`) + comment reactions
- [x] Track / radio-program like-dislike — `/api/reactions` + player controls
- [x] Radio program comments — `/api/radio/{station}/programs/{key}/comments`
- [x] Admin Engagements — `#engagements` (`StudioTracksEngagement`)
- [x] Album/genre CRUD — `/api/albums`, `/api/genres`
- [x] Studio cover in browse — Home Popular Artists + Artist page via `/api/discovery/studios`
- [x] Header avatar — `UserAvatar` with `profile_image_url`

---

## Catalog quality & lyrics (complete)

- [x] Authenticity / fake-lossless detection — migration 026 + `acoustic_quality.py`
- [x] Per-quality HLS paths — migration 024 + transcode + cleanup/retranscode tasks
- [x] Timed lyrics fields — migration 025
- [x] Hybrid lyrics pipeline — `lyrics_pipeline.py` + `extract_lyrics_task` (optional env flags)

---

## Rebuild documentation (complete)

- [x] [BUILD_GUIDE.md](BUILD_GUIDE.md) — full application blueprint aligned to current code
- [x] [implementation_plan.md](implementation_plan.md) / [README.md](README.md) / this checklist — synced to migrations 001–029

---

## Known open items

These items are not currently tracked outside this repository. Update this list when their status changes.

- [ ] Radio schedule — list/delete/reorder API; no automated scheduled playback
- [ ] Playlists — public discovery endpoint
- [ ] Google OAuth — real token verification (mock login disabled)
- [ ] General Contact mailbox API (upgrade request paths work)
