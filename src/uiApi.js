import { airports, flights } from "./data.js";

/**
 * Adapter between the operational snapshot and the globe UI contract in UI/src/types.ts.
 * The UI speaks IATA codes and [lat, lng] paths; the planning engine speaks ICAO and waypoint objects.
 */

const ICAO_TO_IATA = {
  KJFK: "JFK", KBOS: "BOS", KIAD: "IAD", KORD: "ORD", KDEN: "DEN", KLAX: "LAX", KSFO: "SFO", KSEA: "SEA",
  EGLL: "LHR", LFPG: "CDG", EDDF: "FRA", LTFM: "IST", OMDB: "DXB", VABB: "BOM", WSSS: "SIN", RJTT: "HND",
  KATL: "ATL", KDFW: "DFW", KMIA: "MIA", CYYZ: "YYZ", MMMX: "MEX", SBGR: "GRU", EHAM: "AMS", LEMD: "MAD",
  LIRF: "FCO", FAOR: "JNB", HECA: "CAI", VIDP: "DEL", VTBS: "BKK", VHHH: "HKG", RKSI: "ICN", YSSY: "SYD"
};
const ICAO_PATTERN = new RegExp(`\\b(${Object.keys(ICAO_TO_IATA).join("|")})\\b`, "g");

// When two disruption events touch the same flight, the most disruptive plan is the one shown.
const ACTION_PRIORITY = { cancel: 0, reroute: 1, hold_for_human_review: 2, delay: 3 };
const SEVERITY_SCORE = { severe: 0.9, moderate: 0.6, minor: 0.3 };

const toIata = (icao) => ICAO_TO_IATA[icao] || icao;
const withIata = (text) => (text || "").replace(ICAO_PATTERN, (code) => ICAO_TO_IATA[code]);
const byIcao = (icao) => airports.find((item) => item.icao === icao);
const toPath = (waypoints) => waypoints.map((point) => [point.lat, point.lon]);

function airportView(airport) {
  return { code: toIata(airport.icao), icao: airport.icao, name: airport.name, city: airport.city, lat: airport.lat, lng: airport.lon };
}

function uiStatus(plan) {
  if (plan.approvalStatus === "approved") return "rerouted";
  if (plan.approvalStatus === "rejected" || plan.action === "hold_for_human_review") return "disrupted";
  return "rerouting";
}

function routeSummary(waypoints) {
  return waypoints.filter((point) => point.icao).map((point) => toIata(point.icao)).join(" → ");
}

function primaryPlans(snapshot) {
  const chosen = new Map();
  for (const plan of snapshot.plans) {
    const current = chosen.get(plan.flightId);
    if (!current || ACTION_PRIORITY[plan.action] < ACTION_PRIORITY[current.action]) chosen.set(plan.flightId, plan);
  }
  return chosen;
}

function affectedFlight(flight, plan) {
  const { before, after, deltas } = plan.comparison;
  const marker = flight.position || byIcao(flight.origin);
  return {
    id: flight.id,
    callsign: flight.callsign,
    origin: toIata(flight.origin),
    destination: toIata(flight.destination),
    status: uiStatus(plan),
    originalPath: toPath(before.waypoints),
    proposedPath: toPath(after.waypoints),
    delayMinutes: Math.max(0, deltas.arrivalChangeMinutes),
    passengers: flight.passengers,
    lat: marker.lat,
    lng: marker.lon,
    planId: plan.id,
    action: plan.action,
    approvalStatus: plan.approvalStatus,
    originAirport: airportView(byIcao(flight.origin)),
    destinationAirport: airportView(byIcao(flight.destination)),
    originalRoute: routeSummary(before.waypoints),
    proposedRoute: routeSummary(after.waypoints),
    waypoints: after.waypoints.map((point) => ({ code: point.icao ? toIata(point.icao) : null, name: point.name, city: point.city, kind: point.kind, lat: point.lat, lng: point.lon })),
    changes: { timing: withIata(deltas.timing), aircraft: withIata(deltas.aircraft), layover: withIata(deltas.layover) },
    aircraft: { before: deltas.fromAircraft, after: deltas.toAircraft, swapped: deltas.aircraftSwapped, swapAt: deltas.swapAt ? toIata(deltas.swapAt) : null },
    stops: after.stops.map((stop) => ({ code: toIata(stop.icao), city: stop.city, groundMinutes: stop.groundMinutes, arrivalAt: stop.arrivalAt, departureAt: stop.departureAt, reason: withIata(stop.reason) })),
    schedule: {
      before: { departureAt: before.departureAt, arrivalAt: before.arrivalAt, blockMinutes: before.blockMinutes },
      after: { departureAt: after.departureAt, arrivalAt: after.arrivalAt, blockMinutes: after.blockMinutes }
    },
    requiredChecks: plan.requiredChecks
  };
}

