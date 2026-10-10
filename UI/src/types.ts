export type FlightStatus = "disrupted" | "rerouting" | "rerouted" | "ok";

export type Incident = {
  id: string;
  name: string;
  region: string;
  severity: number;
  startedAt: string;
  summary: string;
  recoveryProgress: number;
  statusLine: string;
  /** Backend-only fields; absent in mock mode. */
  center?: { lat: number; lng: number } | null;
  scenarioNumber?: number;
  notice?: string;
};

export type Airport = {
  iata: string;
  name: string;
  lat: number;
  lng: number;
  city: string;
};

export type LatLng = [number, number];

export type Flight = {
  id: string;
  callsign: string;
  origin: string;
  destination: string;
  status: FlightStatus;
  originalPath: LatLng[];
  proposedPath: LatLng[];
  delayMinutes: number;
  passengers: number;
  /** Midpoint position used for globe point marker */
  lat: number;
  lng: number;
  /** Recovery detail from the backend; absent in mock mode. */
  planId?: string;
  action?: "reroute" | "delay" | "cancel" | "hold_for_human_review";
  approvalStatus?: "pending" | "approved" | "rejected";
  originAirport?: AirportView;
  destinationAirport?: AirportView;
  originalRoute?: string;
  proposedRoute?: string;
  changes?: { timing: string; aircraft: string; layover: string };
  aircraft?: {
    before: { id: string; type: string };
    after: { id: string; type: string };
    swapped: boolean;
    swapAt: string | null;
  };
  stops?: {
    code: string;
    city: string;
    groundMinutes: number;
    arrivalAt: string;
    departureAt: string;
    reason: string;
  }[];
  schedule?: { before: ScheduleTimes; after: ScheduleTimes };
  requiredChecks?: string[];
};

export type AirportView = {
  code: string;
  icao: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
};

export type ScheduleTimes = {
  departureAt: string;
  arrivalAt: string;
  blockMinutes: number;
};

export type DecisionResult = {
  ok: true;
  flightId: string;
  flight?: Flight;
  incident?: Incident;
};

export type ScenarioSnapshot = {
  incident: Incident;
  flights: Flight[];
};

export type ArcDatum = {
  id: string;
  flightId: string;
  kind: "original" | "proposed";
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: string;
  dash: boolean;
};

export type PointDatum = {
  id: string;
  flightId: string;
  lat: number;
  lng: number;
  callsign: string;
  status: FlightStatus;
  size: number;
  color: string;
};
