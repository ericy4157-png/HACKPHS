# Skyward

Hackathon UI for **disaster flight recovery** — an interactive 3D globe that visualizes disrupted flights and proposed reroutes after major outages (e.g. nationwide ops-system failures).

> Standalone project. Not related to Algoverse / ARC research.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Stack

- React + Vite + TypeScript
- `react-globe.gl` (Three.js) for the globe, arcs, and flight markers
- Local mock data until the backend is ready

## UI layout

- **Center:** interactive Earth — affected airports pulse, flights are clickable points, dashed arcs = original routes, green arcs = proposed reroutes
- **Left rail:** active incident, affected counts, recovery progress
- **Right rail:** selected flight detail + accept/reject (mock)
- **Sky theme:** follows local time — day (~06:00–18:00) blue sky, night dark sky with stars; Earth texture switches with the mode

## API contract (for backend teammates)

Set `VITE_API_BASE_URL` (e.g. `http://localhost:8000`) and flip `USE_MOCK` to `false` in [`src/api/client.ts`](src/api/client.ts).

| Method | Path | Body / response |
|--------|------|-----------------|
| `GET` | `/api/incident` | → `Incident` |
| `GET` | `/api/flights` | → `Flight[]` |
| `GET` | `/api/flights/:id` | → `Flight` |
| `POST` | `/api/flights/:id/accept` | → `{ ok: true, flightId }` |
| `POST` | `/api/flights/:id/reject` | → `{ ok: true, flightId }` |

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
