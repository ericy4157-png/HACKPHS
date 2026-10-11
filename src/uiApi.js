import { airports, flights, networkIndex } from "./data.js";
import { getReferenceAirport } from "./referenceData.js";
import { DEFAULT_WINDOW_HOURS, flightsInWindow } from "./simulation.js";

/**
 * Adapter between the operational snapshot and the globe UI contract in UI/src/types.ts.
 * The UI speaks IATA codes and [lat, lng] paths; the planning engine speaks ICAO and waypoint objects.
 */

/** ICAO → IATA from the reference snapshot (and a built-in fallback for network airports). */
const ICAO_TO_IATA = Object.fromEntries(
  airports.map((airport) => {
    const iata = getReferenceAirport(airport.icao)?.iata;
    return [airport.icao, iata || airport.icao];
  })
);
const ICAO_PATTERN = new RegExp(`\\b(${Object.keys(ICAO_TO_IATA).join("|")})\\b`, "g");

// When two disruption events touch the same flight, the most disruptive plan is the one shown.
const ACTION_PRIORITY = { cancel: 0, reroute: 1, hold_for_human_review: 2, delay: 3 };
const SEVERITY_SCORE = { severe: 0.9, moderate: 0.6, minor: 0.3 };

const toIata = (icao) => ICAO_TO_IATA[icao] || icao;
const withIata = (text) => (text || "").replace(ICAO_PATTERN, (code) => ICAO_TO_IATA[code]);
const byIcao = (icao) => networkIndex.airportByIcao.get(icao);
const toPath = (waypoints) => waypoints.map((point) => [point.lat, point.lon]);
const clockAt = (offsetMinutes) => new Date(Date.now() + offsetMinutes * 60_000).toISOString();

/** Additive roster fields for the spreadsheet. Existing UI keys keep their meanings. */
function rosterOf(flight) {
  const legs = networkIndex.legsByTail.get(flight.aircraftId) || [];
  const index = legs.findIndex((leg) => leg.id === flight.id);
  const nextRefuel = legs.slice(Math.max(0, index + 1)).find((leg) => (leg.refuelMinutes || 0) > 0);
  return {
    aircraftId: flight.aircraftId || null,
    aircraftType: flight.aircraft || null,
    departureAt: Number.isFinite(flight.scheduledOffsetMinutes) ? clockAt(flight.scheduledOffsetMinutes) : null,
    arrivalAt: Number.isFinite(flight.arrivalOffsetMinutes) ? clockAt(flight.arrivalOffsetMinutes) : null,
    blockMinutes: flight.blockMinutes ?? null,
    refuelMinutes: flight.refuelMinutes ?? 0,
    nextRefuel: nextRefuel
      ? {
          flightId: nextRefuel.id,
          minutes: nextRefuel.refuelMinutes,
          departureAt: clockAt(nextRefuel.scheduledOffsetMinutes),
        }
      : null,
    fuel: flight.fuel
      ? {
          departureKg: flight.fuel.departureKg,
          arrivalKg: flight.fuel.arrivalKg,
          reserveKg: flight.fuel.reserveKg,
          onboardKgNow: flight.fuel.onboardKgNow ?? null,
        }
      : null,
    fuelMinutes: flight.fuelMinutes ?? 0,
    legNumber: flight.legNumber ?? null,
    tripsOnTail: legs.length || 1,
    rotationId: flight.rotationId || null,
    opsStatus: flight.status,
  };
}

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
    requiredChecks: plan.requiredChecks,
    diversionRunway: diversionRunwayView(plan.plan.diversionRunwayCheck),
    swapCheck: deltas.swapCheck,
    layers: plan.layers,
    planRevision: plan.planRevision,
    supersededReason: plan.supersededReason || undefined,
    passengerMinutes: plan.passengerMinutes,
    label: plan.label,
    alternatives: plan.approvalStatus === "pending" && plan.alternatives?.length
      ? plan.alternatives.map((alt) => slimAlternative(flight, alt))
      : undefined,
    ...rosterOf(flight)
  };
}

/** Compact future for the picker and globe preview. */
function slimAlternative(flight, plan) {
  const row = affectedFlight({ ...flight }, { ...plan, alternatives: undefined });
  return {
    planId: plan.id,
    action: row.action,
    delayMinutes: row.delayMinutes,
    proposedPath: row.proposedPath,
    proposedRoute: row.proposedRoute,
    passengerMinutes: plan.passengerMinutes ?? row.passengerMinutes,
    label: plan.label,
    layers: row.layers,
    aircraft: row.aircraft
  };
}

/** Runway figures the chosen diversion was checked against; undefined (omitted) unless the plan diverts. */
function diversionRunwayView(check) {
  if (!check) return undefined;
  const { airport, longestRunwayFt, requiredRunwayFt, aircraftType, category, basis, runwaySource } = check;
  return { code: toIata(airport), icao: airport, longestRunwayFt, requiredRunwayFt, aircraftType, category, basis, runwaySource };
}

