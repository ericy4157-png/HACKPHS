import test from "node:test";
import assert from "node:assert/strict";
import { CATEGORY_RULES, MAINTENANCE_CHECK_MINUTES, MAINTENANCE_CHECK_STATIONS, categoryOf } from "../src/aircraftPerformance.js";
import { airports, crewAssignments, fleet, flights, passengerGroups, rotations } from "../src/data.js";
import { distanceNm } from "../src/geo.js";
import { generateNetwork, validateNetwork } from "../src/networkGenerator.js";
import { ANCHOR_FLIGHTS, NETWORK_SEED } from "../src/networkPlan.js";
import { buildOperationalSnapshot } from "../src/scenarios.js";
import { simulateDisaster } from "../src/simulation.js";
import { toUiFlights } from "../src/uiApi.js";

const flightById = new Map(flights.map((flight) => [flight.id, flight]));
const tailById = new Map(fleet.map((tail) => [tail.id, tail]));
const legsOf = (rotation) => rotation.flightIds.map((id) => flightById.get(id));
const airportByIcao = (icao) => airports.find((airport) => airport.icao === icao);

/**
 * Every plan the planner can produce: the four scenarios plus a closure at each airport, at both
 * severities, with the default 24-hour window and a 72-hour one (which reaches idle tails).
 */
function allPlans() {
  const scenarioPlans = [0, 1, 2, 3].flatMap((index) => buildOperationalSnapshot(index).plans);
  const closurePlans = airports.flatMap((airport) => ["moderate", "severe"].flatMap((severity) => [24, 72]
    .flatMap((windowHours) => simulateDisaster({ airport: airport.icao, radiusNm: 5, severity, windowHours }).plans)));
  return [...scenarioPlans, ...closurePlans];
}

test("the generated network passes its own validation", () => {
  assert.deepEqual(validateNetwork({ flights, fleet, rotations, passengerGroups, crewAssignments }, airports), []);
});

test("every rotation is continuous: each leg departs where the previous one landed", () => {
  for (const rotation of rotations) {
    const legs = legsOf(rotation);
    for (let index = 1; index < legs.length; index += 1) {
      assert.equal(legs[index].origin, legs[index - 1].destination, `${rotation.id} leg ${index + 1} (${legs[index].id})`);
      assert.ok(legs[index].scheduledOffsetMinutes > legs[index - 1].arrivalOffsetMinutes, `${legs[index].id} departs after the previous arrival`);
    }
  }
  assert.equal(
    rotations.filter((rotation) => !rotation.reserve).reduce((sum, rotation) => sum + rotation.flightIds.length, 0),
    flights.length,
    "every leg is in exactly one operating rotation"
  );
});

test("every flight declares the type of the tail that flies it", () => {
  for (const flight of flights) assert.equal(flight.aircraft, tailById.get(flight.aircraftId).type, flight.id);
});

test("passenger groups add up to each flight's passengers and fit the seats", () => {
  const groupSize = new Map(passengerGroups.map((group) => [group.id, group.size]));
  for (const flight of flights) {
    const total = flight.passengerGroupIds.reduce((sum, id) => sum + groupSize.get(id), 0);
    assert.equal(total, flight.passengers, `${flight.id} group total`);
    assert.ok(flight.passengers <= tailById.get(flight.aircraftId).seats, `${flight.id} fits ${flight.aircraftId}`);
  }
  for (const group of passengerGroups) {
    for (const id of group.flightIds) assert.ok(flightById.get(id).passengerGroupIds.includes(group.id), `${group.id} listed on ${id}`);
  }
});

