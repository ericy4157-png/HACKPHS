# Multi-day network model

Status: **approved and implemented** (branch `multi-day-network`). Code: `src/networkPlan.js` (hand-authored inputs), `src/networkGenerator.js` (generator and validator), `src/aircraftPerformance.js` (prototype values). Tests: `test/network.test.js`.

The hand-written flight list is replaced by a generated multi-day network. Every aircraft flies one continuous chain of legs, and fuel, maintenance, seats, crew duty and passenger itineraries stay consistent along it. There is **no recovery engine** yet: the existing planner keeps working on the new data, with an event time window, a busy-aircraft check, a swap-location check and a fuel-margin check on diversions.

## 1. Why the old data had to change

The old 33 flights were independent records, not rotations:

- **Location breaks.** On 6 of the 7 tails, a flight departed from an airport the aircraft was not at (N902SK was airborne London to Dubai and Hong Kong to Tokyo at once).
- **Type mismatches.** 14 of the 18 generated flights declared a type different from their tail's.
- **Impossible legs.** SKY705 (São Paulo to Miami, 3,549 NM) was declared as an A321neo.
- **Coverage gaps.** KBOS, KIAD and VABB had no flights.
- **Short window.** All departures fell within about 13 hours.

## 2. Principles

1. **The 33 existing flights are anchor legs.** Each keeps its ID, origin, destination and passenger count (capped to seats, section 8). The 6 airborne anchors keep status, departure time and hand-set position. Scheduled anchors may depart later, never earlier, and always inside day 1 (first 24 hours).
2. **Everything else is generated around the anchors** into continuous rotations.
3. **Deterministic.** A small seeded generator written from scratch (`createRandom`, a 32-bit linear congruential generator) drives every choice. Same seed, same network. Times are minute offsets from "now".
4. **Validated at load.** `validateNetwork` checks every invariant in section 9; `generateNetwork` throws a readable error if any fails.
5. **One place for every number.** All prototype values are in `src/aircraftPerformance.js` under a header saying they are not real data.
6. **Additive only.** Existing `/v1` and `/api` fields keep names and meanings.

## 3. Fleet and size

| | Count | Tails |
|---|---|---|
| Widebody | 6 | N901SK, N904SK (A350-900); N902SK, N908SK, N909SK, N910SK (B787-9) |
| Narrowbody, Americas | 5 | N903SK, N911SK, N914SK (A321neo); N905SK (A320neo); N907SK (B737-8) |
| Narrowbody, Europe | 2 | N906SK, N912SK (A321neo) |
| Narrowbody, Asia and Middle East | 2 | N915SK, N916SK (A321neo) |
| **Total** | **15** | 7 existing tail IDs kept, 8 new |

N912SK, N915SK and N916SK are A321neo rather than the draft's A320neo, so fewer anchors need their passenger counts capped (section 8).

**Generated with the committed seed and airport snapshot:**

- **197 legs** (33 anchors, 164 new). Widebodies fly 12 legs over 77 to 90 hours; narrowbodies fly 13 to 15 shorter legs over 42 to 61 hours.
- Departures by day: 86 in day 1, 71 in day 2, 31 in day 3, 9 in day 4.
- **826 passenger groups**, **79 crew assignments**, **13 maintenance visits**.

## 4. Data model

New fields are marked **new**. Existing fields keep their meaning.

### Aircraft (`fleet`; `/v1/network` `aircraft`)

| Field | Meaning |
|---|---|
| `id`, `type` | Tail and type. Every leg on a tail declares exactly this type. |
| `location` | Where the tail is at "now" (its destination if airborne). |
| `maintenanceDueInHours` | Flight hours remaining at "now". The planner reads this. |
| `minimumTurnMinutes` | Turn time before refuelling. |
| `seats`, `fuelCapacityKg`, `burnKgPerNm` **new** | From the type table. |
| `maintenance` **new** | `{ flightHoursRemaining, cyclesRemaining, intervalHours, intervalCycles, checkStations }` at "now". |
| `rotationId` **new** | The rotation this tail flies. |