function unaffectedFlight(flight) {
  const origin = byIcao(flight.origin), destination = byIcao(flight.destination);
  const marker = flight.position || origin;
  const path = [[origin.lat, origin.lon], [destination.lat, destination.lon]];
  return {
    id: flight.id, callsign: flight.callsign, origin: toIata(flight.origin), destination: toIata(flight.destination),
    status: "ok", originalPath: path, proposedPath: path, delayMinutes: 0, passengers: flight.passengers, lat: marker.lat, lng: marker.lon,
    originAirport: airportView(origin), destinationAirport: airportView(destination),
    originalRoute: `${toIata(flight.origin)} → ${toIata(flight.destination)}`, proposedRoute: `${toIata(flight.origin)} → ${toIata(flight.destination)}`
  };
}

/** Every network flight in UI shape; flights outside the disruption are returned with status "ok". */
export function toUiFlights(snapshot) {
  const plans = primaryPlans(snapshot);
  return flights.map((flight) => (plans.has(flight.id) ? affectedFlight(flight, plans.get(flight.id)) : unaffectedFlight(flight)));
}

/** The active scenario as the UI's single Incident. */
export function toUiIncident(snapshot) {
  const plans = [...primaryPlans(snapshot).values()];
  const decided = plans.filter((plan) => plan.approvalStatus !== "pending").length;
  const approved = plans.filter((plan) => plan.approvalStatus === "approved").length;
  const events = snapshot.activeEvents.map((event) => `${event.type} centered on ${toIata(event.airport)} (${event.radiusNm} NM, ${event.severity})`);
  const centerAirport = byIcao(snapshot.activeEvents[0]?.airport);
  return {
    id: `SCN-${snapshot.refreshNumber + 1}`,
    name: snapshot.scenario,
    region: [...new Set(snapshot.affectedAirports.map((airport) => airport.city))].join(" · ") || "No airports inside the disruption area",
    severity: Math.max(0, ...snapshot.activeEvents.map((event) => SEVERITY_SCORE[event.severity] ?? 0.5)),
    startedAt: snapshot.refreshedAt,
    summary: `${events.join("; ")}. ${plans.length} flight(s) need a recovery decision.`,
    recoveryProgress: plans.length ? decided / plans.length : 1,
    statusLine: `${approved} of ${plans.length} recovery plans approved · human review required`,
    center: centerAirport ? { lat: centerAirport.lat, lng: centerAirport.lon } : null,
    scenarioNumber: snapshot.refreshNumber + 1,
    notice: snapshot.notice
  };
}

/**
 * Record an accept/reject decision on every plan for the flight.
 * Returns null when the flight has no plan in the current scenario.
 */
export function decideFlight(snapshot, flightId, decision, decidedBy = "unattributed-operator") {
  const plans = snapshot.plans.filter((plan) => plan.flightId === flightId);
  if (!plans.length) return null;
  const decidedAt = new Date().toISOString();
  for (const plan of plans) {
    plan.approvalStatus = decision === "accept" ? "approved" : "rejected";
    plan.decidedAt = decidedAt;
    plan.decidedBy = decidedBy;
  }
  return toUiFlights(snapshot).find((flight) => flight.id === flightId);
}
