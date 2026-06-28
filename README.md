# 🎙️ VeriSonic

VeriSonic is a high-fidelity desktop audio live streaming ecosystem. It allows you to broadcast system audio, music, or microphone inputs in real time from a standalone desktop broadcaster to a web-based dashboard and streaming portal.

The application leverages Python WebSockets for low-latency live audio streaming, FastAPI/Celery for task processing, and React (Vite + TypeScript) for a premium, responsive frontend.

---

## 🛠️ Architecture & System Design

```mermaid
graph TD
    subgraph Client Application
        Broadcaster[PyQt5 Broadcaster Client] -->|Capture Audio & Encode MP3| WS_Send[WebSocket connection]
    end

    subgraph Service Stack (Docker Compose)
        Nginx[Nginx Reverse Proxy] -->|Port 80| FastAPI[FastAPI Backend]
        Nginx -->|Port 80| Vite[React/Vite Frontend]
        
        FastAPI -->|Stream Routing| WS_Send
        FastAPI -->|Async Tasks| Celery[Celery Task Worker]
        
        Celery -->|Queue Broker| Redis[(Redis Cache / Broker)]
        Celery -->|Write Metadata| Postgres[(PostgreSQL DB)]
        Celery -->|Upload Recordings| MinIO[(MinIO S3 Audio Storage)]
    end

    classDef client fill:#f43f5e,stroke:#333,stroke-width:1px,color:#fff;
    classDef service fill:#151d30,stroke:#1e293b,stroke-width:1px,color:#fff;
    classDef storage fill:#0f172a,stroke:#334155,stroke-width:1px,color:#94a3b8;
    
    class Broadcaster,WS_Send client;
    class Nginx,FastAPI,Vite,Celery service;
    class Redis,Postgres,MinIO storage;
```

---

## 📦 Repository Layout

```text
verisonic/
├── backend/                  # FastAPI Application (API, WebSockets, DB Models, Celery worker)
│   ├── app/                  # Main server logic and endpoints
│   ├── Dockerfile            # Container build definition for backend & worker
│   └── requirements.txt      # Python backend packages
├── frontend/                 # Web Portal Dashboard (Vite + TS + Tailwind)
│   ├── src/                  # React components and layouts
│   └── Dockerfile            # Container build definition for frontend
├── broadcaster/              # Standalone PyQt5 desktop broadcaster client
│   ├── verisonic_broadcaster.py  # Main desktop app logic & fallback Tkinter view
│   ├── generate_icons.py     # Script to generate asset icons for executable bundling
│   └── distributing_broadcaster.md # Platform compile guidelines (Mac, Windows, Linux, Android)
├── .github/workflows/        # Automated multi-platform build pipelines (CI/CD)
│   └── build-broadcaster.yml # Matrix builder workflow
├── nginx.conf                # reverse proxy configuration for development routing
└── docker-compose.yml        # Orchestration configurations for local services
```

---

## 🚀 Getting Started

### Prerequisites
Make sure you have the following installed on your machine:
* [Docker & Docker Compose](https://www.docker.com/)
* [Python 3.10+](https://www.python.org/downloads/) (to run/test the broadcaster locally)

---

### 1. Launch the Server Infrastructure

Start the database, queue manager, object storage, and backend/frontend instances:
```bash
docker compose up --build
```

#### Running Endpoints:
* **Web Portal (Frontend)**: [http://localhost](http://localhost) (Proxied via Nginx)
* **Backend API Documentation**: [http://localhost/api/docs](http://localhost/api/docs)
* **MinIO Console (S3 Storage)**: [http://localhost:9001](http://localhost:9001) (User: `minioadmin` / Pass: `minioadmin`)

---

### 2. Run the Desktop Broadcaster Client

To run the broadcaster locally in development:

1. **Install broadcaster dependencies**:
   ```bash
   python -m pip install -r broadcaster/requirements.txt
   ```
2. **Run the Icon Generator** (Optional, creates target OS icon files):
   ```bash
   python broadcaster/generate_icons.py
   ```
3. **Start the App**:
   ```bash
   python broadcaster/verisonic_broadcaster.py
   ```

---

## 💾 Compiling the Broadcaster for Distribution

The desktop broadcaster client can be packaged into standalone executables (`.exe` on Windows, `.app` on macOS, and native binaries on Linux) using PyInstaller.

### Automatic Builds (Recommended)
This repository includes a pre-configured **GitHub Actions Pipeline**. 
* Whenever code inside the `broadcaster/` folder is pushed, a matrix pipeline builds binaries for macOS, Linux, and Windows automatically.
* Check your repository's **Actions** tab to download your compiled builds from the build artifacts.

### Manual Builds
For instructions on manual compiling, loopback sound setup (streaming browser/system audio), background services config, and packaging for Android (using Buildozer), refer to the detailed distribution guide:
👉 [broadcaster/distributing_broadcaster.md](file:///Users/charlsonpeter/Documents/Projects/My_Projects/verisonic/broadcaster/distributing_broadcaster.md)