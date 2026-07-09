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
    * Connection Settings Subsection: Shows connection configurations (Connection Stream Key as plain text, copy button, and key regeneration).
    * Edit Mode: Opens standard profile forms (Category, Location, Contact, Socials) for a selected station.
    * Add Mode: Opens a registration form to create a new station node.

### 4. Standalone Desktop Broadcaster App
* **New Files**:
  * [broadcaster/verisonic_broadcaster.py](file:///Users/charlsonpeter/Documents/Projects/My_Projects/verisonic/broadcaster/verisonic_broadcaster.py) - Premium dark-themed PyQt5 GUI broadcaster desktop application.
  * [broadcaster/requirements.txt](file:///Users/charlsonpeter/Documents/Projects/My_Projects/verisonic/broadcaster/requirements.txt) - Python package list.
  * [broadcaster/requirements.py](file:///Users/charlsonpeter/Documents/Projects/My_Projects/verisonic/broadcaster/requirements.py) - Programmatic pip installer helper script.

### 8. macOS Docker Compatibility & Network Routing Realignment
* **Files**: [docker-compose.yml](file:///Users/charlsonpeter/Documents/Projects/My_Projects/verisonic/docker-compose.yml) and [nginx.conf](file:///Users/charlsonpeter/Documents/Projects/My_Projects/verisonic/nginx.conf)
* Changed the network model from macOS-incompatible `network_mode: host` to a standard Docker Compose bridge network.
* Exposed port `8001:8001` on the `backend` service container.
* Realigned all environment host connections in the backend configuration (`POSTGRES_SERVER=db`, `REDIS_HOST=redis`, `S3_ENDPOINT_URL=http://minio:9000`) and the reverse proxy destinations in Nginx (`proxy_pass http://backend:8001`) to route internally via bridge gateway service names instead of `localhost` or `host.docker.internal`.

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

---

## Verification Plan

### Manual Verification Steps
1. Log in as an admin (`admin@verisonic.com`). Navigate to the **Live Radio Dashboard** tab and verify that the "Register New Live Station Node" registration form is no longer visible.
2. In the user management interface or settings, promote a test user to **Radio Admin**.
3. Log in as the newly promoted **Radio Admin** (or use the simulated `radio_admin@verisonic.com` credentials).
4. Verify that you are immediately redirected to the **Live Radio Dashboard** to register your station and see the banner on Home. Try clicking on other tabs (like Home, Search) and verify you are redirected back to the `/radio` page.
5. Fill out the station details form and click **Provision Radio Node**.
6. Verify that once created:
   - The registration form is replaced by the radio station management dashboard widget.
   - You can now navigate to other tabs (e.g. Home page) freely.
   - The promotional banner on the Home page is hidden.
7. Launch the broadcaster application (`python broadcaster/verisonic_broadcaster.py`) and attempt to log in as the platform administrator (`admin@verisonic.com`). Verify that access is denied with a message stating that only Radio Admins are allowed.
8. Log in to the broadcaster application using the `radio_admin` account. Verify that the "RADIO STATION" dropdown selection only shows the station owned by this user and links directly to it.
9. Click **Station Profile** settings in the web app. Verify you see the list of your stations containing the first one.
10. Click **+ Add Station**, register a second station (e.g. "VeriSonic Chillout"), and verify it successfully registers and appears in the list.
11. Edit one of the stations, click save, and verify it updates.
12. Click the **Connection Settings** button on one of the cards in the list. Verify that the Connection Stream Key is displayed always in plain text, that the copy button changes state to "Copied", and click **Regenerate Stream Key** to confirm key rotation.
13. Launch the desktop broadcaster app and verify that both stations now appear in the "RADIO STATION" dropdown list.
