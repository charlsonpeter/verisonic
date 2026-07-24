# VeriSonic Mobile

Listener-only React Native app (Expo) for streaming tracks, live radio, offline downloads, and Razorpay Premium — uses the same FastAPI backend as the web portal.

## Features

- Auth (email / password) with SecureStore tokens
- Home, Search, Radio, Library (favorites + downloads + playlists), Profile
- Background-capable playback via `expo-av`
- Free preview gates (30s tracks / 60s radio) matching web
- Offline downloads of progressive AAC/MP3 files (Premium / trial)
- Razorpay checkout via in-app browser → `/api/subscriptions/verify`

Studio upload, radio admin, wallet, and platform admin stay on the web app.

## Prerequisites

- Node 18+ (Node 20+ recommended)
- Running VeriSonic stack (`docker compose up`) so `/api` is reachable
- iOS Simulator / Android Emulator, or a physical device on the same LAN

## Setup

```bash
cd mobile
npm install
```

### API URL

Default:

| Platform | URL |
|----------|-----|
| iOS Simulator | `http://localhost:3000/api` |
| Android Emulator | `http://10.0.2.2:3000/api` |

Physical device — point at your machine:

```bash
EXPO_PUBLIC_API_URL=http://192.168.x.x:3000/api npx expo start
```

Or set `extra.apiUrl` in `app.json`.

## Run

```bash
npx expo start
```

Then press `i` (iOS) or `a` (Android). Expo Go works for most features; a **dev client** is recommended later for native Razorpay SDK + richer lock-screen controls.

## Offline downloads

Downloads use progressive files (`aac_128` / `aac_256` / `mp3_320`), not HLS segments. Tracks without a progressive encode can still stream online but cannot be cached yet.

## Razorpay

Checkout opens Razorpay embedded checkout and returns to `verisonic://razorpay-callback`. Ensure Razorpay keys are configured on the backend. For App Store / Play production, switch to `react-native-razorpay` with an Expo dev client.