test("multi-leg groups change aircraft at a shared airport with at least the minimum connection time", () => {
  const multiLeg = passengerGroups.filter((group) => group.flightIds.length > 1);
  assert.ok(multiLeg.some((group) => group.flightIds.length === 2), "some 2-leg groups");
  assert.ok(multiLeg.some((group) => group.flightIds.length === 3), "some 3-leg groups");
  assert.ok(passengerGroups.some((group) => group.flightIds.length === 1), "some groups stay on one aircraft");
  for (const group of multiLeg) {
    const legs = group.flightIds.map((id) => flightById.get(id));
    for (let index = 1; index < legs.length; index += 1) {
      const [arriving, departing] = [legs[index - 1], legs[index]];
      const widebody = [arriving, departing].some((leg) => categoryOf(leg.aircraft) === "widebody");
      const minimum = CATEGORY_RULES[widebody ? "widebody" : "narrowbody"].minimumConnectionMinutes;
      assert.equal(arriving.destination, departing.origin, `${group.id} connects at a shared airport`);
      assert.notEqual(arriving.aircraftId, departing.aircraftId, `${group.id} changes aircraft`);
      assert.ok(departing.scheduledOffsetMinutes - arriving.arrivalOffsetMinutes >= minimum, `${group.id} connection at ${departing.origin}`);
    }
  }
});

test("every turn covers the minimum turn plus refuelling, and a check when one is scheduled", () => {
  for (const rotation of rotations) {
    const tail = tailById.get(rotation.tailId);
    const checkAfter = new Set(rotation.maintenanceVisits.map((visit) => visit.afterFlightId));
    const legs = legsOf(rotation);
    for (let index = 1; index < legs.length; index += 1) {
      const ground = legs[index].scheduledOffsetMinutes - legs[index - 1].arrivalOffsetMinutes;
      const required = tail.minimumTurnMinutes + legs[index].refuelMinutes + (checkAfter.has(legs[index - 1].id) ? MAINTENANCE_CHECK_MINUTES : 0);
      assert.ok(ground >= required, `${legs[index].id}: ${ground} min on the ground, needs ${required}`);
      assert.equal(legs[index].turnBeforeMinutes, ground);
    }
  }
});

test("no tail passes its maintenance limit in the base schedule", () => {
  for (const rotation of rotations) {
    const tail = tailById.get(rotation.tailId);
    const visitAfter = new Map(rotation.maintenanceVisits.map((visit) => [visit.afterFlightId, visit]));
    let hours = tail.maintenance.flightHoursRemaining;
    let cycles = tail.maintenance.cyclesRemaining;
    for (const leg of legsOf(rotation)) {
      // An airborne leg only has the part after "now" left to fly.
      hours -= (leg.scheduledOffsetMinutes < 0 ? leg.arrivalOffsetMinutes : leg.blockMinutes) / 60;
      cycles -= 1;
      assert.ok(hours >= 0 && cycles >= 0, `${tail.id} on ${leg.id}: ${hours.toFixed(1)} h, ${cycles} cycles left`);
      const visit = visitAfter.get(leg.id);
      if (visit) {
        assert.ok(MAINTENANCE_CHECK_STATIONS.includes(visit.station), `${visit.id} at a check station`);
        assert.equal(visit.station, leg.destination);
        hours = tail.maintenance.intervalHours;
        cycles = tail.maintenance.intervalCycles;
      }
    }
  }
});

test("fuel never exceeds capacity or lands below reserve, and crews stay inside maximum duty", () => {
  for (const flight of flights) {
    const tail = tailById.get(flight.aircraftId);
    assert.ok(flight.fuel.departureKg <= tail.fuelCapacityKg, `${flight.id} fuel capacity`);
    assert.ok(flight.fuel.arrivalKg >= flight.fuel.reserveKg, `${flight.id} reserve`);
  }
  for (const crew of crewAssignments) assert.ok(crew.dutyMinutes <= crew.maxDutyMinutes, `${crew.id} duty ${crew.dutyMinutes} min`);
});

