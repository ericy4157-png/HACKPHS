# Skyward Handoff

Oct 10, 2026 · @Erc

Reference data, runway and swap checks, and a multi-day network are done and tested on branch `swap-location-fuel-connections`. The recovery engine, live OpenSky enrichment and the UI for the new plan data are not started.

## Status

Everything through the multi-day network and its fixes is done; the layered recovery engine, the live layer and the UI for the new data are the work left. At last report, 56 backend tests pass and the UI typecheck and build pass.

| Area | Status | Notes |
| --- | --- | --- |
| Reference airport data | Done | OurAirports snapshot in `data/reference/airports.json`, built by `scripts/build-reference.js`, loaded by `src/referenceData.js` with a built-in fallback |
| Runway checks and swap compatibility | Done | Limits (6,000 and 8,500 ft) in `src/aircraftPerformance.js`, simplified prototype values. Swaps need the same type or family. New plan fields `diversionRunwayCheck` and `swapCheck` |
| Multi-day network | Done | 197 legs on 15 tails, 826 passenger groups (20% of passengers connect), 79 crew assignments, 13 maintenance checks. Generator in `src/networkGenerator.js` |
| Swap location and fuel fixes | Done | A replacement tail must be on the ground at the airport. A diversion with negative fuel margin falls back to manual review (SKY101, SKY822) |
| Demo fallback | Done | All four seeded scenarios frozen in `UI/src/data/demoSnapshot.json`; "Next scenario" cycles through them |
| Globe performance | Not confirmed | A prompt to draw arcs only for affected or selected flights was written; no result was reported. The globe froze about 1 s on some scenario switches with 197 arcs |
| Aircraft swaps in demos | Gap | No seeded scenario shows a swap now, because 15 tails are too sparse. Fix: reserve tails parked at hubs |
| Crew model | Fields only | Duty fields exist per rotation segment; no duty checks or crew swaps in plans |
| Recovery engine | Not started | Layered lookahead over 10 to 20 legs per aircraft and over passenger itineraries; start with a design note |
| Live OpenSky enrichment | Not started | Callsign normalizer, route lookup, `/api/live`, radius flag. Sketches are in the Skyward Build Plan doc |
| UI for the new data | Not started | Runway check, swap reason, source labels and the `inWindow` filter exist in the API but not on screen |

## Run it

Needs Node 20 or newer; the repo uses ES modules (`"type": "module"`) and the backend has no dependencies.

```
# backend, from the repo root (API on http://localhost:3000)
npm test
npm run dev

# globe UI (opens on http://localhost:5173 and proxies /api to the backend)
cd UI
npm install
npm run dev
```

- **Dashboard:** the original zero-input dashboard is at `http://localhost:3000`.
- **UI checks:** run the typecheck and build scripts listed in `UI/package.json` after any UI change.
- **No backend?** The UI switches to the frozen demo data and shows a banner.
- **Environment variables:** `PORT` changes the API port. `OPENSKY_ACCESS_TOKEN` enables authenticated OpenSky calls; anonymous access is rate limited. `SKYWARD_AIRPORTS_SNAPSHOT` points the loader at a different airport file (the fallback test uses it).
- **Rebuilding the airport snapshot:** only needed if the data changes. Put OurAirports `airports.csv` and `runways.csv` in `data/raw/` (git-ignored), then run `npm run build:reference`. The committed JSON already works without them.

## Where things are

All current work is on branch `swap-location-fuel-connections`, which comes off `multi-day-network`. Confirm it is on GitHub before starting, and branch off it for new work.

**Backend (`src/`)**

| File | What it does |
| --- | --- |
| `data.js` | Builds flights and the fleet from the generator |
| `builtInAirports.js`, `referenceData.js` | Fallback airports, and the loader for the OurAirports snapshot |
| `networkPlan.js`, `networkGenerator.js`, `network.js` | Seed, fleet and anchors; the generator and its validator (an invalid network refuses to load); rotations, passenger groups and crew assignments |
| `aircraftPerformance.js` | All prototype numbers: runway limits, seat capacity, fuel, maintenance, duty |
| `comparison.js` | Plan comparison and the swap check (busy and location) |
| `simulation.js`, `scenarios.js` | Disruption simulation with `windowHours`, the fuel-margin walk, and the four seeded scenarios |
| `routing.js`, `geo.js` | Routing, and `distanceNm` |
| `uiApi.js`, `server.js` | The `/api` layer (adds `dayIndex` and `inWindow` per flight) and the server |

**UI (`UI/src/`):** `components/GlobeView.tsx`, `components/FlightDetailRail.tsx`, `types.ts`, `api/client.ts`, and the frozen demo in `data/demoSnapshot.json` and `data/demoData.ts`.

**Docs and tests:** `docs/network-model.md` (the data model), `DATA_SOURCES.md` (data sources and attribution), and `test/`.

**Rules the code must keep**