### Rotation (new; `/v1/network` `rotations`)

`{ id, tailId, flightIds[], maintenanceVisits[], crewAssignmentIds[], startOffsetMinutes, endOffsetMinutes }`, plus `startsAt` and `endsAt` timestamps in `/v1/network`.

### Leg (`flights`; same objects as before, more fields)

| Field | Meaning |
|---|---|
| `id`, `callsign` | `SKY###`. Anchors keep their IDs. New legs take the lowest unused number from 100 in fleet, then rotation, order. |
| `origin`, `destination`, `status`, `position`, `passengers`, `aircraft`, `aircraftId`, `scheduledOffsetMinutes`, `fuelMinutes` | Same meanings. `fuelMinutes` is derived from the fuel model for airborne legs (section 5) and 0 for scheduled legs, as before. |
| `rotationId`, `legNumber`, `anchor` **new** | Position in the rotation, and whether this is one of the original 33. |
| `dayIndex` **new** | 0 for departures in the next 24 hours, 1 for the day after, and so on (airborne legs are 0). |
| `arrivalOffsetMinutes`, `blockMinutes`, `distanceNm` **new** | Block time is distance ÷ 8.2 NM per minute + 20 minutes taxi. |
| `turnBeforeMinutes`, `refuelMinutes` **new** | Ground time before this leg (null on a rotation's first leg). |
| `fuel` **new** | `{ departureKg, tripKg, contingencyKg, reserveKg, arrivalKg }`, plus `onboardKgNow` on airborne legs. |
| `passengerGroupIds` **new** | Groups on this leg; their sizes sum to `passengers`. |
| `crewAssignmentId`, `crewDutyMinutesAtArrival` **new** | Crew fields; no crew swapping yet. |

### Maintenance visit (inside each rotation)

`{ id, tailId, station, startOffsetMinutes, endOffsetMinutes, afterFlightId, hoursRemainingBefore, cyclesRemainingBefore }`. A visit resets hours and cycles to the interval values.

### Passenger group (new; `/v1/network` `passengerGroups`)

`{ id, size, flightIds[1..3], origin, finalDestination, connections[] }`, where each connection is `{ airport, minutes, minimumMinutes }`.

- **Groups with 2 or 3 legs change aircraft at every connection**, at the shared airport, with at least the minimum connection time and at most 8 hours. No itinerary returns to an airport it already left.
- **Single-leg groups stay on one aircraft.**
- **Split (committed seed, `CONNECTING_PASSENGER_SHARE` = 0.20):** 559 single-leg groups (24,462 passengers), 205 two-leg groups (4,762 passengers) and 62 three-leg groups (1,357 passengers). That is 267 connecting groups and 6,119 connecting passengers, 20.0% of 30,581. A connecting passenger occupies a seat on each of their legs, so the 38,057 seat-legs are unchanged. Connections may take at most 70% of any one leg and may wait up to 10 hours; both are generator parameters, needed because 15 tails at 32 airports give few same-airport banks.

### Crew assignment (new; `/v1/network` `crewAssignments`)

`{ id, tailId, category, flightIds[], reportOffsetMinutes, releaseOffsetMinutes, dutyMinutes, maxDutyMinutes }`, plus `reportAt` and `releaseAt` in `/v1/network`. A new segment starts after a maintenance visit or when the next leg would pass maximum duty. Duty runs from report (60 minutes before the first departure) to release (30 minutes after the last arrival).

## 5. Prototype values (`src/aircraftPerformance.js`)

Simplified prototype values, not real performance, maintenance or duty data.

| Type | Seats | Fuel capacity (kg) | Burn (kg/NM) | Min turn (min) |
|---|---|---|---|---|
| A350-900 | 315 | 110,000 | 24 | 105 |
| B787-9 | 290 | 100,000 | 22 | 95 |
| A321neo | 220 | 24,000 | 11 | 55 |
| A320neo | 180 | 20,000 | 9.5 | 50 |
| B737-8 | 180 | 20,500 | 10 | 50 |

- **Fuel at departure:** trip + 5% contingency + 45-minute reserve; never above capacity. Arrival fuel = departure − trip.
- **Refuel:** at each turn, up to the next departure fuel, at 1,000 kg/min (narrowbody) or 2,000 kg/min (widebody). Every turn is at least minimum turn + refuel minutes (+ 8 hours if a check is done there).
- **Airborne fuel (decision 4):** fuel on board now = departure fuel − burn × distance from the origin to the hand-set position. `fuelMinutes` = fuel on board ÷ (burn × 8.2).
- **Maintenance:** narrowbody 50 flight hours or 30 cycles; widebody 80 flight hours or 15 cycles; a check takes 8 hours at KJFK, KORD, KDFW, KATL, KLAX, EGLL, LFPG, EDDF, LTFM, OMDB, VHHH, WSSS or RJTT. The 7 existing tails keep today's hours (N906SK 6, N902SK 11 and so on); new tails have 22 to 44. A tail below 10 hours (narrowbody) or 16 hours (widebody), or below 4 cycles, takes its check at the next check station; generated legs head for the nearest station when it runs low.
- **Crew:** maximum duty 13 hours narrowbody, 17 hours widebody.
- **Passengers:** minimum connection 60 minutes, or 90 if either leg is a widebody; load factor 65 to 95% on new legs.

## 6. How generation works

1. **Anchors per tail** come from the table in `src/networkPlan.js` (`FLEET_PLAN`).
2. **Positioning:** if a tail is not at its next anchor's origin, it flies there directly, or through one intermediate airport when the direct sector is out of range.
3. **Timing:** each leg departs at the previous arrival + turn; an anchor departs at the later of its original time and the ready time.
4. **After the last anchor**, generated legs are added until the tail has its leg count. The next airport is: the nearest reachable check station if maintenance is low; otherwise an airport no flight serves yet (this puts KBOS, KIAD and VABB in the network); otherwise a seeded choice in the type's preferred distance band (450 to 1,400 NM narrowbody, 900 to 3,200 NM widebody), never straight back to the previous origin.
5. **Fuel, maintenance and crew** are computed along each rotation.
6. **Passengers:** connecting itineraries are drawn first, then each leg is filled with single-leg groups to its exact count.
7. **Validation** (section 9).

## 7. Planner changes

| File | Change |
|---|---|
| `src/simulation.js` | **Event window (decision 1).** An event may carry `windowHours` (default 24, exported as `DEFAULT_WINDOW_HOURS`). Only airborne legs and legs departing within the window get plans. This is the event's duration, separate from the lookahead depth the recovery engine will need later. `scenario.windowHours` and `summary.flightsInNetwork` are new; `summary.flightsEvaluated` now counts the legs inside the window. **Fuel-margin check:** a reroute walks the ranked alternates and takes the first with a non-negative fuel margin. If none qualifies, the action is `hold_for_human_review` with a reason that names each alternate's margin. A negative-margin diversion is never marked `safeToPropose`. |
| `src/scenarios.js` | Each of the 8 seeded events states `windowHours: 24`. Order and events are otherwise unchanged. |
| `src/comparison.js` | **Busy-aircraft check** plus **swap-location check.** A replacement tail must be free for the whole time it is needed, and on the ground at the disrupted flight's airport (delay/cancel origin, or the diversion for a reroute), having arrived at least its own minimum turn earlier. Location is read from the tail's rotation, not from `fleet.location` at "now". `swapCheck` gains `neededFrom`, `neededUntil`, `neededAt`, `busyTailsSkipped` and `tailsElsewhereSkipped`. |
| `src/uiApi.js` | **`/api/flights` returns all legs (decision 2)**, each with additive `dayIndex` and `inWindow` (inside the longest active event window). |
| `src/network.js` | `/v1/network` adds `rotations`, `passengerGroups`, `crewAssignments`, and `arrivalAt` per flight. `nextRotation` is the next leg on the tail's rotation. |
| `src/geo.js` **new** | `distanceNm`, moved out of `routing.js` (which re-exports it) so the generator does not form an import cycle with `data.js`. |

**Still a known limitation:** the planner reads `maintenanceDueInHours` at "now" and does not know that a tail's base schedule already contains a check. It also will not ferry a free tail to the swap airport. Both belong to the recovery engine.

## 8. Assignment of the existing flights

"Later" is minutes later than the old schedule.

| Flight(s) | Tail (type) | Change |
|---|---|---|
| SKY101 (airborne) | N901SK (A350-900) | None |
| SKY118 | N904SK (A350-900) | None |
| SKY204 (airborne), SKY709 | N902SK (B787-9) | SKY709 1,020 later (17 h; N902SK takes its check at Dubai first) |
| SKY821 (airborne), SKY715 | N908SK (B787-9) | SKY821 new tail (was N902SK); SKY715 798 later, via Singapore |
| SKY219 | N909SK (B787-9) | New tail |
| SKY705 | N910SK (B787-9) | Type A321neo → B787-9 |
| SKY305 (airborne), SKY311 | N903SK (A321neo) | SKY311 17 later |
| SKY820 (airborne), SKY702, SKY716 | N911SK (A321neo) | SKY820 new tail (was N903SK) |
| SKY700, SKY703, SKY704 | N914SK (A321neo) | Types re-derived; SKY703 194, SKY704 567 later |
| SKY412, SKY413 | N905SK (A320neo) | SKY413 3 later |
| SKY610, SKY611, SKY701 | N907SK (B737-8) | SKY611 52, SKY701 691 later |
| SKY822 (airborne), SKY706, SKY707, SKY717 | N906SK (A321neo) | SKY706 29, SKY707 752, SKY717 720 later (check at London) |
| SKY512, SKY513, SKY708, SKY710 | N912SK (A321neo) | New tail (was N906SK); SKY513 80, SKY708 407, SKY710 782 later |
| SKY711 | N915SK (A321neo) | None |
| SKY712, SKY713, SKY714 | N916SK (A321neo) | SKY713 418, SKY714 826 later |

**Capped passenger counts:** SKY710 242 → 220, SKY711 255 → 220, SKY712 268 → 220. Every other anchor keeps its count.

**Airborne positions (decision 5)** are kept as authored. Five of the six lag their elapsed time (SKY204 has flown 961 NM by position but about 1,930 NM by time). That is why fuel burn is charged by distance to the position, not by time. Each airborne leg's fuel on board covers the remaining distance plus reserve; the margins are SKY822 52 kg, SKY820 533, SKY305 829, SKY821 1,671, SKY101 2,531 and SKY204 2,617.

## 9. Invariants (enforced by `validateNetwork` and covered in `test/network.test.js`)

1. **Location continuity:** every leg departs from the previous leg's destination.
2. **Type consistency:** every leg's `aircraft` equals its tail's `type`.
3. **Passengers:** group sizes sum to each leg's `passengers`, which fit the seats. Multi-leg groups connect at a shared airport, on a different aircraft, with at least the minimum connection time.
4. **Turns:** every turn ≥ minimum turn + refuel (+ check).
5. **Fuel:** departure ≤ capacity; arrival ≥ reserve; airborne fuel reaches the destination from the hand-set position with reserve.
6. **Maintenance:** no tail passes its hour or cycle limit in the base schedule; checks happen only at check stations.
7. **Crew:** no assignment passes maximum duty.
8. **Coverage and identity:** all 32 airports have at least one flight; the 33 anchors keep IDs and routes; airborne anchors keep times and positions; scheduled anchors depart no earlier and inside day 1; IDs are unique.
9. **Determinism:** the same seed gives identical output.
10. **Planner:** new plans start `pending`; no proposed replacement tail is busy when it would be needed; events plan only inside their window.
