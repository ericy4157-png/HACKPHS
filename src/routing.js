import { airports, restrictedZones } from "./data.js";

const EARTH_RADIUS_NM = 3440.065;
const toRad = (value) => value * Math.PI / 180;

export function distanceNm(a, b) {
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i], [yj, xj] = polygon[j];
    if ((yi > point.lat) !== (yj > point.lat) && point.lon < (xj - xi) * (point.lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function orientation(a, b, c) { return (b.lon - a.lon) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lon - a.lon); }
function segmentsIntersect(a, b, c, d) {
  const o1 = orientation(a, b, c), o2 = orientation(a, b, d), o3 = orientation(c, d, a), o4 = orientation(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

export function crossedZones(a, b, zones = restrictedZones) {
  return zones.filter((zone) => {
    const corners = zone.polygon.map(([lat, lon]) => ({ lat, lon }));
    return pointInPolygon(a, zone.polygon) || pointInPolygon(b, zone.polygon) || corners.some((corner, i) => segmentsIntersect(a, b, corner, corners[(i + 1) % corners.length]));
  });
}

function routeNodes(origin, destination, zones) {
  const nodes = [origin, destination];
  for (const zone of zones) {
    // Offset each corner just outside the zone so a path can route around it.
    for (const [lat, lon] of zone.polygon) nodes.push({ lat: lat + (lat > 0 ? 0.6 : -0.6), lon: lon + (lon > 0 ? 0.6 : -0.6), name: `${zone.id}-BYPASS` });
  }
  return nodes;
}

export function findRoute({ origin, destination, policy = {} }) {
  const forbidden = restrictedZones.filter((z) => z.severity === "prohibited" || (z.severity === "avoid" && policy.avoidHighTerrain));
  if (crossedZones(origin, destination, forbidden).length === 0) return { waypoints: [origin, destination], zonesAvoided: [], distanceNm: Math.round(distanceNm(origin, destination)) };

  const nodes = routeNodes(origin, destination, forbidden);
  const costs = Array(nodes.length).fill(Infinity), previous = Array(nodes.length).fill(null), settled = new Set();
  costs[0] = 0;
  while (settled.size < nodes.length) {
    let current = -1;
    for (let i = 0; i < nodes.length; i++) if (!settled.has(i) && (current < 0 || costs[i] < costs[current])) current = i;
    if (current < 0 || costs[current] === Infinity) break;
    if (current === 1) break;
    settled.add(current);
    for (let next = 0; next < nodes.length; next++) {
      if (settled.has(next) || next === current || crossedZones(nodes[current], nodes[next], forbidden).length) continue;
      const candidate = costs[current] + distanceNm(nodes[current], nodes[next]);
      if (candidate < costs[next]) { costs[next] = candidate; previous[next] = current; }
    }
  }
  if (costs[1] === Infinity) throw new Error("No compliant route can be generated with the active restrictions");
  const indices = []; for (let current = 1; current !== null; current = previous[current]) indices.unshift(current);
  const waypoints = indices.map((index) => nodes[index]);
  return { waypoints, zonesAvoided: crossedZones(origin, destination, forbidden).map((z) => z.id), distanceNm: Math.round(costs[1]) };
}

export function diversionOptions(position, aircraft, closedAirports = [], intendedDestination) {
  const minimumRunway = aircraft?.includes("A350") || aircraft?.includes("B787") ? 8500 : 6000;
  return airports.filter((airport) => airport.status === "open" && !closedAirports.includes(airport.icao) && airport.runwayFt >= minimumRunway)
    .map((airport) => ({ ...airport, distanceNm: Math.round(distanceNm(position, airport)), passengerRecoveryNm: intendedDestination ? Math.round(distanceNm(airport, intendedDestination)) : 0 }))
    .filter((airport) => crossedZones(position, airport, restrictedZones.filter((z) => z.severity === "prohibited")).length === 0)
    .sort((a, b) => (a.distanceNm + 1.5 * a.passengerRecoveryNm) - (b.distanceNm + 1.5 * b.passengerRecoveryNm)).slice(0, 3);
}

export function planReroute({ flight, destination, closedAirports = [], policy = {} }) {
  const target = airports.find((a) => a.icao === destination);
  if (!target) throw new Error(`Unknown destination: ${destination}`);
  const origin = flight.position || airports.find((a) => a.icao === flight.origin);
  const directNm = distanceNm(origin, target);
  const route = findRoute({ origin, destination: target, policy });
  const extraMinutes = Math.round(Math.max(0, route.distanceNm - directNm) / 8.2); // 492 kt cruise approximation
  const alternates = diversionOptions(origin, flight.aircraft, closedAirports, target);
  const fuelMargin = flight.fuelMinutes - Math.round(route.distanceNm / 8.2) - 45;
  return {
    flightId: flight.id, destination: target.icao, route, alternates,
    passengerImpact: { extraMinutes, estimatedAffectedPassengers: flight.passengers, reason: extraMinutes ? "airspace-compliant detour" : "no material route extension" },
    operationalAssessment: { fuelMarginMinutes: fuelMargin, requiresDispatcherApproval: true, safeToPropose: fuelMargin >= 0 },
    disclaimer: "Decision support only. Dispatch/ATC must validate current NOTAMs, weather, performance, fuel, traffic flow restrictions, and regulatory authority before clearance."
  };
}
