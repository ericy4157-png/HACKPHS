/**
 * Aircraft runway categories and swap families for the Skyward prototype.
 *
 * These are simplified prototype values, not real performance data. Real runway requirements
 * depend on weight, temperature, elevation, wind, runway condition and the operator's manuals;
 * dispatch must validate every diversion. The two runway minimums are the values the planner
 * has always used, now kept in one place.
 */

export const RUNWAY_CATEGORIES = {
  widebody: { minimumRunwayFt: 8500 },
  narrowbody: { minimumRunwayFt: 6000 }
};

/** Types are swap-compatible only within the same family (shared type rating in this model). */
export const AIRCRAFT_TYPES = {
  "A350-900": { category: "widebody", family: "A350" },
  "B787-9": { category: "widebody", family: "B787" },
  "A321neo": { category: "narrowbody", family: "A320" },
  "A320neo": { category: "narrowbody", family: "A320" },
  "B737-8": { category: "narrowbody", family: "B737" }
};

const STRICTEST_CATEGORY = "widebody";

/*
 * Network-generation values (docs/network-model.md, section 5).
 * Simplified prototype values, not real performance, maintenance or crew-duty data. They are
 * sized so every leg in the demo network is flyable and every rule can be checked in tests.
 */

/** Seats, fuel and minimum turn per type. Burn is a flat cruise average in kg per nautical mile. */
export const TYPE_PERFORMANCE = {
  "A350-900": { seats: 315, fuelCapacityKg: 110_000, burnKgPerNm: 24, minimumTurnMinutes: 105 },
  "B787-9": { seats: 290, fuelCapacityKg: 100_000, burnKgPerNm: 22, minimumTurnMinutes: 95 },
  "A321neo": { seats: 220, fuelCapacityKg: 24_000, burnKgPerNm: 11, minimumTurnMinutes: 55 },
  "A320neo": { seats: 180, fuelCapacityKg: 20_000, burnKgPerNm: 9.5, minimumTurnMinutes: 50 },
  "B737-8": { seats: 180, fuelCapacityKg: 20_500, burnKgPerNm: 10, minimumTurnMinutes: 50 }
};

/** Per-category rules: refuel rate, maintenance interval and maximum crew duty. */
export const CATEGORY_RULES = {
  widebody: { refuelKgPerMinute: 2000, intervalHours: 80, intervalCycles: 15, maxDutyMinutes: 17 * 60, minimumConnectionMinutes: 90 },
  narrowbody: { refuelKgPerMinute: 1000, intervalHours: 50, intervalCycles: 30, maxDutyMinutes: 13 * 60, minimumConnectionMinutes: 60 }
};

export const CRUISE_NM_PER_MIN = 8.2;
export const TAXI_MINUTES = 20;
export const CONTINGENCY_FRACTION = 0.05;
export const RESERVE_MINUTES = 45;
export const MAINTENANCE_CHECK_MINUTES = 8 * 60;
export const MAINTENANCE_CHECK_STATIONS = ["KJFK", "KORD", "KDFW", "KATL", "KLAX", "EGLL", "LFPG", "EDDF", "LTFM", "OMDB", "VHHH", "WSSS", "RJTT"];
/** Baseline day: the tails closest to a maintenance limit each lose one departure to an unscheduled snag. */
export const BASELINE_MAINTENANCE_TAILS = 3;
export const UNSCHEDULED_MAINTENANCE_DELAY_MINUTES = 75;
/** Live ops clock: wall tick → sim minutes advanced; keep about this many ordinary (non-disaster) ops issues open. */
export const OPS_TICK_WALL_MS = 12_000;
export const OPS_TICK_SIM_MINUTES = 5;
export const OPS_MINI_TARGET_OPEN = 2;
export const OPS_MINI_DELAY_MINUTES = [20, 35, 45, 60, 75, 90];
export const OPS_SESSION_SEED = 42;
export const CREW_REPORT_MINUTES = 60;
export const CREW_RELEASE_MINUTES = 30;
export const LOAD_FACTOR_RANGE = [0.65, 0.95];

/** Block time for a sector: the planner's long-standing cruise and taxi approximation. */
export function blockMinutesFor(distanceNm) {
  return Math.round(distanceNm / CRUISE_NM_PER_MIN) + TAXI_MINUTES;
}

/**
 * Fuel for one sector: trip burn, 5% contingency and a 45-minute reserve at cruise burn.
 * Arrival fuel is what remains on landing (contingency plus reserve).
 */
export function sectorFuel(aircraftType, distanceNm) {
  const { burnKgPerNm } = TYPE_PERFORMANCE[aircraftType];
  const tripKg = Math.round(distanceNm * burnKgPerNm);
  const contingencyKg = Math.round(tripKg * CONTINGENCY_FRACTION);
  const reserveKg = Math.round(RESERVE_MINUTES * CRUISE_NM_PER_MIN * burnKgPerNm);
  const departureKg = tripKg + contingencyKg + reserveKg;
  return { departureKg, tripKg, contingencyKg, reserveKg, arrivalKg: departureKg - tripKg };
}

/** Longest sector a type can fly with full tanks under the sector fuel rule. */
export function maxRangeNm(aircraftType) {
  const { fuelCapacityKg, burnKgPerNm } = TYPE_PERFORMANCE[aircraftType];
  const reserveKg = RESERVE_MINUTES * CRUISE_NM_PER_MIN * burnKgPerNm;
  return (fuelCapacityKg - reserveKg) / (burnKgPerNm * (1 + CONTINGENCY_FRACTION));
}

/** Category of a known type; unknown types are not expected here. */
export function categoryOf(aircraftType) {
  return AIRCRAFT_TYPES[aircraftType].category;
}

/**
 * Minimum runway length for an aircraft type.
 * Unknown types get the stricter (widebody) requirement rather than a guess.
 */
export function runwayRequirement(aircraftType) {
  const known = AIRCRAFT_TYPES[aircraftType];
  const category = known ? known.category : STRICTEST_CATEGORY;
  return {
    aircraftType: aircraftType ?? null,
    category,
    requiredRunwayFt: RUNWAY_CATEGORIES[category].minimumRunwayFt,
    basis: known ? "type category" : "unknown type, stricter category applied"
  };
}

/**
 * Whether a tail of `candidateType` may replace one of `currentType`, with a readable reason.
 * Unknown types are compatible only with the identical type string.
 */
export function swapCompatibility(currentType, candidateType) {
  if (currentType === candidateType) {
    return { compatible: true, reason: `Same type (${currentType}).` };
  }
  const current = AIRCRAFT_TYPES[currentType];
  const candidate = AIRCRAFT_TYPES[candidateType];
  if (!current || !candidate) {
    return { compatible: false, reason: `${currentType} and ${candidateType} differ and at least one type is not in the compatibility table.` };
  }
  if (current.family === candidate.family) {
    return { compatible: true, reason: `${currentType} and ${candidateType} are both ${current.family} family. Seat capacity is checked separately by the swap search.` };
  }
  return { compatible: false, reason: `${currentType} (${current.family} family) and ${candidateType} (${candidate.family} family) are not interchangeable.` };
}
