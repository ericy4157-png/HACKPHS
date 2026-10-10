/**
 * Seeded multi-day network generator (docs/network-model.md).
 *
 * Builds one continuous rotation per tail around the anchor flights in src/networkPlan.js, then
 * derives fuel, maintenance visits, crew duty segments and passenger itineraries along each
 * rotation. Times are minute offsets from "now". The result is validated before it is returned,
 * so an inconsistent network never reaches the API.
 */
import { distanceNm } from "./geo.js";
import {
  AIRCRAFT_TYPES, CATEGORY_RULES, CREW_RELEASE_MINUTES, CREW_REPORT_MINUTES, CRUISE_NM_PER_MIN, LOAD_FACTOR_RANGE,
  MAINTENANCE_CHECK_MINUTES, MAINTENANCE_CHECK_STATIONS, RUNWAY_CATEGORIES, TYPE_PERFORMANCE,
  blockMinutesFor, categoryOf, maxRangeNm, sectorFuel
} from "./aircraftPerformance.js";
import {
  ANCHOR_FLIGHTS, ANCHOR_LATEST_DEPARTURE_MINUTES, CONNECTING_GROUP_SIZE, CONNECTING_PASSENGER_SHARE, CONNECTING_SHARE_PER_LEG, FILLER_DISTANCE_BAND_NM, FLEET_PLAN,
  LEGS_PER_TAIL, LOCAL_GROUP_SIZE, MAINTENANCE_THRESHOLD_CYCLES, MAINTENANCE_THRESHOLD_HOURS, MAX_CONNECTION_MINUTES, NETWORK_SEED, REGION_AIRPORTS
} from "./networkPlan.js";

const MINUTES_PER_DAY = 24 * 60;
// Range is used up to this fraction so no generated sector sits exactly on the fuel limit.
const RANGE_USE_FRACTION = 0.97;

/**
 * Small deterministic random source (32-bit linear congruential generator).
 * Good enough for picking demo routes; not suitable for anything security-related.
 */
export function createRandom(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4_294_967_296;
  };
}

const randomInt = (random, min, max) => min + Math.floor(random() * (max - min + 1));
const pick = (random, list) => list[Math.floor(random() * list.length)];

function shuffled(random, list) {
  const copy = [...list];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapWith = Math.floor(random() * (index + 1));
    [copy[index], copy[swapWith]] = [copy[swapWith], copy[index]];
  }
  return copy;
}

/** Everything the rotation builder needs to know about one tail's type. */
function tailProfile(plan) {
  const category = categoryOf(plan.type);
  return { ...plan, category, ...TYPE_PERFORMANCE[plan.type], ...CATEGORY_RULES[category], rangeNm: maxRangeNm(plan.type) * RANGE_USE_FRACTION };
}

function regionAirports(tail, airportsByIcao) {
  const codes = tail.region === "global" ? [...airportsByIcao.keys()] : REGION_AIRPORTS[tail.region];
  const requiredRunwayFt = RUNWAY_CATEGORIES[tail.category].minimumRunwayFt;
  return codes.filter((icao) => (airportsByIcao.get(icao)?.runwayFt ?? 0) >= requiredRunwayFt);
}

/**
 * Next airport on the way to `target`: the target itself if it is in range, otherwise the
 * intermediate airport that keeps both sectors in range with the least total distance.
 */
function positioningHop(tail, from, target, ctx) {
  const distance = ctx.nm(from, target);
  if (distance <= tail.rangeNm) return target;
  const via = regionAirports(tail, ctx.airportsByIcao)
    .filter((icao) => icao !== from && icao !== target && ctx.nm(from, icao) <= tail.rangeNm && ctx.nm(icao, target) <= tail.rangeNm)
    .sort((a, b) => (ctx.nm(from, a) + ctx.nm(a, target)) - (ctx.nm(from, b) + ctx.nm(b, target)))[0];
  if (!via) throw new Error(`${tail.id}: no route within range from ${from} to ${target}`);
  return via;
}

/**
 * Destination of a generated leg. Low on maintenance: the nearest reachable check station.
 * Otherwise an airport no rotation serves yet, else a seeded choice in the preferred distance band.
 */
