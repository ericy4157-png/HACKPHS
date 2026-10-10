# Recovery engine design

Status: **partially implemented** — aircraft knock-on, passenger connection layers, competing reserve claims, and a live ops session (`src/opsSession.js`) that ticks the network clock, injects ordinary ops noise, and replans after each tick and accept/reject. Beam search / scored delay steps remain future work.  
Branch context: mid-size network (~80 operating tails, 5 reserves, ~60 airports, ~1,200 legs).

The live session owns open disruptions and commitments. Scenario load seeds disaster or maintenance issues; `POST /api/tick` (and a wall timer) advances sim time; decisions freeze or reopen plans and trigger a greedy replan with claim locks.

## Goals and hard rules

- Decision support only. Nothing is sent to aircraft or ATC. Every plan starts `pending`.
- No new backend dependencies. ES modules. Deterministic output for a fixed seed and time budget.
- API changes are additive. Existing plan fields keep their shapes; new detail lives under `layers` (and related optional fields).
- Prototype numbers stay in `src/aircraftPerformance.js`.
- Live OpenSky data never feeds this engine.

## Inputs the engine already has

| Chain | Source | What it provides |
| --- | --- | --- |
| Aircraft rotation | `networkIndex.legsByTail` | Ordered next legs, turn/refuel times, maintenance visits |
| Maintenance / fuel / duty | `fleet`, leg `fuel`, `crewAssignments` | Hours/cycles left, sector fuel, duty caps |
| Passenger itineraries | `networkIndex.groupsByFlight` | Groups of size N continuing on later flights |
| Reserves | `fleet` where `reserve: true` | Parked hub tails for swaps |
| Indexes | `src/networkIndex.js` | O(1) lookups so search stays cheap at ~1,200 legs |

## Candidate generation (per disrupted leg)

For each flight that `simulateDisaster` / a scenario marks as impacted, generate a small fixed set of candidates:

1. **Delay** in steps (e.g. +30, +60, +90, +180, +240 minutes), clamped by event severity.
2. **Cancel + rebook** through a hub (existing cancellation path).
3. **Divert** to ranked alternates with non-negative fuel margin (existing diversion path).
4. **Swap tail** (operating or reserve) using busy, location, type/family, seat capacity, maintenance.
5. **Hold for human review** when no candidate is legal.

Each candidate is a complete layer-0 action for the disrupted leg, plus a provisional schedule change (new departure/arrival, aircraft id, diversion airport).

## Forward simulation

### Aircraft chain (rotation)

Starting from the disrupted leg's new arrival (or cancellation):

1. Walk `legsByTail` forward.
2. At each later leg, recompute ready time = previous arrival + turn + refuel (+ check if scheduled).
3. If ready > scheduled departure, the delay knocks on; else the delay is **absorbed** and lookahead **stops**.
4. Also stop on: overnight break (ground ≥ 8 h with no duty continuity), maintenance visit that resets the chain, end of rotation, or safety cap **N** (default 20).
5. Record violations: maintenance hours/cycles exceeded, duty exceeded, turn too short, fuel capacity.

This is **stop-when-absorbed** lookahead: N is only a cap, not a fixed depth.

### Passenger chain (itineraries)

For each `passengerGroup` on the disrupted leg (and on later knock-on legs):

1. If the group is single-leg, cost is delay minutes × size (or cancellation).
2. If multi-leg, check the connection gap after the new arrival against `minimumConnectionMinutes`.
3. Missed connection → attempt rebooking onto a later same-destination departure from the connection airport (deterministic: earliest legal flight with seat room in the model). If none, mark cancelled for that group.
4. A rebooked onward leg becomes a **layer 1+** evaluation target (second layer for a two-leg itinerary).

## Scoring

One prototype weight table (all in one place, labeled simplified):

| Term | Weight (prototype) | Unit |
| --- | --- | --- |
| Passenger delay | 1 | minute × passenger |
| Missed connection | 180 | per passenger |
| Cancellation | 600 | per passenger |
| Maintenance violation | 5_000 | per event (hard penalty) |
| Duty violation | 5_000 | per event |
| Aircraft swap | 50 | flat (prefer keeping the tail when equal) |
| Diversion / geometry change | 30 | flat |

Lower score is better. Illegal candidates (negative fuel, runway fail, no seats on swap) are discarded before scoring.

## Search

Bounded **beam search**:

