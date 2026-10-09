# Skyward Ops API

Decision-support backend for re-routing flights when airports are disrupted. It is built for an ATC / airline operations control / ramp-control demo, not for issuing real-world clearances.

## Run

```bash
npm test
npm run dev
```

The API runs at `http://localhost:3000` with no external dependencies.

Open `http://localhost:3000` to use the included Ops Test Console. It is an intentionally minimal end-to-end harness; your teammate can replace it with the final product UI while keeping the same API contract.

## Demo flow

1. `GET /v1/flights` — choose a flight.
2. `POST /v1/incidents` with `{ "airport": "EGLL", "type": "airport_closed", "reason": "flooding" }`.
3. `POST /v1/flights/SKY101/reroute` with `{ "destination": "LFPG", "policy": { "avoidHighTerrain": true } }`.

The reroute response includes route waypoints, restricted zones avoided, compatible diversion fields, fuel-margin estimate, and an understandable passenger impact estimate.

## Endpoints

- `GET /health`
- `GET /v1/airports`
- `GET /v1/flights`
- `GET /v1/airspace/restrictions`
- `GET /v1/incidents`
- `POST /v1/incidents`
- `POST /v1/flights/:flightId/reroute`

## Safety boundary

This is a prototype. The embedded polygons and performance rules are intentionally simplified. A production version must ingest authenticated, current NOTAM/AIP, weather, airport-capacity, flight-plan, crew, aircraft-performance, and jurisdictional data. Every suggestion remains subject to dispatch, ATC, operator, and regulator approval.