function fillerDestination(tail, state, ctx) {
  const from = state.location;
  const inRange = regionAirports(tail, ctx.airportsByIcao).filter((icao) => icao !== from && ctx.nm(from, icao) <= tail.rangeNm);
  const atStation = MAINTENANCE_CHECK_STATIONS.includes(from);
  const lowOnMaintenance = state.hoursRemaining < MAINTENANCE_THRESHOLD_HOURS[tail.category] || state.cyclesRemaining < MAINTENANCE_THRESHOLD_CYCLES;
  if (lowOnMaintenance && !atStation) {
    const station = inRange
      .filter((icao) => MAINTENANCE_CHECK_STATIONS.includes(icao) && blockMinutesFor(ctx.nm(from, icao)) / 60 <= state.hoursRemaining)
      .sort((a, b) => ctx.nm(from, a) - ctx.nm(from, b))[0];
    if (!station) throw new Error(`${tail.id}: no check station reachable from ${from} with ${state.hoursRemaining.toFixed(1)} h remaining`);
    return station;
  }
  const [minNm, maxNm] = FILLER_DISTANCE_BAND_NM[tail.category];
  const inBand = inRange.filter((icao) => ctx.nm(from, icao) >= minNm && ctx.nm(from, icao) <= maxNm);
  const pool = inBand.length ? inBand : inRange;
  const noBounce = pool.filter((icao) => icao !== state.previousOrigin);
  const choices = noBounce.length ? noBounce : pool;
  const unserved = choices.filter((icao) => !ctx.servedAirports.has(icao));
  return pick(ctx.random, unserved.length ? unserved : choices);
}

function startMaintenanceCheck(tail, state) {
  const previous = state.legs.at(-1);
  state.maintenanceVisits.push({
    id: `MX-${tail.id}-${state.maintenanceVisits.length + 1}`, tailId: tail.id, station: state.location,
    startOffsetMinutes: previous.arrivalOffsetMinutes, endOffsetMinutes: previous.arrivalOffsetMinutes + MAINTENANCE_CHECK_MINUTES,
    afterLegIndex: state.legs.length - 1,
    hoursRemainingBefore: Math.round(state.hoursRemaining * 10) / 10, cyclesRemainingBefore: state.cyclesRemaining
  });
  state.hoursRemaining = tail.intervalHours;
  state.cyclesRemaining = tail.intervalCycles;
  state.checkBeforeNextLeg = true;
}

/** Append one leg to the rotation, timed from the previous arrival plus the turn. */
function appendLeg(tail, state, destination, anchor, ctx) {
  const origin = state.location;
  const distance = ctx.nm(origin, destination);
  const blockMinutes = blockMinutesFor(distance);
  const fuel = sectorFuel(tail.type, distance);
  if (fuel.departureKg > tail.fuelCapacityKg) throw new Error(`${tail.id}: ${origin}-${destination} needs ${fuel.departureKg} kg, capacity ${tail.fuelCapacityKg} kg`);
  const previous = state.legs.at(-1);
  let departure, turnBeforeMinutes = null, refuelMinutes = 0;
  if (!previous) {
    departure = anchor.scheduledOffsetMinutes;
  } else {
    refuelMinutes = Math.ceil(Math.max(0, fuel.departureKg - previous.fuel.arrivalKg) / tail.refuelKgPerMinute);
    const minimumGround = tail.minimumTurnMinutes + refuelMinutes + (state.checkBeforeNextLeg ? MAINTENANCE_CHECK_MINUTES : 0);
    const ready = previous.arrivalOffsetMinutes + minimumGround;
    departure = anchor && anchor.status !== "airborne" ? Math.max(anchor.scheduledOffsetMinutes, ready) : ready;
    turnBeforeMinutes = departure - previous.arrivalOffsetMinutes;
  }
  const arrival = departure + blockMinutes;
  // An airborne first leg has only its remaining time ahead of "now" counted against maintenance.
  const hoursUsed = (departure < 0 ? Math.max(0, arrival) : blockMinutes) / 60;
  if (hoursUsed > state.hoursRemaining || state.cyclesRemaining < 1) {
    throw new Error(`${tail.id}: ${origin}-${destination} would exceed the maintenance limit (${state.hoursRemaining.toFixed(1)} h, ${state.cyclesRemaining} cycles left)`);
  }
  state.legs.push({
    anchorId: anchor?.id ?? null, origin, destination, distanceNm: Math.round(distance), blockMinutes, fuel,
    scheduledOffsetMinutes: departure, arrivalOffsetMinutes: arrival, turnBeforeMinutes, refuelMinutes,
    maintenanceBefore: state.checkBeforeNextLeg
  });
  state.hoursRemaining -= hoursUsed;
  state.cyclesRemaining -= 1;
  state.checkBeforeNextLeg = false;
  state.previousOrigin = origin;
  state.location = destination;
  ctx.servedAirports.add(origin).add(destination);
}

