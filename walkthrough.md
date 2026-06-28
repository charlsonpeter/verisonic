# Walkthrough - VeriSonic Live Broadcaster Feature

This walkthrough summarizes the live broadcasting system implemented for VeriSonic. You can now broadcast live audio from your computer (microphone/system sound) direct to your station on the website.

---

## 🛠️ Changes Implemented

### 1. Database Model & Automatic Migration
* **Modified File**: [models.py](file:///Users/charlsonpeter/Documents/Projects/My_Projects/verisonic/backend/app/models.py)
  * Added `stream_key` column to `RadioStation` database model representing the unique connection credentials.
* **Modified File**: [schemas.py](file:///Users/charlsonpeter/Documents/Projects/My_Projects/verisonic/backend/app/schemas.py)
  * Added `stream_key` property to `RadioStationResponse` schema.
* **Modified File**: [main.py](file:///Users/charlsonpeter/Documents/Projects/My_Projects/verisonic/backend/app/main.py)
  * Implemented an automatic database migration in the startup hook to add the `stream_key` column automatically if it's missing on server startup.

### 2. Backend Live Ingestion & Playback Endpoints
* **Modified File**: [radio.py](file:///Users/charlsonpeter/Documents/Projects/My_Projects/verisonic/backend/app/api/radio.py)
  * Implemented `LiveStreamManager` - a centralized, in-memory live stream broker that maps broadcaster chunk packets to active listener queues.
  * Added `/api/radio/stream/ws` WebSocket ingestion route for the desktop broadcaster client.
  * Added `/api/radio/{id}/live` HTTP stream client endpoint that serves the real-time broadcast via FastAPI's chunked `StreamingResponse` (playable by standard HTML5 browser audio tags).
  * Added `POST /api/radio/{id}/regenerate-key` route to change connection keys for security.
  * Updated playback sync logic to route client request URLs to the live broadcast stream when a live broadcaster is connected.

### 3. Frontend Radio Admin Controls
* **Modified File**: [AudioContext.tsx](file:///Users/charlsonpeter/Documents/Projects/My_Projects/verisonic/frontend/src/context/AudioContext.tsx)
  * Added `stream_key` parameter to the TS model interface.
* **Modified File**: [Radio.tsx](file:///Users/charlsonpeter/Documents/Projects/My_Projects/verisonic/frontend/src/pages/Radio.tsx)
  * Updated the Radio Admin Control Panel layout:
    * Added **Broadcaster Status Indicator** showing *LIVE Streaming* (flashing emerald green) or *Standby (Auto-DJ)* (amber yellow) in real-time.
    * Added **Stream URL** field showing `ws://localhost:8000/api/radio/stream/ws` with a Copy button.
    * Added **Stream Key** field with password mask, reveal toggle, Copy button, and a **Regenerate Stream Key** button.

### 4. Standalone Desktop Broadcaster App
* **New Files**:
  * [broadcaster/verisonic_broadcaster.py](file:///Users/charlsonpeter/Documents/Projects/My_Projects/verisonic/broadcaster/verisonic_broadcaster.py) - Premium dark-themed PyQt5 GUI broadcaster desktop application.
  * [broadcaster/requirements.txt](file:///Users/charlsonpeter/Documents/Projects/My_Projects/verisonic/broadcaster/requirements.txt) - Python package list.
  * [broadcaster/requirements.py](file:///Users/charlsonpeter/Documents/Projects/My_Projects/verisonic/broadcaster/requirements.py) - Programmatic pip installer helper script.

---

## 🚀 How to Run & Verify

### 1. Install Desktop Broadcaster Dependencies
Run the automated installer script in the `broadcaster` folder:
```bash
# Navigate to the broadcaster folder and run:
python broadcaster/requirements.py
```
This script reads `requirements.txt` and automatically installs the necessary modules (`PyQt5`, `sounddevice`, `numpy`, `lameenc`, `websocket-client`) via pip.

### 2. Start the Backend & Database Seeding
Ensure you start the FastAPI server. The startup hook will run the migration automatically:
```bash
# From verisonic/backend directory:
uvicorn app.main:app --reload
```

### 3. Start the Frontend Dev Server
Ensure your React frontend is running:
```bash
# From verisonic/frontend directory:
npm run dev
```

### 4. Setup Broadcast Settings on the Website
1. Log in to the VeriSonic web application.
2. Go to the **Live Radio Dashboard**.
3. Under **Your Radio Node**, find the newly generated **Stream URL** and **Stream Key** connection credentials.
4. Copy them.

### 5. Launch and Connect the Broadcaster Software
1. Launch the broadcaster application:
   ```bash
   python broadcaster/verisonic_broadcaster.py
   ```
2. Select your desired input source (Microphone, Stereo Mix, etc.) from the dropdown.
3. Paste the **Stream Key** into the text field (the Stream URL is already pre-configured automatically under the hood).
4. Click **Start Broadcast**.
5. The window will show **LIVE** status, start counting MB sent, and the visual VU level bar will dynamically bounce to your voice or system music input.

### 6. Listen Live on the Website
1. On the VeriSonic website, refresh the dashboard.
2. Observe your station's **Broadcaster Status** has changed to **LIVE Streaming**.
3. Click the **Play** button on your station card. You will hear your live audio broadcast playing in real-time!