- **Decision support only.** Nothing sends instructions to aircraft or ATC, and every plan starts pending a person's approval.
- **No new backend dependencies,** and ES modules throughout.
- **API changes are additive.** Existing `/v1` and `/api` fields keep their shapes.
- **Deterministic.** The same seed gives the same network. Flight IDs and the seeded scenario order stay fixed.
- **Prototype numbers stay in one place** (`aircraftPerformance.js`), labeled as simplified values, not real data.
- **Live data never sets the schedule.** OpenSky only adds detail.
- **No runtime fetches for reference data.**
- **Do not copy code from `jaluebbe/FlightRoutes`.** It is GPL-3.0; reuse its data sources and ideas only.

**How we worked with Cursor:** for big tasks, ask for a design note first and approve it before code. End every prompt with "Do not commit". After any planner change, ask for a list of every plan decision that changed in the four scenarios. After any backend change that touches `/api/flights` or `/api/incident`, re-freeze the demo snapshots.

## Known limits and open decisions

The planner is correct against its own rules but still shallow: it plans one flight at a time and does not yet look ahead. These are the gaps to know about before changing it.

- **No swaps in any seeded scenario.** 15 tails over 32 airports are too sparse for a free tail to be at the right airport.
- **Maintenance hours are read as of now.** N906SK legs after its London check still trigger swaps, because the planner ignores the check scheduled in its rotation.
- **Airborne positions lag elapsed time.** Five of the six hand-set positions are behind their elapsed time (SKY204 is 961 NM from London by position, about 1,930 NM by time). Fuel is charged for the distance to the hand-set position, so all six still reach their destinations.
- **Generated legs ignore the restricted-airspace zones.** Reroutes still avoid them.
- **No crew checks.** Duty fields exist but no plan uses them.
- **Large review queues.** Scenario 1 now has 21 plans for 18 affected flights.
- **Not diffed field by field:** the `/v1` responses. Only `/api` output and plan decisions were compared after the rebuild.
- **One-off data changes:** SKY709 departs 17 hours later than its old schedule, and SKY710's passengers were capped from 242 to 220 to fit its seats.
- **Every fuel, maintenance, seat and duty number is a simplified prototype value,** not real performance data.

Open decisions:

- [ ] What is the demo date? The roadmap has no calendar dates until we know.
- [ ] Which license will Skyward carry? There is no license file yet; the choice decides how we treat GPL-3.0 sources.
- [ ] Check the Virtual Radar Server standing-data license before bundling any of it.
- [ ] Read the FlightRoutes callsign and route files before writing the normalizer; their behavior was only inferred from file names.
- [ ] Confirm swap targets are checked against seat capacity in `comparison.js`. The prompt required it, but the report did not say.

## Next steps

Do them in this order. Steps 1 and 2 can run in parallel on separate branches, since one is UI-only and the other is backend. Step 3 only writes a design doc, so it can start at any time. Every prompt below is ready to paste into Cursor.

### 1. Globe performance (UI only)

Run this first if the globe still freezes for about a second when you click "Next scenario".

```
Continue in the Skyward repo, on a separate branch off swap-location-fuel-connections. UI-only: do not touch src/ or the demo snapshot files. Do not commit.

1. In UI/src/components/GlobeView.tsx, draw the dashed original-route arcs and the green reroute arcs only for flights that have a plan or are selected. Draw all other flights as markers only. Memoize the arc data so it is not rebuilt on every render.
2. In the flight list, sort "To decide" by passengers affected, highest first, then by departure time.
3. Measure scenario switching in demo mode before and after your change (main-thread freeze in ms across all four switches) and report both. Target: no switch freezes longer than 100 ms.
4. Run the UI typecheck and build.
```

### 2. Reserve tails so swaps appear

```
Continue in the Skyward repo, on a branch off swap-location-fuel-connections. Same hard rules: no new backend dependencies, ES modules, additive API fields only, plans start pending human approval, nothing sends instructions anywhere, deterministic generation. Do not commit.

Add reserve aircraft to the network generator. Propose 3 to 5 reserve tails, one at each of several major hubs among the 32 airports (prefer hubs with the most legs). Each reserve has no scheduled legs in the base network, is parked at its hub for the whole 3 days, has a type matching the dominant types at that hub, and has plenty of maintenance hours left. Keep every existing flight, tail, passenger group, schedule and ID unchanged. Update the validator so reserve tails may have no legs while every other rule still holds. Let the swap check consider reserves using the existing rules: busy, location, type or family, seat capacity and maintenance.

Tests: a healthy, compatible reserve at the disrupted airport is proposed; a reserve at another airport is never proposed; generation is still deterministic.

Report which hubs and types you chose, and which of the four seeded scenarios now show a swap (name each). If none does, say so and propose the smallest change that would, without changing the scenario order. Re-freeze all four demo snapshots, run npm test and the UI typecheck/build, and list every plan decision that changed, with the reason.
```

### 3. Recovery engine: design note first

This is the core of the product: a layered model that looks 10 to 20 legs ahead per aircraft and follows passenger itineraries. Approve the note before any code is written.

