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
- `GET /v1/network` — seeded network: flights, aircraft rotations and airports
- `GET /v1/integrations/opensky/states` — optional live ADS-B enrichment via OpenSky
- `GET /v1/airspace/restrictions`
- `GET /v1/incidents`
- `POST /v1/incidents`
- `POST /v1/simulations/disaster` — benchmark-only scenario; produces a review queue
- `GET /v1/disruption-plans`
- `POST /v1/disruption-plans/:planId/approve`
- `POST /v1/flights/:flightId/reroute`

## Safety boundary

This is a prototype. The embedded polygons and performance rules are intentionally simplified. A production version must ingest authenticated, current NOTAM/AIP, weather, airport-capacity, flight-plan, crew, aircraft-performance, and jurisdictional data. Every suggestion remains subject to dispatch, ATC, operator, and regulator approval.

## Network data and disaster simulation

The built-in network is realistic-looking synthetic data, deliberately used so the demo is repeatable and does not claim to know future commercial schedules. Each flight is linked to an aircraft rotation, passenger count, scheduled offset, aircraft turn time, and maintenance horizon.

For live aircraft position enrichment, the backend supports the [OpenSky REST API](https://github.com/openskynetwork/opensky-api/blob/master/docs/free/rest.rst). Set `OPENSKY_ACCESS_TOKEN` before running the server to use OAuth credentials; the endpoint can otherwise use its rate-limited anonymous access. OpenSky provides ADS-B state vectors and flight history, not commercial schedules, so it is an enrichment source—not the scheduling source of truth. Its documented `/states/all` endpoint is rate limited and its historical flight queries are bounded; use a licensed schedule/operations provider before any production use.

Example benchmark scenario:

```bash
curl -X POST http://localhost:3000/v1/simulations/disaster \
  -H 'content-type: application/json' \
  -d '{"type":"hurricane","airport":"KJFK","radiusNm":90,"severity":"severe"}'
```

The simulator never modifies the airport network. Creating an actual `airport_closed` incident separately does generate pending human approval plans, but it still never sends instructions to aircraft, airport systems, or ATC.