/** One continuous rotation: anchors in their planned order, positioning legs between them, then generated legs. */
function buildRotation(tail, ctx) {
  const anchors = tail.anchors.map((id) => ctx.anchorsById.get(id));
  const [minLegs, maxLegs] = LEGS_PER_TAIL[tail.category];
  const targetLegs = randomInt(ctx.random, minLegs, maxLegs);
  const state = {
    legs: [], maintenanceVisits: [], location: anchors[0].origin, previousOrigin: null,
    hoursRemaining: tail.hoursRemaining, cyclesRemaining: tail.cyclesRemaining, checkBeforeNextLeg: false
  };
  let anchorIndex = 0;
  while (anchorIndex < anchors.length || state.legs.length < targetLegs) {
    const atStation = MAINTENANCE_CHECK_STATIONS.includes(state.location);
    const belowThreshold = state.hoursRemaining < MAINTENANCE_THRESHOLD_HOURS[tail.category] || state.cyclesRemaining < MAINTENANCE_THRESHOLD_CYCLES;
    if (state.legs.length && atStation && belowThreshold && !state.checkBeforeNextLeg) startMaintenanceCheck(tail, state);

    const nextAnchor = anchors[anchorIndex];
    let destination, anchor = null;
    if (nextAnchor && state.location === nextAnchor.origin) {
      destination = nextAnchor.destination;
      anchor = nextAnchor;
      anchorIndex += 1;
    } else if (nextAnchor) {
      destination = positioningHop(tail, state.location, nextAnchor.origin, ctx);
    } else {
      destination = fillerDestination(tail, state, ctx);
    }

    const legHours = blockMinutesFor(ctx.nm(state.location, destination)) / 60;
    if (state.legs.length && atStation && !state.checkBeforeNextLeg && (legHours > state.hoursRemaining || state.cyclesRemaining < 1)) {
      startMaintenanceCheck(tail, state);
    }
    appendLeg(tail, state, destination, anchor, ctx);
  }
  return state;
}

/** Lowest unused SKY number from 100 upwards, in fleet then rotation order, so IDs are stable for a seed. */
function assignLegIds(rotations) {
  const used = new Set(ANCHOR_FLIGHTS.map((flight) => Number(flight.id.slice(3))));
  let next = 100;
  for (const { legs } of rotations) {
    for (const leg of legs) {
      if (leg.anchorId) { leg.id = leg.anchorId; continue; }
      while (used.has(next)) next += 1;
      if (next > 999) throw new Error("Ran out of SKY flight numbers (100-999)");
      leg.id = `SKY${next}`;
      used.add(next);
    }
  }
}

/** Crew duty segments: a new segment starts after a maintenance check or when duty would pass the maximum. */
function buildCrewAssignments(tail, legs) {
  const assignments = [];
  let current = null;
  for (const leg of legs) {
    const reportAt = leg.scheduledOffsetMinutes - CREW_REPORT_MINUTES;
    const releaseAt = leg.arrivalOffsetMinutes + CREW_RELEASE_MINUTES;
    if (!current || leg.maintenanceBefore || releaseAt - current.reportOffsetMinutes > tail.maxDutyMinutes) {
      current = {
        id: `CR-${tail.id}-${assignments.length + 1}`, tailId: tail.id, category: tail.category, flightIds: [],
        reportOffsetMinutes: reportAt, releaseOffsetMinutes: releaseAt, dutyMinutes: 0, maxDutyMinutes: tail.maxDutyMinutes
      };
      assignments.push(current);
    }
    current.flightIds.push(leg.id);
    current.releaseOffsetMinutes = releaseAt;
    current.dutyMinutes = releaseAt - current.reportOffsetMinutes;
    leg.crewAssignmentId = current.id;
    leg.crewDutyMinutesAtArrival = leg.arrivalOffsetMinutes - current.reportOffsetMinutes;
  }
  return assignments;
}

