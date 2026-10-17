# Skyward Handoff

Oct 10, 2026 · branch `scale-phase-1`

Skyward is a disaster flight-recovery desk: a Node ES-module backend plus a React globe UI. The operator reviews legal recovery futures and accepts or declines them. Nothing is sent to a crew or ATC.

This note replaces the older `swap-location-fuel-connections` handoff. Mid-size network, live ops clock, recovery layers, two-future cards, story-scroll dashboard, and the flight sheet are in this branch.

## Status

| Area | Status | Notes |
| --- | --- | --- |
| Mid-size network | Done | ~80 operating tails, 5 reserves, ~60 airports, ~1,200 legs. Generator in `src/networkGenerator.js` |
| Live ops session | Done | `src/opsSession.js` ticks sim time, injects ordinary delays, and replans after each tick or decision |
| Recovery layers | Partial | Aircraft knock-on + passenger miss/rebook layers. No beam search, no crew duty in lookahead |
| Two legal futures | Done | `src/recoveryCandidates.js` attaches 1–2 alternatives during `replanAll`. Accept by `planId` |
| Butterfly | Done | `changedFlightIds` = other pending plans whose fingerprint changed. UI pulses those ids |
| Dashboard | Done | Hero stats, generated rundown, inbox/dispatch, one-card approve/decline queue with swipe animation |
| Flight sheet | Done | Roster spreadsheet (`scope=roster`). History is a closeable side panel, not an overlay |
| Impact notices | Done | Click Affected / rundown links, or the orange “other plans changed” banner, to see how each flight moved |
| Globe + rails | Done | Story-scroll dashboard ↔ network. Left rail: Operations / Flights. Compact `scope=active` markers |
| Demo fallback | Done | Frozen scenarios in `UI/src/data/demoSnapshot.json`. Banner if the API is down |
| Live OpenSky enrichment | Not started | `/v1/integrations/opensky/states` exists; no `/api/live`, no globe live layer |
| Crew model | Fields only | Duty exists on rotations; no plan uses it |
| Beam search | Not started | Still greedy one-plan-per-flight |

## Run it

Needs Node 20+. Backend has no npm dependencies. UI is Vite + React 19.

```
# backend (API on http://localhost:3000)
npm test
npm run dev

# globe UI (http://localhost:5173, proxies /api → :3000)
cd UI
npm install
npm run dev
```

- Vite proxies `/api` only. Do not point the UI at `:3000` for the React app.
- The old zero-input HTML dashboard is still at `http://localhost:3000`.
- No backend? The UI switches to demo data and says so. Decisions in demo mode are not saved.
- `PORT` changes the API port. `OPENSKY_ACCESS_TOKEN` enables authenticated OpenSky. `SKYWARD_AIRPORTS_SNAPSHOT` points the airport loader at another file.
- Rebuild airports only if the raw CSVs change: put OurAirports files in `data/raw/` (git-ignored), then `npm run build:reference`.
- After planner or `/api/flights` / `/api/incident` shape changes, re-freeze demos: `npm run freeze:demo`.

## How the product works

1. **Dashboard** (`DashboardHero`) — Skyward wordmark, four live numbers (to approve, passengers, affected, handled), a generated situation rundown, inbox from `lastOpsNote` / `statusLine`, and one approval card at a time. The card shows the cheapest legal future (`passengerMinutes`), predicted knock-on (plan `layers` plus same-tail pending legs), and Approve / Decline / Skip. Approve swipes the card out, then the next card enters. Approve/decline call `POST /api/flights/:id/accept|reject` with optional `{ planId }`.
2. **Network** — scroll or “Enter the network”. Globe stays mounted. Left rail: incident + next scenario, or the flight list / detail with a futures picker. Selecting a future previews its path. `changedFlightIds` pulse on the globe and list.
3. **Flight sheet** — full roster. Click a row to open that tail’s rotation on the right. Close, click the same row, or Escape puts it away. It does not overlay the table.
4. **Notices** — click Affected, the rundown links, or `ImpactBanner` after a decision that rewrote other plans. Each row says how that flight was affected (`supersededReason`, action, delay, proposed route) and jumps to it on the globe.

## API the UI uses

Additive only. Existing `/v1` and `/api` fields keep their shapes.

| Call | What |
| --- | --- |
| `GET /api/incident` | Active scenario + sim clock (`simMinutes`, `simClockIso`, `lastOpsNote`, `planRevision`, `baseline`) |
| `GET /api/flights?scope=active` | Compact markers for quiet legs; full rows for planned / in-window |
| `GET /api/flights?scope=roster` | Every leg with schedule / fuel / tail; no heavy paths or alternatives |
| `GET /api/flights/:id` | Full detail (hydrate a compact marker) |
| `POST /api/flights/:id/accept` | Body `{ planId? }`. Returns `flights`, `incident`, `changedFlightIds` |
| `POST /api/flights/:id/reject` | Same shape. Reopens a hold-for-review plan and replans |
| `POST /api/tick?scope=active` | Advance the ops clock (UI also polls every 12s) |
| `POST /api/scenario/next` | Next seeded scenario |

