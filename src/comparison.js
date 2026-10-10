import { airports, fleet, restrictedZones } from "./data.js";
import { crossedZones, distanceNm } from "./routing.js";

const CRUISE_NM_PER_MIN = 8.2;
const TAXI_MINUTES = 20;

const byIcao = (icao) => airports.find((item) => item.icao === icao);
const airMinutes = (nm) => Math.max(0, Math.round(nm / CRUISE_NM_PER_MIN));
const blockMinutes = (nm) => airMinutes(nm) + TAXI_MINUTES;
const addMinutes = (value, minutes) => new Date(new Date(value).getTime() + minutes * 60_000).toISOString();
const minutesBetween = (earlier, later) => Math.round((new Date(later) - new Date(earlier)) / 60_000);

function pointFromAirport(airport, kind) {
  return { lat: airport.lat, lon: airport.lon, icao: airport.icao, city: airport.city, name: airport.name, kind };
}

function formatClock(minutes) {
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours) return `${hours}h`;
  return `${mins}m`;
}

function arrivalSentence(icao, minutes) {
  if (minutes === 0) return `Arrival at ${icao} is unchanged from the plan.`;
  return `Arrival at ${icao} is ${formatClock(minutes)} ${minutes > 0 ? "later" : "earlier"} than planned.`;
}

/**
 * Pick a different airworthy tail for a recovery leg.
 * Same type is preferred, and a tail already at the swap station is preferred over a ferry.
 */
function replacementTail(flight, preferIcao) {
  const healthy = fleet.filter((item) => item.id !== flight.aircraftId && item.maintenanceDueInHours >= 8);
  const sameType = healthy.filter((item) => item.type === flight.aircraft);
  const pool = sameType.length ? sameType : healthy;
  return pool.find((item) => item.location === preferIcao) || pool[0] || null;
}

function connectionHub(origin, destination, closedAirports) {
  return airports
    .filter((item) => item.status === "open" && item.icao !== origin.icao && item.icao !== destination.icao && !closedAirports.includes(item.icao))
    .map((item) => ({ ...item, score: distanceNm(origin, item) + distanceNm(item, destination) }))
    .sort((a, b) => a.score - b.score)[0] || null;
}

function nearbyAirports(primary) {
  const lats = primary.map((point) => point.lat);
  const lons = primary.map((point) => point.lon);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const mid = { lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2 };
  return airports
    .filter((item) => item.lat >= minLat - 4 && item.lat <= maxLat + 4 && item.lon >= minLon - 4 && item.lon <= maxLon + 4)
    .filter((item) => !primary.some((point) => point.icao === item.icao))
    .map((item) => ({ point: pointFromAirport(item, "context"), range: distanceNm(mid, item) }))
    .sort((a, b) => a.range - b.range)
    .slice(0, 6)
    .map((item) => item.point);
}

function compactZones(zoneIds) {
  return restrictedZones.filter((zone) => zoneIds.includes(zone.id)).filter((zone) => {
    const lats = zone.polygon.map(([lat]) => lat);
    const lons = zone.polygon.map(([, lon]) => lon);
    return Math.max(...lats) - Math.min(...lats) <= 30 && Math.max(...lons) - Math.min(...lons) <= 45;
  }).map((zone) => ({ id: zone.id, name: zone.name, reason: zone.reason, polygon: zone.polygon }));
}

function baseline(flight) {
  const origin = byIcao(flight.origin);
  const destination = byIcao(flight.destination);
  const distance = distanceNm(origin, destination);
  const block = blockMinutes(distance);
  const departureAt = addMinutes(new Date(), flight.scheduledOffsetMinutes);
  const aircraft = fleet.find((item) => item.id === flight.aircraftId);
  return {
    aircraft,
    itinerary: {
      title: "Planned route",
      summary: `${origin.icao} → ${destination.icao} nonstop on ${flight.aircraftId}`,
      waypoints: [pointFromAirport(origin, "origin"), pointFromAirport(destination, "destination")],
      departureAt,
      arrivalAt: addMinutes(departureAt, block),
      blockMinutes: block,
      distanceNm: Math.round(distance),
      aircraftId: flight.aircraftId,
      aircraftType: flight.aircraft,
      stops: []
    }
  };
}