const minimumConnection = (first, second) => (first.category === "widebody" || second.category === "widebody"
  ? CATEGORY_RULES.widebody.minimumConnectionMinutes
  : CATEGORY_RULES.narrowbody.minimumConnectionMinutes);

/** A connection is valid when it changes aircraft at the shared airport with enough, but not too much, time. */
function connects(first, second) {
  if (first.destination !== second.origin || first.tailId === second.tailId) return false;
  const gap = second.scheduledOffsetMinutes - first.arrivalOffsetMinutes;
  return gap >= minimumConnection(first, second) && gap <= MAX_CONNECTION_MINUTES;
}

/** Every 2- and 3-leg itinerary that changes aircraft at each connection and never returns to an earlier airport. */
function connectingItineraries(legs) {
  const departuresFrom = new Map();
  for (const leg of legs) departuresFrom.set(leg.origin, [...(departuresFrom.get(leg.origin) || []), leg]);
  const pairs = [], triples = [];
  for (const first of legs) {
    for (const second of departuresFrom.get(first.destination) || []) {
      if (!connects(first, second) || second.destination === first.origin) continue;
      pairs.push([first, second]);
      for (const third of departuresFrom.get(second.destination) || []) {
        if (connects(second, third) && third.destination !== first.origin && third.destination !== second.origin) triples.push([first, second, third]);
      }
    }
  }
  return { pairs, triples };
}

/**
 * Split each leg's passengers into groups. Connecting groups are drawn in repeated sweeps over
 * the valid itineraries until CONNECTING_PASSENGER_SHARE of all passengers connect, or until
 * no itinerary has room; they take at most CONNECTING_SHARE_PER_LEG of any leg. Local
 * (single-leg) groups take the rest, so each leg's total is exact.
 */
function buildPassengerGroups(legs, random) {
  const groups = [];
  const connectingLeft = new Map(legs.map((leg) => [leg.id, Math.floor(leg.passengers * CONNECTING_SHARE_PER_LEG)]));
  const addGroup = (itinerary, size) => {
    const connections = itinerary.slice(1).map((leg, index) => ({
      airport: leg.origin, minutes: leg.scheduledOffsetMinutes - itinerary[index].arrivalOffsetMinutes, minimumMinutes: minimumConnection(itinerary[index], leg)
    }));
    const group = {
      id: `PG-${String(groups.length + 1).padStart(4, "0")}`, size, flightIds: itinerary.map((leg) => leg.id),
      origin: itinerary[0].origin, finalDestination: itinerary.at(-1).destination, connections
    };
    groups.push(group);
    for (const leg of itinerary) leg.passengerGroupIds.push(group.id);
  };

  const { pairs, triples } = connectingItineraries(legs);
  const itineraries = [...shuffled(random, triples), ...shuffled(random, pairs)];
  // A connecting group of n legs is one passenger but n seats, so people = seats − extra legs flown.
  const seatTotal = legs.reduce((sum, leg) => sum + leg.passengers, 0);
  let connectingPeople = 0, extraSeats = 0;
  const targetReached = () => connectingPeople >= CONNECTING_PASSENGER_SHARE * (seatTotal - extraSeats);
  let added = true;
  while (added && !targetReached()) {
    added = false;
    for (const itinerary of itineraries) {
      if (targetReached()) break;
      const available = Math.min(...itinerary.map((leg) => connectingLeft.get(leg.id)));
      if (available < CONNECTING_GROUP_SIZE[0]) continue;
      const size = Math.min(available, randomInt(random, ...CONNECTING_GROUP_SIZE));
      for (const leg of itinerary) connectingLeft.set(leg.id, connectingLeft.get(leg.id) - size);
      addGroup(itinerary, size);
      connectingPeople += size;
      extraSeats += size * (itinerary.length - 1);
      added = true;
    }
  }

  for (const leg of legs) {
    const connecting = Math.floor(leg.passengers * CONNECTING_SHARE_PER_LEG) - connectingLeft.get(leg.id);
    let remaining = leg.passengers - connecting;
    while (remaining > 0) {
      let size = Math.min(remaining, randomInt(random, ...LOCAL_GROUP_SIZE));
      if (remaining - size < LOCAL_GROUP_SIZE[0] / 2) size = remaining;
      addGroup([leg], size);
      remaining -= size;
    }
  }
  return groups;
}