```
Continue in the Skyward repo, on a new branch off swap-location-fuel-connections. Same hard rules: no new backend dependencies, ES modules, additive API fields only, plans start pending human approval, nothing sends instructions anywhere, deterministic output. Do not commit.

Task: design the recovery engine. Do not write code yet. Write docs/recovery-engine.md and stop for my approval.

Context: today the planner (src/comparison.js, src/simulation.js) plans each affected flight on its own. We want a layered engine. When a disruption hits a leg, evaluate its consequences forward along (a) the aircraft's own next legs (knock-on delays, maintenance limits, refuel and turn times, crew duty) and (b) passengers' itineraries (missed connections, rebooking onto later flights, delay to the final destination). A passenger with a layover has two legs, so rerouting the first leg creates a second layer to evaluate. Lookahead covers the next N legs per aircraft (target 10 to 20; make N a parameter) plus every connecting itinerary layer.

The note must cover:
- Candidate generation per disrupted leg: delay in steps, cancel with rebooking, divert, swap tail (free or reserve), hold for manual review.
- Forward simulation: how a candidate propagates down the tail's rotation and through passenger groups, how maintenance, fuel, turn time and crew duty are checked at each later leg, and how violations are reported.
- Scoring: cost terms (passenger delay minutes by group, missed connections, cancellations, maintenance violations, duty violations, deviation from the original plan) with all weights in one prototype table.
- Search: bounded (beam search or similar) with a time budget and deterministic tie-breaking, no dependencies.
- Output: an additive `layers` field per plan. Layer 0 is the disrupted leg; layer 1 is the aircraft's next affected legs and the affected passenger groups; later layers continue. Include plain-language reasons. Existing plan fields stay unchanged.
- How windowHours interacts with lookahead, and how several disrupted flights competing for the same aircraft are handled.
- A complexity estimate for the current network (197 legs, 15 tails plus reserves, 826 passenger groups).
- Tests, including one showing that a two-leg itinerary triggers a second layer.
- What changes in src/uiApi.js and the UI types (no UI work yet).

End with the risks and the smallest first implementation slice.
```

### 4. Live OpenSky enrichment

Independent of the engine, so it can run on its own branch. Both touch `src/uiApi.js`, so merge carefully.

```
Continue in the Skyward repo, on a branch off swap-location-fuel-connections. Same hard rules, plus: live data only adds detail and must never feed the generator or planner. Do not copy code from the jaluebbe/FlightRoutes repository (GPL-3.0). Do not commit.

Task: live OpenSky enrichment.
1. Create src/liveEnrichment.js. parseCallsign(raw): match an ICAO airline code (3 letters), a 1 to 4 digit number and up to 2 trailing letters; look the airline up in a reference table to get its IATA code; strip leading zeros (DLH012 becomes LH12); return null for private, military, malformed or unknown callsigns. enrichState(stateVector): take an OpenSky state vector (indexes I expect: 0 icao24, 1 callsign, 5 longitude, 6 latitude, 7 barometric altitude, 8 on ground, 10 track; verify against OpenSky's REST documentation) and return icao24, callsign, lon, lat, altitude, onGround, heading, flight, route (from the snapshot, or null), source 'opensky', and routeQuality 'estimate' or 'unknown'. Never guess a route.
2. Reference data: build airlines.json (ICAO code to IATA code and name) and a routes snapshot from the Virtual Radar Server standing data (github.com/vradarserver/standing-data). Inspect its layout first and check its license. If the license does not clearly allow bundling, stop and tell me. Write a build script in the style of scripts/build-reference.js and commit only the JSON.
3. Add GET /api/live (additive). It wraps the existing OpenSky integration, caches responses with a short TTL, and on rate limits or failures returns an empty list with live: false. It flags aircraft inside an active incident's radiusNm. Each item carries source and routeQuality.
4. Tests: DLH123 gives LH123; DLH012 gives LH12; N123AB, empty, null and unknown-airline callsigns give null; an unknown callsign has route null and routeQuality 'unknown'; OpenSky down returns live: false; the radius flag works; nothing in the generator or planner imports live data.
5. UI types only: add optional types in UI/src/types.ts. No UI yet.

Run npm test, list the files you changed, and list anything you could not verify.
```

### 5. UI for the new data

Do this last, once `/api/live` exists and the engine's `layers` field is defined.

```
Continue in the Skyward repo. UI work only (UI/). Keep the day and night themes and the demo-mode behavior. Do not commit.

1. In UI/src/components/FlightDetailRail.tsx, show: the diversion alternate's runway length and the requirement it was checked against (diversionRunway), the swap reason (swapCheck), the maintenance hours left on any swap aircraft, and a short source note (airport data from OurAirports, routes are estimates, live positions from OpenSky when present).
2. Use inWindow to default the flight list to in-window flights, with a toggle for all legs.
3. Add the live layer on the globe: small neutral markers for real aircraft, highlighted inside the incident radius, with a tooltip showing flight, route and the word "estimate". In demo mode use a frozen sample labeled "sample".
4. When the engine's layers field exists, show the layers in the flight detail view: the disrupted leg first, then the downstream legs and passenger groups affected.
5. Run the UI typecheck and build.
```