function pathKey(waypoints) {
  return waypoints.map((point) => point.icao).filter(Boolean).join(">");
}

function pack(before, after, narrative, zoneIds = []) {
  const arrivalChangeMinutes = minutesBetween(before.arrivalAt, after.arrivalAt);
  const primary = [...before.waypoints, ...after.waypoints];
  return {
    before,
    after,
    contextAirports: nearbyAirports(primary),
    mapZones: compactZones(zoneIds),
    deltas: {
      arrivalChangeMinutes,
      blockChangeMinutes: after.blockMinutes - before.blockMinutes,
      geometryChanged: pathKey(before.waypoints) !== pathKey(after.waypoints),
      aircraftSwapped: before.aircraftId !== after.aircraftId,
      swapAt: narrative.swapAt,
      fromAircraft: { id: before.aircraftId, type: before.aircraftType },
      toAircraft: { id: after.aircraftId, type: after.aircraftType },
      newLayovers: after.stops.map((stop) => stop.icao),
      timing: narrative.timing,
      aircraft: narrative.aircraft,
      layover: narrative.layover
    }
  };
}

function sameTrack(before, aircraftId, aircraftType, title, summary) {
  return {
    ...before,
    title,
    summary,
    waypoints: before.waypoints.map((point) => ({ ...point })),
    aircraftId,
    aircraftType,
    stops: []
  };
}

function proposedWaypoints(flight, origin, divert, destination, routeWaypoints) {
  const points = [{ ...pointFromAirport(origin, "origin") }];
  for (const point of routeWaypoints) {
    const bypass = typeof point.name === "string" && point.name.endsWith("BYPASS");
    if (bypass) {
      const zoneId = point.name.replace(/-BYPASS$/, "");
      points.push({ lat: point.lat, lon: point.lon, icao: null, city: "Airspace bypass", name: zoneId, kind: "bypass", note: `The path bends outside ${zoneId} so it stays clear of the restricted polygon.` });
      continue;
    }
    const isOrigin = point.icao === origin.icao || (Math.abs(point.lat - origin.lat) < 0.05 && Math.abs(point.lon - origin.lon) < 0.05);
    const isDivert = point.icao === divert.icao || (Math.abs(point.lat - divert.lat) < 0.05 && Math.abs(point.lon - divert.lon) < 0.05);
    if (isOrigin || isDivert || point.icao) continue;
    points.push({ lat: point.lat, lon: point.lon, icao: null, city: "En route", name: "Current position", kind: "position", note: "Aircraft position when this reroute was built. The proposed path leaves from here." });
  }
  points.push({ ...pointFromAirport(divert, "layover"), note: `New layover. ${flight.aircraftId} lands here instead of continuing nonstop to ${destination.icao}.` });
  if (divert.icao !== destination.icao) points.push({ ...pointFromAirport(destination, "destination"), note: `Original destination, now reached after the stop at ${divert.icao}.` });
  return points;
}

/**
 * Build the planned-versus-proposed itinerary for one review item.
 * Times, aircraft swaps, and layovers are modeled recovery suggestions, not clearances.
 */