/**
 * Fuel on board "now" and the endurance it gives, for a leg that is already airborne.
 * Burn is charged for the distance from the origin to the hand-set position, not for elapsed
 * time: the positions are kept as authored and lag their elapsed time (see docs/network-model.md).
 */
function airborneFuel(leg, tail, position, ctx) {
  const flownNm = distanceNm(ctx.airportsByIcao.get(leg.origin), position);
  const onboardKgNow = Math.round(leg.fuel.departureKg - flownNm * tail.burnKgPerNm);
  return { onboardKgNow, fuelMinutes: Math.floor(onboardKgNow / (tail.burnKgPerNm * CRUISE_NM_PER_MIN)) };
}

/** Where a tail is at "now": the destination of a leg in progress, else where it last landed or first departs. */
function locationAtNow(legs) {
  const inProgress = legs.find((leg) => leg.scheduledOffsetMinutes <= 0 && leg.arrivalOffsetMinutes > 0);
  if (inProgress) return inProgress.destination;
  const landed = legs.filter((leg) => leg.arrivalOffsetMinutes <= 0).at(-1);
  return landed ? landed.destination : legs[0].origin;
}

function toFlight(leg, tail, anchor, ctx) {
  const airborne = anchor?.status === "airborne";
  const { onboardKgNow, fuelMinutes } = airborne ? airborneFuel(leg, tail, anchor.position, ctx) : { onboardKgNow: null, fuelMinutes: 0 };
  return {
    id: leg.id, callsign: leg.id, origin: leg.origin, destination: leg.destination,
    ...(airborne ? { position: { ...anchor.position } } : {}),
    passengers: leg.passengers, aircraft: tail.type, aircraftId: tail.id, fuelMinutes,
    status: airborne ? "airborne" : "scheduled", scheduledOffsetMinutes: leg.scheduledOffsetMinutes,
    rotationId: `ROT-${tail.id}`, legNumber: leg.legNumber, dayIndex: Math.max(0, Math.floor(leg.scheduledOffsetMinutes / MINUTES_PER_DAY)),
    anchor: Boolean(anchor), arrivalOffsetMinutes: leg.arrivalOffsetMinutes, blockMinutes: leg.blockMinutes, distanceNm: leg.distanceNm,
    turnBeforeMinutes: leg.turnBeforeMinutes, refuelMinutes: leg.refuelMinutes,
    fuel: { ...leg.fuel, ...(airborne ? { onboardKgNow } : {}) },
    passengerGroupIds: leg.passengerGroupIds, crewAssignmentId: leg.crewAssignmentId, crewDutyMinutesAtArrival: leg.crewDutyMinutesAtArrival
  };
}

/**
 * Generate the full network for a seed. `airports` is the list from src/referenceData.js
 * ({ icao, lat, lon, runwayFt }). Throws if any invariant in validateNetwork fails.
 */
