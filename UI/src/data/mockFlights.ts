import type { Flight, FlightStatus, LatLng } from "../types";
import { AIRPORTS, AIRPORT_LIST } from "./airports";

const ROUTES: [string, string][] = [
  ["JFK", "LAX"],
  ["JFK", "SFO"],
  ["JFK", "SEA"],
  ["JFK", "ORD"],
  ["JFK", "MIA"],
  ["EWR", "LAX"],
  ["EWR", "SFO"],
  ["BOS", "LAX"],
  ["BOS", "SFO"],
  ["BOS", "ORD"],
  ["IAD", "LAX"],
  ["IAD", "SFO"],
  ["IAD", "DEN"],
  ["ATL", "LAX"],
  ["ATL", "SEA"],
  ["ATL", "SFO"],
  ["ATL", "DEN"],
  ["ATL", "LAS"],
  ["ORD", "LAX"],
  ["ORD", "SFO"],
  ["ORD", "SEA"],
  ["ORD", "LAS"],
  ["ORD", "MIA"],
  ["DFW", "LAX"],
  ["DFW", "JFK"],
  ["DFW", "SEA"],
  ["DFW", "BOS"],
  ["DEN", "JFK"],
  ["DEN", "LAX"],
  ["DEN", "ORD"],
  ["DEN", "MIA"],
  ["DEN", "SEA"],
  ["LAX", "ORD"],
  ["LAX", "ATL"],
  ["LAX", "BOS"],
  ["LAX", "MIA"],
  ["SFO", "ORD"],
  ["SFO", "ATL"],
  ["SFO", "JFK"],
  ["SFO", "MIA"],
  ["SEA", "ORD"],
  ["SEA", "ATL"],
  ["SEA", "JFK"],
  ["SEA", "DFW"],
  ["MIA", "LAX"],
  ["MIA", "SEA"],
  ["MIA", "DEN"],
  ["PHX", "JFK"],
  ["PHX", "ORD"],
  ["PHX", "BOS"],
  ["LAS", "JFK"],
  ["LAS", "ORD"],
  ["LAS", "ATL"],
  ["MSP", "LAX"],
  ["MSP", "SFO"],
  ["DTW", "LAX"],
  ["DTW", "SFO"],
  ["CLT", "LAX"],
  ["CLT", "SEA"],
  ["IAH", "JFK"],
  ["IAH", "SEA"],
  ["IAH", "SFO"],
  ["SAN", "JFK"],
  ["SAN", "ORD"],
  ["PDX", "JFK"],
  ["PDX", "ORD"],
  ["SLC", "JFK"],
  ["SLC", "ATL"],
  ["AUS", "JFK"],
  ["AUS", "SEA"],
  ["BNA", "LAX"],
  ["BNA", "SFO"],
  ["RDU", "LAX"],
  ["RDU", "SEA"],
  ["MCO", "LAX"],
  ["MCO", "SEA"],
  ["MCO", "SFO"],
  ["DEN", "BOS"],
  ["PHX", "MIA"],
  ["LAS", "BOS"],
];

const STATUSES: FlightStatus[] = ["disrupted", "rerouting", "rerouted", "disrupted", "rerouting"];

const HUBS = ["ORD", "DFW", "DEN", "ATL", "CLT"];

function mid(a: LatLng, b: LatLng, t = 0.5): LatLng {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function jitter(n: number, amount: number, seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return n + (x - Math.floor(x) - 0.5) * amount;
}

function proposedVia(origin: string, dest: string, seed: number): LatLng[] {
  const o = AIRPORTS[origin];
  const d = AIRPORTS[dest];
  const hubCode = HUBS[seed % HUBS.length];
  if (hubCode === origin || hubCode === dest) {
    const bump: LatLng = [
      jitter((o.lat + d.lat) / 2, 6, seed),
      jitter((o.lng + d.lng) / 2, 8, seed + 1),
    ];
    return [
      [o.lat, o.lng],
      bump,
      [d.lat, d.lng],
    ];
  }
  const h = AIRPORTS[hubCode];
  return [
    [o.lat, o.lng],
    [h.lat, h.lng],
    [d.lat, d.lng],
  ];
}

function buildFlight(index: number): Flight {
  const [origin, destination] = ROUTES[index % ROUTES.length];
  const o = AIRPORTS[origin];
  const d = AIRPORTS[destination];
  const status = STATUSES[index % STATUSES.length];
  const originalPath: LatLng[] = [
    [o.lat, o.lng],
    [d.lat, d.lng],
  ];
  const proposedPath =
    status === "ok" ? originalPath : proposedVia(origin, destination, index + 3);

  const midpoint = mid(originalPath[0], originalPath[1], 0.35 + (index % 5) * 0.08);
  const carriers = ["SKW", "AAL", "UAL", "DAL", "JBU", "SWA"];
  const carrier = carriers[index % carriers.length];
  const num = 100 + ((index * 37) % 800);

  const delayBase =
    status === "rerouted" ? 25 : status === "rerouting" ? 55 : status === "disrupted" ? 90 : 0;

  return {
    id: `flt-${String(index + 1).padStart(3, "0")}`,
    callsign: `${carrier}${num}`,
    origin,
    destination,
    status,
    originalPath,
    proposedPath,
    delayMinutes: delayBase + (index % 7) * 5,
    passengers: 90 + ((index * 13) % 160),
    lat: jitter(midpoint[0], 1.2, index),
    lng: jitter(midpoint[1], 1.8, index + 9),
  };
}

export const MOCK_FLIGHTS: Flight[] = Array.from({ length: 64 }, (_, i) => buildFlight(i));

export function airportByIata(iata: string) {
  return AIRPORTS[iata] ?? AIRPORT_LIST[0];
}