`changedFlightIds` excludes the decided flight. It is empty when no other pending fingerprint moved.

## Where things are

**Backend (`src/`)**

| File | What it does |
| --- | --- |
| `opsSession.js` | Live session: tick, ops noise, accept/reject, `replanAll`, `changedFlightIds` |
| `recoveryCandidates.js` | 1–2 legal siblings (shorter delay, second fuel-safe divert, swap vs no-swap, hold) |
| `recoveryEngine.js` | Knock-on + passenger layers |
| `simulation.js` | Exported builders: `evaluateReroutes`, `buildReroutePlan`, `buildHoldPlan`, `buildDelayPlan`, `finish` |
| `uiApi.js` | `toUiFlights` scopes, slim alternatives, roster fields, `layers` / `passengerMinutes` / `label` |
| `server.js` | `/api` routes; accept passes `planId` |
| `networkGenerator.js`, `networkPlan.js`, `networkIndex.js` | Network + indexes |
| `comparison.js`, `routing.js`, `aircraftPerformance.js` | Planner rules and prototype numbers |

**UI (`UI/src/`)**

| File | What it does |
| --- | --- |
| `App.tsx` | Pages, polling, decisions, butterfly ids, sheet vs story-scroll |
| `components/DashboardHero.tsx` | Ops desk + approval card |
| `components/FlightSheet.tsx` | Roster + retractable history |
| `components/ImpactBanner.tsx` | Clickable “other plans changed” notice |
| `components/GlobeView.tsx` | Preview path + changed pulse |
| `components/FlightDetailRail.tsx` | Futures picker + knock-on layers |
| `hooks/useStoryScroll.ts` | Dashboard ↔ network scroll |
| `api/client.ts` | Live client + mock futures / mock butterfly |
| `types.ts` | `FlightAlternative`, `RecoveryLayer`, `changedFlightIds` |

**Tests:** `test/` including `test/recoveryCandidates.test.js` (accept-by-id, alternatives, `changedFlightIds`). Run `npm test` from the repo root.

**Rules the code must keep**

- Decision support only. Every plan starts pending. Nothing sends instructions.
- No new backend dependencies. ES modules.
- API changes are additive.
- Deterministic generation for a fixed seed.
- Prototype numbers stay in `aircraftPerformance.js`.
- Live data never sets the schedule.
- No runtime fetches for reference data.
- Do not copy `jaluebbe/FlightRoutes` (GPL-3.0).
- UI must not import backend modules.

## Known limits

- Butterfly is empty on a quiet baseline, and often empty when accepting a hold / manual-review future that does not rewrite other fingerprints. The card still shows predicted same-tail knock-on before you decide.
- Dashboard skip list is local React state. It resets when the incident id changes (`key={incident?.id}`).
- Sheet history is a side column (~22rem). On narrow viewports it stacks under the table.
- Globe still draws more than “affected + selected” in some cases; measure scenario-switch freeze if it stutters.
- No swaps in some seeded scenarios if no free tail is on the ground at the right hub.
- Maintenance hours are read as of now; a later scheduled check is not a future reset.
- Generated legs ignore restricted-airspace zones; reroutes still avoid them.
- Crew duty is unused.
- Demo freeze may omit `layers` (see `scripts/freeze-demo.js`) so mock mode invents lighter futures.

## Open decisions

- [ ] Demo calendar date
- [ ] License file (needed before bundling any GPL-adjacent sources)
- [ ] Virtual Radar Server standing-data license before a routes snapshot
- [ ] Exact recovery score weights
- [ ] Whether knock-on-only legs outside the window become their own approval items (recommend: no)

## Next steps (ready to paste)

Same hard rules as above. Ask for a design note on anything that changes the planner. After planner changes, list every plan decision that changed in the seeded scenarios and re-freeze demos.

### 1. Beam search (backend)

The recovery engine is still greedy. Design or implement scored delay steps and a bounded beam (`docs/recovery-engine.md`). Do not invent illegal diverts or swaps. Keep alternatives attached after search.

### 2. Live OpenSky enrichment

`GET /api/live` with short TTL, `live: false` on failure, radius flag, callsign normalizer. Live data must not feed the generator or planner. Check standing-data license before bundling routes.

### 3. Globe performance

Draw original/proposed arcs only for planned or selected flights; markers for the rest. Measure scenario-switch main-thread time.

### 4. Crew duty in lookahead

Duty fields exist. Use them as hard stops in knock-on, then surface the reason on the card and detail rail.

### 5. Reserve tails / visible swaps

If a demo needs a visible aircraft swap, park compatible reserves at the disrupted hubs without changing existing flight IDs.