export function generateNetwork({ airports, seed = NETWORK_SEED }) {
  const airportsByIcao = new Map(airports.map((airport) => [airport.icao, airport]));
  const distanceCache = new Map();
  const ctx = {
    random: createRandom(seed), airportsByIcao,
    anchorsById: new Map(ANCHOR_FLIGHTS.map((anchor) => [anchor.id, anchor])),
    servedAirports: new Set(ANCHOR_FLIGHTS.flatMap((anchor) => [anchor.origin, anchor.destination])),
    nm: (a, b) => {
      const key = `${a}>${b}`;
      if (!distanceCache.has(key)) distanceCache.set(key, distanceNm(airportsByIcao.get(a), airportsByIcao.get(b)));
      return distanceCache.get(key);
    }
  };

  const tails = FLEET_PLAN.map(tailProfile);
  const rotations = tails.map((tail) => ({ tail, ...buildRotation(tail, ctx) }));
  assignLegIds(rotations);

  const allLegs = [];
  const crewAssignments = [];
  for (const { tail, legs } of rotations) {
    legs.forEach((leg, index) => {
      const anchor = ctx.anchorsById.get(leg.anchorId);
      const loadFactor = LOAD_FACTOR_RANGE[0] + ctx.random() * (LOAD_FACTOR_RANGE[1] - LOAD_FACTOR_RANGE[0]);
      Object.assign(leg, {
        legNumber: index + 1, tailId: tail.id, category: tail.category, passengerGroupIds: [],
        passengers: anchor ? Math.min(anchor.passengers, tail.seats) : Math.round(tail.seats * loadFactor)
      });
      allLegs.push(leg);
    });
    crewAssignments.push(...buildCrewAssignments(tail, legs));
  }
  const passengerGroups = buildPassengerGroups(allLegs, ctx.random);

  const anchorOrder = new Map(ANCHOR_FLIGHTS.map((anchor, index) => [anchor.id, index]));
  const flights = rotations.flatMap(({ tail, legs }) => legs.map((leg) => toFlight(leg, tail, ctx.anchorsById.get(leg.anchorId), ctx)))
    .sort((a, b) => (anchorOrder.get(a.id) ?? Infinity) - (anchorOrder.get(b.id) ?? Infinity));

  const fleet = rotations.map(({ tail, legs }) => ({
    id: tail.id, type: tail.type, location: locationAtNow(legs), maintenanceDueInHours: tail.hoursRemaining,
    minimumTurnMinutes: tail.minimumTurnMinutes, seats: tail.seats, fuelCapacityKg: tail.fuelCapacityKg, burnKgPerNm: tail.burnKgPerNm,
    maintenance: {
      flightHoursRemaining: tail.hoursRemaining, cyclesRemaining: tail.cyclesRemaining,
      intervalHours: tail.intervalHours, intervalCycles: tail.intervalCycles, checkStations: [...MAINTENANCE_CHECK_STATIONS]
    },
    rotationId: `ROT-${tail.id}`
  }));

  const rotationList = rotations.map(({ tail, legs, maintenanceVisits }) => ({
    id: `ROT-${tail.id}`, tailId: tail.id, flightIds: legs.map((leg) => leg.id),
    maintenanceVisits: maintenanceVisits.map(({ afterLegIndex, ...visit }) => ({ ...visit, afterFlightId: legs[afterLegIndex].id })),
    crewAssignmentIds: crewAssignments.filter((assignment) => assignment.tailId === tail.id).map((assignment) => assignment.id),
    startOffsetMinutes: legs[0].scheduledOffsetMinutes, endOffsetMinutes: legs.at(-1).arrivalOffsetMinutes
  }));

  const network = { seed, flights, fleet, rotations: rotationList, passengerGroups, crewAssignments };
  const problems = validateNetwork(network, airports);
  if (problems.length) throw new Error(`Generated network is invalid:\n- ${problems.join("\n- ")}`);
  return network;
}

/**
 * Check every invariant in docs/network-model.md section 9. Returns a list of readable problems;
 * an empty list means the network is consistent.
 */
