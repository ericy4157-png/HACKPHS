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
  /** True for normal operations (no active disaster). */
  baseline?: boolean;
  notice?: string;
  /** Live ops clock (additive). */
  simMinutes?: number;
  simClockIso?: string;
  tickSeconds?: number;
  lastTickAt?: string | null;
  lastOpsNote?: string | null;
  planRevision?: number;
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
  /** Present on full detail; absent on compact markers from scope=active. */
  originalPath?: LatLng[];
  proposedPath?: LatLng[];
  delayMinutes?: number;
  passengers: number;
  /** Midpoint position used for globe point marker */
  lat: number;
  lng: number;
  /** True when the API returned a compact marker (no route detail). */
  compact?: boolean;
  dayIndex?: number;
  inWindow?: boolean;
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
  /** Runway figures the chosen diversion was checked against; only present when the plan diverts. */
  diversionRunway?: DiversionRunway;
  /** Why the plan did or did not switch aircraft. */
  swapCheck?: SwapCheck;
  /** Layered recovery consequences (additive; first slice is aircraft knock-on only). */
  layers?: RecoveryLayer[];
  planRevision?: number;
  /** Why this pending plan was rebuilt after a tick or another decision. */
  supersededReason?: string;
  /** Additive roster fields for the spreadsheet. */
  aircraftId?: string | null;
  aircraftType?: string | null;
  departureAt?: string | null;
  arrivalAt?: string | null;
  blockMinutes?: number | null;
  refuelMinutes?: number;
  nextRefuel?: { flightId: string; minutes: number; departureAt: string } | null;
  fuel?: {
    departureKg: number;
    arrivalKg: number;
    reserveKg: number;
    onboardKgNow: number | null;
  } | null;
  fuelMinutes?: number;
  legNumber?: number | null;
  tripsOnTail?: number;
  rotationId?: string | null;
  opsStatus?: string;
  /** Passenger-delay cost of the current plan (additive). */
  passengerMinutes?: number;
  /** One-line label for the futures picker. */
  label?: string;
  /** Sibling legal futures; only on pending recovery rows. */
  alternatives?: FlightAlternative[];
};

export type FlightAlternative = {
  planId: string;
  action?: Flight["action"];
  delayMinutes?: number;
  proposedPath?: LatLng[];
  proposedRoute?: string;
  passengerMinutes?: number;
  label?: string;
  layers?: RecoveryLayer[];
  aircraft?: Flight["aircraft"];
};

export type AppPage = "dashboard" | "network" | "sheet";

export type RecoveryLayer = {
  index: number;
  kind: "disrupted_leg" | "aircraft_knock_on" | "passenger_group";
  flightId?: string;
  groupId?: string;
  size?: number;
  action?: string;
  aircraftId?: string;
  delayMinutes?: number;
  absorbed?: boolean;
  summary: string;
};

export type TickSnapshot = {
  incident: Incident;
  flights: Flight[];
};

export type DiversionRunway = {
  code: string;
  icao: string;
  longestRunwayFt: number | null;
  requiredRunwayFt: number;
  aircraftType: string | null;
  category: string;
  basis: string;
  runwaySource: "ourairports" | "built-in" | null;
};

export type SwapCheck = {
  swapped: boolean;
  fromType: string;
  toType: string | null;
  compatible: boolean | null;
  reason: string;
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
  /** Full list after replan (butterfly updates). */
  flights?: Flight[];
  incident?: Incident;
  /** Other flights whose pending plans were rewritten by this decision. */
  changedFlightIds?: string[];
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