test("every network airport has at least one flight", () => {
  const served = new Set(flights.flatMap((flight) => [flight.origin, flight.destination]));
  assert.ok(airports.length >= 60, "mid-size network has at least 60 airports");
  assert.ok(fleet.filter((tail) => tail.reserve).length >= 5, "reserve tails are present");
  assert.ok(flights.length >= 1000 && flights.length <= 1500, `${flights.length} legs in mid-size band`);
  for (const airport of airports) assert.ok(served.has(airport.icao), `${airport.icao} has a flight`);
});

test("the original 33 flights keep their IDs and routes; scheduled ones depart no earlier and inside day 1", () => {
  for (const anchor of ANCHOR_FLIGHTS) {
    const flight = flightById.get(anchor.id);
    assert.ok(flight, anchor.id);
    assert.equal(flight.origin, anchor.origin);
    assert.equal(flight.destination, anchor.destination);
    assert.equal(flight.status, anchor.status);
    if (anchor.status === "airborne") {
      assert.equal(flight.scheduledOffsetMinutes, anchor.scheduledOffsetMinutes);
      assert.deepEqual(flight.position, anchor.position);
    } else {
      assert.ok(flight.scheduledOffsetMinutes >= anchor.scheduledOffsetMinutes && flight.scheduledOffsetMinutes < 24 * 60, `${anchor.id} departs in day 1`);
    }
  }
});

test("each airborne flight's fuel on board can reach its destination from its hand-set position with reserve", () => {
  for (const flight of flights.filter((item) => item.status === "airborne")) {
    const tail = tailById.get(flight.aircraftId);
    const neededKg = tail.burnKgPerNm * distanceNm(flight.position, airportByIcao(flight.destination)) + flight.fuel.reserveKg;
    assert.ok(flight.fuel.onboardKgNow >= neededKg, `${flight.id}: ${flight.fuel.onboardKgNow} kg on board, needs ${Math.round(neededKg)}`);
    assert.equal(flight.fuelMinutes, Math.floor(flight.fuel.onboardKgNow / (tail.burnKgPerNm * 8.2)));
  }
});

test("generation is deterministic for a seed and changes with the seed", () => {
  const first = generateNetwork({ airports, seed: NETWORK_SEED });
  const second = generateNetwork({ airports, seed: NETWORK_SEED });
  assert.deepEqual(first, second);
  assert.deepEqual(first.flights, flights);
  assert.notDeepEqual(generateNetwork({ airports, seed: NETWORK_SEED + 1 }).flights, first.flights);
});

test("the validator reports a broken rotation instead of passing it", () => {
  const broken = structuredClone({ flights, fleet, rotations, passengerGroups, crewAssignments });
  const second = broken.flights.find((flight) => flight.id === broken.rotations[0].flightIds[1]);
  second.origin = second.origin === "KJFK" ? "KBOS" : "KJFK";
  assert.ok(validateNetwork(broken, airports).some((problem) => problem.includes(`${second.id} departs`)));
});

test("newly created plans still start pending", () => {
  const plans = allPlans();
  assert.ok(plans.length > 0);
  for (const plan of plans) assert.equal(plan.approvalStatus, "pending", `${plan.flightId} ${plan.action}`);
});

test("the planner never proposes a replacement tail that is busy when it would be needed", () => {
  const plans = allPlans();
  const swaps = plans.filter((plan) => plan.comparison.deltas.aircraftSwapped);
  assert.ok(swaps.length > 0, "some swaps are still proposed");
  assert.ok(plans.some((plan) => plan.comparison.deltas.swapCheck.busyTailsSkipped?.length), "some busy tails were skipped");
  for (const plan of swaps) {
    const { swapCheck, toAircraft } = plan.comparison.deltas;
    const from = (new Date(swapCheck.neededFrom) - Date.now()) / 60_000;
    const until = (new Date(swapCheck.neededUntil) - Date.now()) / 60_000;
    const overlapping = flights.filter((flight) => flight.aircraftId === toAircraft.id
      && flight.scheduledOffsetMinutes < until && flight.arrivalOffsetMinutes > from);
    const inCheck = rotations.find((rotation) => rotation.tailId === toAircraft.id).maintenanceVisits
      .filter((visit) => visit.startOffsetMinutes < until && visit.endOffsetMinutes > from);
    assert.deepEqual([...overlapping, ...inCheck].map((item) => item.id), [], `${plan.flightId} swap to ${toAircraft.id}`);
  }
});