export function buildComparison({ flight, action, delayMinutes = 0, diversionAirport, reroute, closedAirports = [] }) {
  const { aircraft, itinerary: before } = baseline(flight);
  const origin = byIcao(flight.origin);
  const destination = byIcao(flight.destination);

  if (action === "delay") {
    const swap = flight.status !== "airborne" && aircraft.maintenanceDueInHours < 8 ? replacementTail(flight, origin.icao) : null;
    const after = sameTrack(before, swap?.id || flight.aircraftId, swap?.type || flight.aircraft, "Delayed route", `${origin.icao} → ${destination.icao} on the same track`);
    after.departureAt = flight.status === "airborne" ? before.departureAt : addMinutes(before.departureAt, delayMinutes);
    after.arrivalAt = addMinutes(before.arrivalAt, delayMinutes);
    const timing = flight.status === "airborne"
      ? `The aircraft is already airborne, so the departure time stays put. ${arrivalSentence(destination.icao, delayMinutes)} The track itself does not change.`
      : `Departure slips ${formatClock(delayMinutes)}. ${arrivalSentence(destination.icao, delayMinutes)} Block time stays ${formatClock(before.blockMinutes)} because the track is unchanged.`;
    const aircraftText = swap
      ? `Plane switch at ${origin.icao} (${origin.city}) before departure. ${flight.aircraftId} (${flight.aircraft}) is ${aircraft.maintenanceDueInHours} flight hours from maintenance, so ${swap.id} (${swap.type}) takes the delayed leg.`
      : `No plane switch. ${flight.aircraftId} (${flight.aircraft}) keeps the flight. Maintenance is due in ${aircraft.maintenanceDueInHours} flight hours.`;
    return pack(before, after, {
      swapAt: swap ? origin.icao : null,
      timing,
      aircraft: aircraftText,
      layover: `No new layover. ${origin.city} to ${destination.city} stays nonstop; only the clock moves.`
    });
  }

  if (action === "cancel") {
    const hub = connectionHub(origin, destination, closedAirports);
    const spare = replacementTail(flight, hub?.icao || destination.icao);
    const firstNm = hub ? distanceNm(origin, hub) : distanceNm(origin, destination);
    const secondNm = hub ? distanceNm(hub, destination) : 0;
    const ground = hub ? Math.max(spare?.minimumTurnMinutes || 75, 95) : 0;
    const firstBlock = blockMinutes(firstNm);
    const secondBlock = hub ? blockMinutes(secondNm) : 0;
    const departureAt = addMinutes(before.departureAt, 18 * 60);
    const layoverArrival = addMinutes(departureAt, firstBlock);
    const onwardDeparture = addMinutes(layoverArrival, ground);
    const arrivalAt = hub ? addMinutes(onwardDeparture, secondBlock) : addMinutes(departureAt, before.blockMinutes);
    const stops = hub ? [{ icao: hub.icao, city: hub.city, name: hub.name, groundMinutes: ground, arrivalAt: layoverArrival, departureAt: onwardDeparture, reason: `The nonstop is cancelled. Passengers connect through ${hub.city} once ${origin.icao} can accept a departure.` }] : [];
    const waypoints = hub
      ? [pointFromAirport(origin, "origin"), { ...pointFromAirport(hub, "layover"), note: stops[0].reason }, { ...pointFromAirport(destination, "destination"), note: `Original destination, reached after the new connection at ${hub.icao}.` }]
      : before.waypoints.map((point) => ({ ...point }));
    const after = {
      title: "Recovery itinerary",
      summary: hub ? `${origin.icao} → ${hub.icao} → ${destination.icao}` : `${origin.icao} → ${destination.icao} is cancelled`,
      waypoints, departureAt, arrivalAt, stops,
      blockMinutes: firstBlock + ground + secondBlock,
      distanceNm: Math.round(firstNm + secondNm),
      aircraftId: spare?.id || flight.aircraftId,
      aircraftType: spare?.type || flight.aircraft
    };
    const delta = minutesBetween(before.arrivalAt, arrivalAt);
    return pack(before, after, {
      swapAt: spare ? origin.icao : null,
      timing: `The original departure is cancelled. A protected itinerary is modeled 18h later. ${arrivalSentence(destination.icao, delta)}`,
      aircraft: spare
        ? `Plane switch at ${origin.icao}. ${flight.aircraftId} (${flight.aircraft}) is held for the ramp and maintenance release. Passengers are protected on ${spare.id} (${spare.type}).`
        : `No spare tail is available in the model. ${flight.aircraftId} remains the only aircraft attached to the recovery.`,
      layover: hub
        ? `New layover at ${hub.icao} (${hub.city}) for ${formatClock(ground)}. The nonstop ${origin.icao} → ${destination.icao} is replaced by two sectors.`
        : "No replacement layover could be built inside the modeled network."
    });
  }

  if (action === "reroute" && diversionAirport && reroute?.route) {
    const divert = byIcao(diversionAirport);
    const spare = aircraft.maintenanceDueInHours < 12 ? replacementTail(flight, divert.icao) : null;
    const onwardId = spare?.id || flight.aircraftId;
    const onwardType = spare?.type || flight.aircraft;
    const divertAir = Math.round((reroute.route.distanceNm || distanceNm(flight.position || origin, divert)) / CRUISE_NM_PER_MIN);
    const onwardNm = distanceNm(divert, destination);
    const onwardAir = airMinutes(onwardNm);
    const ground = Math.max(aircraft.minimumTurnMinutes, spare ? 110 : 80);
    const divertArrival = addMinutes(new Date(), divertAir);
    const onwardDeparture = addMinutes(divertArrival, ground);
    const arrivalAt = addMinutes(onwardDeparture, onwardAir + TAXI_MINUTES);
    const stop = {
      icao: divert.icao, city: divert.city, name: divert.name, groundMinutes: ground, arrivalAt: divertArrival, departureAt: onwardDeparture,
      reason: spare
        ? `Passengers leave ${flight.aircraftId} here and continue on ${onwardId}.`
        : `${flight.aircraftId} turns here, then continues to ${destination.icao}.`
    };
    const after = {
      title: "Proposed reroute",
      summary: divert.icao === destination.icao ? `${origin.icao} → ${divert.icao}` : `${origin.icao} → ${divert.icao} → ${destination.icao}`,
      waypoints: proposedWaypoints(flight, origin, divert, destination, reroute.route.waypoints || []),
      departureAt: before.departureAt,
      arrivalAt,
      blockMinutes: divertAir + ground + onwardAir + TAXI_MINUTES,
      distanceNm: Math.round((reroute.route.distanceNm || 0) + onwardNm),
      aircraftId: onwardId,
      aircraftType: onwardType,
      stops: divert.icao === destination.icao ? [] : [stop]
    };
    const delta = minutesBetween(before.arrivalAt, arrivalAt);
    const zoneIds = [...new Set([...(reroute.route.zonesAvoided || []), ...crossedZones(origin, destination).map((zone) => zone.id)])];
    return pack(before, after, {
      swapAt: spare ? divert.icao : null,
      timing: `${arrivalSentence(destination.icao, delta)} About ${formatClock(divertAir)} remains to ${divert.icao}, then ${formatClock(ground)} on the ground, then ${formatClock(onwardAir)} onward.`,
      aircraft: spare
        ? `Plane switch at ${divert.icao} (${divert.city}). ${flight.aircraftId} (${flight.aircraft}) is ${aircraft.maintenanceDueInHours} flight hours from maintenance, so it terminates at the diversion. Passengers continue to ${destination.icao} on ${spare.id} (${spare.type}).`
        : `No plane switch. ${flight.aircraftId} (${flight.aircraft}) flies the diversion and the onward leg. Maintenance is due in ${aircraft.maintenanceDueInHours} flight hours.`,
      layover: divert.icao === destination.icao
        ? `No extra layover. The flight terminates at ${divert.icao}.`
        : `New layover at ${divert.icao} (${divert.city}) for ${formatClock(ground)}. The nonstop to ${destination.icao} becomes two sectors.`
    }, zoneIds);
  }

  const after = sameTrack(before, flight.aircraftId, flight.aircraft, "Awaiting a manual plan", "No compliant path was generated");
  return pack(before, after, {
    swapAt: null,
    timing: "Arrival impact cannot be estimated until a dispatcher selects a path.",
    aircraft: `No plane switch. ${flight.aircraftId} (${flight.aircraft}) stays assigned.`,
    layover: "No new layover. This item needs a manual recovery plan."
  });
}
