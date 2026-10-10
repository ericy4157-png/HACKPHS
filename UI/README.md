# Skyward

Hackathon UI for **disaster flight recovery** — an interactive 3D globe that visualizes disrupted flights and proposed reroutes after major outages (e.g. nationwide ops-system failures).

> Standalone project. Not related to Algoverse / ARC research.

## Quick start

Start the backend from the repo root, then the UI:

```bash
# terminal 1 (repo root)
npm run dev          # Skyward API on :3000

# terminal 2
cd UI
npm install
npm run dev          # UI on :5173, proxies /api to :3000
```

Open http://localhost:5173

To run the UI without the backend, use `VITE_USE_MOCK=true npm run dev`. To point the dev proxy at a different backend, set `SKYWARD_API_URL`.

## Stack

- React + Vite + TypeScript
- `react-globe.gl` (Three.js) for the globe, arcs, and flight markers
- Live data from the Skyward backend (`/api/*`), with local mock data as a fallback mode

## UI layout

- **Center:** interactive Earth — affected airports pulse, flights are clickable points, dashed arcs = original routes, green arcs = proposed reroutes
- **Left rail:** active incident, affected counts, recovery progress
- **Right rail:** selected flight detail — time, aircraft, and layover changes — plus accept/reject, recorded by the backend
- **Next scenario:** advances the backend to its next seeded disruption
- **Sky theme:** follows local time — day (~06:00–18:00) blue sky, night dark sky with stars; Earth texture switches with the mode

## API contract (for backend teammates)

Implemented by the backend in [`../src/uiApi.js`](../src/uiApi.js). The client is [`src/api/client.ts`](src/api/client.ts); set `VITE_API_BASE_URL` to call a backend on another origin instead of the dev proxy.

| Method | Path | Body / response |
|--------|------|-----------------|
| `GET` | `/api/incident` | → `Incident` |
| `GET` | `/api/flights` | → `Flight[]` |
| `GET` | `/api/flights/:id` | → `Flight` |
| `POST` | `/api/flights/:id/accept` | → `{ ok: true, flightId, flight, incident }` |
| `POST` | `/api/flights/:id/reject` | → `{ ok: true, flightId, flight, incident }` |
| `POST` | `/api/scenario/next` | → `{ incident, flights }` |

Flights from the backend also carry optional recovery detail (`changes`, `stops`, `aircraft`, `schedule`, `proposedRoute`, and others); see `Flight` in `src/types.ts`.

Shared TypeScript shapes live in [`src/types.ts`](src/types.ts):

```ts
type Incident = {
  id: string;
  name: string;
  region: string;
  severity: number;       // 0–1
  startedAt: string;      // ISO
  summary: string;
  recoveryProgress: number; // 0–1
  statusLine: string;
};

type Flight = {
  id: string;
  callsign: string;
  origin: string;         // IATA
  destination: string;    // IATA
  status: "disrupted" | "rerouting" | "rerouted" | "ok";
  originalPath: [number, number][]; // [lat, lng]
  proposedPath: [number, number][];
  delayMinutes: number;
  passengers: number;
  lat: number;            // marker position
  lng: number;
};
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
