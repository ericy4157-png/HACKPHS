/**
 * Hand-authored inputs to the multi-day network generator (docs/network-model.md).
 *
 * Everything here is reviewable by hand: the seed, the fleet with its starting maintenance state,
 * the 33 anchor flights (the flights the demo always had), and which tail flies each anchor.
 * src/networkGenerator.js builds the rest of the network around these.
 */

export const NETWORK_SEED = 20261010;

/** Rotations are generated until a tail has this many legs. */
export const LEGS_PER_TAIL = { widebody: [12, 12], narrowbody: [13, 15] };

/**
 * Tails in generation order. The 7 original tails keep today's maintenanceDueInHours as their
 * flight hours remaining at "now"; the 8 new tails have hand-set values between 20 and 45.
 * `anchors` is the order in which the tail flies its anchor flights.
 */
export const FLEET_PLAN = [
  { id: "N901SK", type: "A350-900", region: "global", hoursRemaining: 42, cyclesRemaining: 11, anchors: ["SKY101"] },
  { id: "N904SK", type: "A350-900", region: "global", hoursRemaining: 64, cyclesRemaining: 14, anchors: ["SKY118"] },
  { id: "N902SK", type: "B787-9", region: "global", hoursRemaining: 11, cyclesRemaining: 6, anchors: ["SKY204", "SKY709"] },
  { id: "N908SK", type: "B787-9", region: "global", hoursRemaining: 38, cyclesRemaining: 13, anchors: ["SKY821", "SKY715"] },
  { id: "N909SK", type: "B787-9", region: "global", hoursRemaining: 30, cyclesRemaining: 12, anchors: ["SKY219"] },
  { id: "N910SK", type: "B787-9", region: "global", hoursRemaining: 44, cyclesRemaining: 15, anchors: ["SKY705"] },
  { id: "N903SK", type: "A321neo", region: "americas", hoursRemaining: 27, cyclesRemaining: 22, anchors: ["SKY305", "SKY311"] },
  { id: "N911SK", type: "A321neo", region: "americas", hoursRemaining: 35, cyclesRemaining: 26, anchors: ["SKY820", "SKY702", "SKY716"] },
  { id: "N914SK", type: "A321neo", region: "americas", hoursRemaining: 41, cyclesRemaining: 28, anchors: ["SKY700", "SKY703", "SKY704"] },
  { id: "N905SK", type: "A320neo", region: "americas", hoursRemaining: 19, cyclesRemaining: 17, anchors: ["SKY412", "SKY413"] },
  { id: "N907SK", type: "B737-8", region: "americas", hoursRemaining: 31, cyclesRemaining: 24, anchors: ["SKY610", "SKY611", "SKY701"] },
  { id: "N906SK", type: "A321neo", region: "europe", hoursRemaining: 6, cyclesRemaining: 9, anchors: ["SKY822", "SKY706", "SKY707", "SKY717"] },
  { id: "N912SK", type: "A321neo", region: "europe", hoursRemaining: 24, cyclesRemaining: 20, anchors: ["SKY512", "SKY513", "SKY708", "SKY710"] },
  { id: "N915SK", type: "A321neo", region: "asia", hoursRemaining: 33, cyclesRemaining: 25, anchors: ["SKY711"] },
  { id: "N916SK", type: "A321neo", region: "asia", hoursRemaining: 22, cyclesRemaining: 19, anchors: ["SKY712", "SKY713", "SKY714"] }
];

/**
 * The 33 flights the demo has always had. ID, route and passenger count are kept (passengers are
 * capped to the tail's seats). Airborne anchors also keep their departure time and position.
 * Scheduled anchors depart at this time or later, whenever their tail is ready.
 */