test("every proposed replacement tail is on the ground at the swap airport, ready by its minimum turn", () => {
  const swaps = allPlans().filter((plan) => plan.comparison.deltas.aircraftSwapped);
  assert.ok(swaps.length > 0);
  for (const plan of swaps) {
    const { swapCheck, toAircraft, swapAt } = plan.comparison.deltas;
    const neededAt = (new Date(swapCheck.neededFrom) - Date.now()) / 60_000;
    const tail = tailById.get(toAircraft.id);
    const legs = legsOf(rotations.find((rotation) => rotation.tailId === tail.id));
    const landed = legs.filter((leg) => leg.arrivalOffsetMinutes <= neededAt).at(-1);
    const airport = landed ? landed.destination : (legs[0]?.origin ?? tail.parkedAt ?? tail.location);
    assert.equal(airport, swapAt, `${plan.flightId}: ${tail.id} is at ${airport}`);
    if (landed) assert.ok(landed.arrivalOffsetMinutes + tail.minimumTurnMinutes <= neededAt + 1, `${plan.flightId}: ${tail.id} turned in time`);
  }
});

test("a diversion with a negative fuel margin is never proposed or marked safe", () => {
  const plans = allPlans();
  for (const plan of plans.filter((item) => item.plan.reroute)) {
    const { fuelMarginMinutes, safeToPropose } = plan.plan.reroute.operationalAssessment;
    assert.ok(fuelMarginMinutes >= 0, `${plan.flightId} to ${plan.plan.diversionAirport}: ${fuelMarginMinutes} min`);
    assert.equal(safeToPropose, true);
  }
  assert.ok(plans.some((plan) => plan.action === "hold_for_human_review" && /fuel reserve/.test(plan.plan.reason)));
});

test("about 20% of passengers are on connecting groups", () => {
  const people = passengerGroups.reduce((sum, group) => sum + group.size, 0);
  const connecting = passengerGroups.filter((group) => group.flightIds.length > 1).reduce((sum, group) => sum + group.size, 0);
  assert.ok(connecting / people >= 0.19 && connecting / people <= 0.22, `${(100 * connecting / people).toFixed(1)}% connecting`);
});

test("an event only plans for airborne legs and legs departing inside its window", () => {
  const event = { airport: "EGLL", radiusNm: 5, severity: "moderate" };
  const byDefault = simulateDisaster(event);
  assert.equal(byDefault.scenario.windowHours, 24);
  for (const plan of byDefault.plans) {
    const flight = flightById.get(plan.flightId);
    assert.ok(flight.status === "airborne" || flight.scheduledOffsetMinutes < 24 * 60, `${flight.id} is inside the window`);
  }
  const longer = simulateDisaster({ ...event, windowHours: 72 });
  assert.ok(longer.plans.length > byDefault.plans.length, "a longer window reaches later legs");
  assert.throws(() => simulateDisaster({ ...event, windowHours: 0 }), /windowHours/);
});

test("/api/flights returns every leg with additive dayIndex and inWindow fields", () => {
  const uiFlights = toUiFlights(buildOperationalSnapshot(0));
  assert.equal(uiFlights.length, flights.length);
  for (const flight of uiFlights) {
    const source = flightById.get(flight.id);
    assert.equal(flight.dayIndex, source.dayIndex);
    assert.equal(flight.inWindow, source.status === "airborne" || source.scheduledOffsetMinutes < 24 * 60);
  }
  assert.ok(uiFlights.some((flight) => !flight.inWindow), "later days are outside the window");
});
