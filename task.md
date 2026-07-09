# Tasks - VeriSonic Live Broadcaster Implementation

- [x] Database Schema & Seeding
  - [x] Add `stream_key` column to `RadioStation` model in `backend/app/models.py`
  - [x] Add `stream_key` field to `RadioStationResponse` schema in `backend/app/schemas.py`
  - [x] Implement database auto-migration in `backend/app/main.py` to create `stream_key` column on startup
- [x] Backend Streaming Logic & API Endpoints
  - [x] Implement in-memory `LiveStreamManager` in `backend/app/api/radio.py`
  - [x] Create `/api/radio/stream/ws` WebSocket ingestion route for the desktop client
  - [x] Create `/api/radio/{id}/live` HTTP stream client endpoint using `StreamingResponse`
  - [x] Create `POST /api/radio/{id}/regenerate-key` route to change connection keys
  - [x] Update `get_station_stream_sync` and `serialize_station` to route listeners to the live stream
- [x] Web Application Frontend
  - [x] Update `frontend/src/pages/Radio.tsx` to display connection credentials (URL & Stream Key)
  - [x] Fix TypeScript compiler strict mode errors and resolve unclosed braces
- [x] Redesign player audio visualizer (Equalizer.tsx) to match the PyQt segmented LED VU meter

- [x] Desktop Broadcaster Application
  - [x] Create `verisonic_broadcaster.py` desktop software with Tkinter GUI
  - [x] Add audio input device querying, WebSocket streaming thread, and fallback PCM/MP3 modes