function unaffectedFlight(flight) {
  const origin = byIcao(flight.origin), destination = byIcao(flight.destination);
  const marker = flight.position || origin;
  const path = [[origin.lat, origin.lon], [destination.lat, destination.lon]];
  return {
    id: flight.id, callsign: flight.callsign, origin: toIata(flight.origin), destination: toIata(flight.destination),
    status: "ok", originalPath: path, proposedPath: path, delayMinutes: 0, passengers: flight.passengers, lat: marker.lat, lng: marker.lon,
    originAirport: airportView(origin), destinationAirport: airportView(destination),
    originalRoute: `${toIata(flight.origin)} → ${toIata(flight.destination)}`, proposedRoute: `${toIata(flight.origin)} → ${toIata(flight.destination)}`,
    ...rosterOf(flight)
  };
}

/** Compact marker for flights that do not need a recovery plan in the active window. */
function compactFlight(flight, inWindow) {
  const origin = byIcao(flight.origin);
  const marker = flight.position || origin;
  return {
    id: flight.id,
    callsign: flight.callsign,
    origin: toIata(flight.origin),
    destination: toIata(flight.destination),
    status: "ok",
    lat: marker.lat,
    lng: marker.lon,
    passengers: flight.passengers,
    dayIndex: flight.dayIndex,
    inWindow,
    compact: true,
    ...rosterOf(flight)
  };
}

/**
 * Every network flight in UI shape; flights outside the disruption are returned with status "ok".
 * `dayIndex` (0 = the next 24 hours) and `inWindow` (inside the longest active event window) let
 * the UI filter the multi-day network later.
 *
 * Optional `scope`:
 * - undefined / "full" (default): every flight in full detail (unchanged contract)
 * - "active": full detail for planned or in-window flights; compact markers for the rest
 * - "roster": every flight with schedule/fuel/tail fields, without heavy waypoint paths
 */
export function toUiFlights(snapshot, { scope } = {}) {
  const plans = primaryPlans(snapshot);
  const eventWindows = snapshot.activeEvents.map((event) => event.windowHours ?? DEFAULT_WINDOW_HOURS);
  const windowHours = eventWindows.length ? Math.max(...eventWindows) : DEFAULT_WINDOW_HOURS;
  const inWindow = new Set(flightsInWindow(windowHours).map((flight) => flight.id));
  const activeOnly = scope === "active";
  const rosterOnly = scope === "roster";
  return flights.map((flight) => {
    const windowed = inWindow.has(flight.id);
    const planned = plans.has(flight.id)
      ? { ...affectedFlight(flight, plans.get(flight.id)), dayIndex: flight.dayIndex, inWindow: windowed }
      : null;
    if (rosterOnly) {
      const row = planned || { ...unaffectedFlight(flight), dayIndex: flight.dayIndex, inWindow: windowed };
      const { originalPath, proposedPath, waypoints, alternatives, ...rest } = row;
      return rest;
    }
    if (planned) return planned;
    if (activeOnly && !windowed) return compactFlight(flight, false);
    return { ...unaffectedFlight(flight), dayIndex: flight.dayIndex, inWindow: windowed };
  });
}

/** One flight in full UI detail, or null when the id is unknown. */
export function toUiFlight(snapshot, flightId) {
  return toUiFlights(snapshot).find((flight) => flight.id === flightId) ?? null;
}

/** The active scenario as the UI's single Incident. */
export function toUiIncident(snapshot) {
  const plans = [...primaryPlans(snapshot).values()];
  const decided = plans.filter((plan) => plan.approvalStatus !== "pending").length;
  const approved = plans.filter((plan) => plan.approvalStatus === "approved").length;
  const events = snapshot.activeEvents.map((event) => `${event.type} centered on ${toIata(event.airport)} (${event.radiusNm} NM, ${event.severity})`);
  const centerAirport = byIcao(snapshot.activeEvents[0]?.airport);
  const baseline = Boolean(snapshot.baseline);
  const pending = plans.filter((plan) => plan.approvalStatus === "pending").length;
  return {
    id: `SCN-${snapshot.refreshNumber + 1}`,
    name: snapshot.scenario,
    region: baseline ? "Network-wide" : [...new Set(snapshot.affectedAirports.map((airport) => airport.city))].join(" · ") || "No airports inside the disruption area",
    severity: Math.max(0, ...snapshot.activeEvents.map((event) => SEVERITY_SCORE[event.severity] ?? 0.5)),
    startedAt: snapshot.refreshedAt,
    summary: events.length
      ? `${events.join("; ")}. ${pending} flight(s) need a recovery decision.`
      : pending
        ? `${pending} flight(s) need a decision (maintenance or ordinary ops delays).`
        : "No active disruptions.",
    recoveryProgress: plans.length ? decided / plans.length : 1,
    statusLine: `${approved} of ${plans.length} recovery plans approved · human review required`,
    center: centerAirport ? { lat: centerAirport.lat, lng: centerAirport.lon } : null,
    scenarioNumber: snapshot.refreshNumber + 1,
    baseline,
    notice: snapshot.notice,
    simMinutes: snapshot.simMinutes ?? 0,
    simClockIso: snapshot.simClockIso,
    tickSeconds: snapshot.tickSeconds,
    lastTickAt: snapshot.lastTickAt,
    lastOpsNote: snapshot.lastOpsNote,
    planRevision: snapshot.planRevision
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