export const ANCHOR_FLIGHTS = [
  { id: "SKY101", origin: "KJFK", destination: "EGLL", passengers: 284, status: "airborne", scheduledOffsetMinutes: -170, position: { lat: 48.1, lon: -38.4 } },
  { id: "SKY204", origin: "EGLL", destination: "OMDB", passengers: 231, status: "airborne", scheduledOffsetMinutes: -245, position: { lat: 43.4, lon: 20.1 } },
  { id: "SKY305", origin: "KORD", destination: "KLAX", passengers: 178, status: "airborne", scheduledOffsetMinutes: -105, position: { lat: 41.0, lon: -96.0 } },
  { id: "SKY118", origin: "EGLL", destination: "KJFK", passengers: 287, status: "scheduled", scheduledOffsetMinutes: 85 },
  { id: "SKY219", origin: "OMDB", destination: "EGLL", passengers: 244, status: "scheduled", scheduledOffsetMinutes: 190 },
  { id: "SKY311", origin: "KLAX", destination: "KORD", passengers: 181, status: "scheduled", scheduledOffsetMinutes: 155 },
  { id: "SKY412", origin: "KSEA", destination: "KSFO", passengers: 151, status: "scheduled", scheduledOffsetMinutes: 45 },
  { id: "SKY413", origin: "KSFO", destination: "KSEA", passengers: 149, status: "scheduled", scheduledOffsetMinutes: 190 },
  { id: "SKY512", origin: "LFPG", destination: "LTFM", passengers: 168, status: "scheduled", scheduledOffsetMinutes: 70 },
  { id: "SKY513", origin: "LTFM", destination: "LFPG", passengers: 166, status: "scheduled", scheduledOffsetMinutes: 225 },
  { id: "SKY610", origin: "KDEN", destination: "KJFK", passengers: 175, status: "scheduled", scheduledOffsetMinutes: 120 },
  { id: "SKY611", origin: "KJFK", destination: "KDEN", passengers: 171, status: "scheduled", scheduledOffsetMinutes: 325 },
  { id: "SKY820", origin: "KDFW", destination: "KMIA", passengers: 176, status: "airborne", scheduledOffsetMinutes: -95, position: { lat: 29.3, lon: -87.2 } },
  { id: "SKY821", origin: "VHHH", destination: "RJTT", passengers: 242, status: "airborne", scheduledOffsetMinutes: -135, position: { lat: 30.1, lon: 125.4 } },
  { id: "SKY822", origin: "LFPG", destination: "LIRF", passengers: 169, status: "airborne", scheduledOffsetMinutes: -65, position: { lat: 43.1, lon: 8.3 } },
  { id: "SKY700", origin: "KATL", destination: "KJFK", passengers: 112, status: "scheduled", scheduledOffsetMinutes: 55 },
  { id: "SKY701", origin: "KDFW", destination: "KLAX", passengers: 125, status: "scheduled", scheduledOffsetMinutes: 83 },
  { id: "SKY702", origin: "KMIA", destination: "KATL", passengers: 138, status: "scheduled", scheduledOffsetMinutes: 111 },
  { id: "SKY703", origin: "CYYZ", destination: "KORD", passengers: 151, status: "scheduled", scheduledOffsetMinutes: 139 },
  { id: "SKY704", origin: "MMMX", destination: "KDFW", passengers: 164, status: "scheduled", scheduledOffsetMinutes: 167 },
  { id: "SKY705", origin: "SBGR", destination: "KMIA", passengers: 177, status: "scheduled", scheduledOffsetMinutes: 195 },
  { id: "SKY706", origin: "EHAM", destination: "EGLL", passengers: 190, status: "scheduled", scheduledOffsetMinutes: 223 },
  { id: "SKY707", origin: "LEMD", destination: "LFPG", passengers: 203, status: "scheduled", scheduledOffsetMinutes: 251 },
  { id: "SKY708", origin: "LIRF", destination: "EDDF", passengers: 216, status: "scheduled", scheduledOffsetMinutes: 279 },
  { id: "SKY709", origin: "FAOR", destination: "OMDB", passengers: 229, status: "scheduled", scheduledOffsetMinutes: 307 },
  { id: "SKY710", origin: "HECA", destination: "LTFM", passengers: 242, status: "scheduled", scheduledOffsetMinutes: 335 },
  { id: "SKY711", origin: "VIDP", destination: "OMDB", passengers: 255, status: "scheduled", scheduledOffsetMinutes: 363 },
  { id: "SKY712", origin: "VTBS", destination: "WSSS", passengers: 268, status: "scheduled", scheduledOffsetMinutes: 391 },
  { id: "SKY713", origin: "VHHH", destination: "RJTT", passengers: 116, status: "scheduled", scheduledOffsetMinutes: 419 },
  { id: "SKY714", origin: "RKSI", destination: "RJTT", passengers: 129, status: "scheduled", scheduledOffsetMinutes: 447 },
  { id: "SKY715", origin: "YSSY", destination: "WSSS", passengers: 142, status: "scheduled", scheduledOffsetMinutes: 475 },
  { id: "SKY716", origin: "KJFK", destination: "CYYZ", passengers: 155, status: "scheduled", scheduledOffsetMinutes: 503 },
  { id: "SKY717", origin: "EGLL", destination: "EHAM", passengers: 168, status: "scheduled", scheduledOffsetMinutes: 531 }
];

/** Airports each region's narrowbodies may serve. Widebodies ("global") may serve all 32. */
export const REGION_AIRPORTS = {
  americas: ["KJFK", "KBOS", "KIAD", "KORD", "KDEN", "KLAX", "KSFO", "KSEA", "KATL", "KDFW", "KMIA", "CYYZ", "MMMX"],
  europe: ["EGLL", "LFPG", "EDDF", "LTFM", "EHAM", "LEMD", "LIRF", "HECA"],
  asia: ["OMDB", "VABB", "VIDP", "WSSS", "VTBS", "VHHH", "RJTT", "RKSI"]
};

/** Generated (non-anchor) legs prefer sectors in this distance band, in nautical miles. */
export const FILLER_DISTANCE_BAND_NM = { widebody: [900, 3200], narrowbody: [450, 1400] };

/** Remaining flight hours below which a tail takes its check at the next check station. */
export const MAINTENANCE_THRESHOLD_HOURS = { widebody: 16, narrowbody: 10 };
export const MAINTENANCE_THRESHOLD_CYCLES = 4;

/** Scheduled anchors must still depart inside day 1. */
export const ANCHOR_LATEST_DEPARTURE_MINUTES = 24 * 60;

/**
 * Passenger itinerary shape: the target share of all passengers on connecting groups, the most
 * of any one leg's passengers that may be connecting, the longest connection, and group sizes.
 * With schedules fixed, 15 tails at 32 airports give few same-airport connections between
 * different aircraft, so reaching about 20% needs connections of up to 10 hours and up to 70%
 * of a leg connecting.
 */
export const CONNECTING_PASSENGER_SHARE = 0.20;
export const CONNECTING_SHARE_PER_LEG = 0.7;
export const MAX_CONNECTION_MINUTES = 600;
export const CONNECTING_GROUP_SIZE = [8, 40];
export const LOCAL_GROUP_SIZE = [20, 80];