- Beam width **W** (default 8): keep the W best partial solutions per disrupted flight.
- Branching: up to ~5 legal candidates at layer 0, then knock-on effects are simulated (not fully re-branched) unless a passenger rebook creates a new disrupted onward leg.
- Time budget **T** ms (default 50) per scenario refresh; deterministic tie-break: lower score, then fewer swaps, then flight id, then candidate kind order.
- **Competing claims:** sort disrupted flights by passengers desc, then departure asc. When a candidate claims a spare/reserve tail for an interval, that claim is reserved for later flights in the same scenario so two plans never take the same aircraft.

No dependencies; pure JS over the indexes.

## Output: additive `layers`

```json
{
  "layers": [
    {
      "index": 0,
      "kind": "disrupted_leg",
      "flightId": "SKY820",
      "action": "reroute",
      "summary": "Divert DFW–MIA to TPA; continue to MIA.",
      "delayMinutes": 95,
      "aircraftId": "N911SK"
    },
    {
      "index": 1,
      "kind": "aircraft_knock_on",
      "flightId": "SKY702",
      "summary": "N911SK arrives 40 min late to ATL; delay absorbed by turn buffer.",
      "delayMinutes": 40,
      "absorbed": true
    },
    {
      "index": 1,
      "kind": "passenger_group",
      "groupId": "PG-0123",
      "size": 28,
      "summary": "28 pax miss MIA connection; rebooked on SKY1xxx (+3h)."
    }
  ]
}
```

Existing fields (`action`, `comparison`, `plan`, `approvalStatus`, …) stay unchanged. UI may ignore `layers` until wired.

## `windowHours` vs lookahead

- `windowHours` = which legs the **event** can mark as disrupted (unchanged).
- Lookahead depth = how far each candidate's consequences are simulated (stop-when-absorbed, cap N).
- A leg outside the window can still appear in `layers` as knock-on or rebooking context; it does not get its own top-level approval card unless it is also in-window and disrupted.

## Complexity (current mid-size network)

Rough upper bound per scenario refresh:

`disrupted (~60) × W(8) × candidates(5) × depth(≤15) × groups(~4) ≈ 150k` forward checks.

At ~1–5 µs per check in Node this is well under 1 s; with T=50 ms the beam simply stops early and keeps the best so far (deterministic by processing order).

## Tests (planned)

1. Delay absorbed by turn buffer → layer 1 `absorbed: true`, no further layers.
2. Delay propagates across two legs when turns are tight.
3. Two-leg passenger itinerary: miss connection → layer with `passenger_group` and rebook or cancel.
4. Two disrupted flights competing for the same reserve: only the higher-priority flight gets it.
5. Snapshot determinism: same seed and budget → identical `layers`.
6. All plans still `pending`; no imports from live enrichment.

## API / UI type changes (no UI work in the first slice)

- `src/uiApi.js`: pass through `layers` on affected flights when present.
- `UI/src/types.ts`: optional `layers?: RecoveryLayer[]`.
- Dashboard `/v1` plans may include `layers` additively.

## Risks

| Risk | Mitigation |
| --- | --- |
| Beam too narrow misses good swaps | Log discarded better scores in tests; tune W |
| Rebooking invents capacity | Only use leftover seats from generated load factors; never overbook in the model |
| Overnight / duty edge cases | First slice skips crew; add in slice 2 |
| Score weights wrong | Single table; treat as prototype knobs |
| UI overwhelm | Layers folded under detail rail later |

## Implemented slices

1. **Aircraft knock-on** — `simulateAircraftKnockOn` / `buildPlanLayers` (stop-when-absorbed).
2. **Passenger layers** — missed connections → rebook or cancel_group layers (`simulatePassengerImpact`).
3. **Competing claims** — replan sorts by passengers/departure; swapped tails are excluded for later flights (`excludeTailIds` in `buildComparison`).
4. **Live clock + ops noise** — `src/opsSession.js`, `src/opsNoise.js`; knobs in `aircraftPerformance.js`; UI polls; mock mode advances via `tickNetwork()`.
5. **Decision replan** — accept freezes commitments; reject opens a hold_for_human_review pending plan; additive `planRevision` / `supersededReason`.

## Still open (next)

- Full beam search with scored delay steps (W, T, weight table).
- Crew duty chain in lookahead.
- Whether knock-on-only legs outside the window ever become their own approval items (recommend: no).

## Open decisions

- [ ] Exact weight table values (prototype above is a starting point).
- [ ] Whether knock-on-only legs outside the window ever become their own approval items (recommend: no).
- [ ] Default N and W for demo vs stress tests.