export function validateNetwork({ flights, fleet, rotations, passengerGroups, crewAssignments }, airports) {
  const problems = [];
  const flightsById = new Map(flights.map((flight) => [flight.id, flight]));
  const tailsById = new Map(fleet.map((tail) => [tail.id, tail]));
  const airportsByIcao = new Map(airports.map((airport) => [airport.icao, airport]));

  if (flightsById.size !== flights.length) problems.push("Flight IDs are not unique");

  for (const rotation of rotations) {
    const tail = tailsById.get(rotation.tailId);
    const rules = CATEGORY_RULES[AIRCRAFT_TYPES[tail.type].category];
    const legs = rotation.flightIds.map((id) => flightsById.get(id));
    const visitsAfter = new Map(rotation.maintenanceVisits.map((visit) => [visit.afterFlightId, visit]));
    let hoursLeft = tail.maintenance.flightHoursRemaining;
    let cyclesLeft = tail.maintenance.cyclesRemaining;
    legs.forEach((leg, index) => {
      if (leg.aircraft !== tail.type) problems.push(`${leg.id} declares ${leg.aircraft} but ${tail.id} is a ${tail.type}`);
      if (leg.aircraftId !== tail.id) problems.push(`${leg.id} is in ${rotation.id} but assigned to ${leg.aircraftId}`);
      if (leg.fuel.departureKg > tail.fuelCapacityKg) problems.push(`${leg.id} departure fuel exceeds capacity`);
      if (leg.fuel.arrivalKg < leg.fuel.reserveKg) problems.push(`${leg.id} lands below reserve fuel`);
      const previous = legs[index - 1];
      if (previous) {
        if (previous.destination !== leg.origin) problems.push(`${leg.id} departs ${leg.origin} but ${tail.id} is at ${previous.destination}`);
        const visit = visitsAfter.get(previous.id);
        const minimumGround = tail.minimumTurnMinutes + leg.refuelMinutes + (visit ? MAINTENANCE_CHECK_MINUTES : 0);
        if (leg.scheduledOffsetMinutes - previous.arrivalOffsetMinutes < minimumGround) problems.push(`${leg.id} turn is shorter than ${minimumGround} min`);
        if (visit) {
          if (!MAINTENANCE_CHECK_STATIONS.includes(visit.station) || visit.station !== previous.destination) problems.push(`${visit.id} is not at a check station on the rotation`);
          hoursLeft = tail.maintenance.intervalHours;
          cyclesLeft = tail.maintenance.intervalCycles;
        }
      }
      hoursLeft -= (leg.scheduledOffsetMinutes < 0 ? Math.max(0, leg.arrivalOffsetMinutes) : leg.blockMinutes) / 60;
      cyclesLeft -= 1;
      if (hoursLeft < 0 || cyclesLeft < 0) problems.push(`${tail.id} passes its maintenance limit on ${leg.id}`);
      if (leg.passengers > tail.seats) problems.push(`${leg.id} has ${leg.passengers} passengers for ${tail.seats} seats`);
    });
    if (rules.maxDutyMinutes < Math.max(...crewAssignments.filter((crew) => crew.tailId === tail.id).map((crew) => crew.dutyMinutes))) {
      problems.push(`${tail.id} has a crew assignment past ${rules.maxDutyMinutes} min duty`);
    }
  }

  const groupsById = new Map(passengerGroups.map((group) => [group.id, group]));
  for (const flight of flights) {
    const total = flight.passengerGroupIds.reduce((sum, id) => sum + groupsById.get(id).size, 0);
    if (total !== flight.passengers) problems.push(`${flight.id} passengers ${flight.passengers} but groups sum to ${total}`);
  }
  for (const group of passengerGroups) {
    const legs = group.flightIds.map((id) => flightsById.get(id));
    legs.slice(1).forEach((leg, index) => {
      const previous = legs[index];
      const gap = leg.scheduledOffsetMinutes - previous.arrivalOffsetMinutes;
      const widebody = [previous, leg].some((item) => AIRCRAFT_TYPES[item.aircraft].category === "widebody");
      const minimum = CATEGORY_RULES[widebody ? "widebody" : "narrowbody"].minimumConnectionMinutes;
      if (previous.destination !== leg.origin) problems.push(`${group.id} does not connect at a shared airport`);
      if (previous.aircraftId === leg.aircraftId) problems.push(`${group.id} connects on the same aircraft`);
      if (gap < minimum) problems.push(`${group.id} connection at ${leg.origin} is ${gap} min, below ${minimum}`);
    });
  }

  const served = new Set(flights.flatMap((flight) => [flight.origin, flight.destination]));
  for (const airport of airports) if (!served.has(airport.icao)) problems.push(`${airport.icao} has no flights`);

  for (const anchor of ANCHOR_FLIGHTS) {
    const flight = flightsById.get(anchor.id);
    if (!flight || flight.origin !== anchor.origin || flight.destination !== anchor.destination) { problems.push(`${anchor.id} is missing or changed route`); continue; }
    if (anchor.status === "airborne") {
      if (flight.scheduledOffsetMinutes !== anchor.scheduledOffsetMinutes) problems.push(`${anchor.id} airborne departure moved`);
      const burnKgPerNm = tailsById.get(flight.aircraftId).burnKgPerNm;
      const neededKg = burnKgPerNm * distanceNm(flight.position, airportsByIcao.get(flight.destination)) + flight.fuel.reserveKg;
      if (flight.fuel.onboardKgNow < neededKg) problems.push(`${anchor.id} fuel on board (${flight.fuel.onboardKgNow} kg) cannot reach ${flight.destination} from its position with reserve (${Math.round(neededKg)} kg)`);
    } else if (flight.scheduledOffsetMinutes < anchor.scheduledOffsetMinutes || flight.scheduledOffsetMinutes >= ANCHOR_LATEST_DEPARTURE_MINUTES) {
      problems.push(`${anchor.id} departs at ${flight.scheduledOffsetMinutes} min, outside ${anchor.scheduledOffsetMinutes}-${ANCHOR_LATEST_DEPARTURE_MINUTES}`);
    }
  }
  return problems;
}
