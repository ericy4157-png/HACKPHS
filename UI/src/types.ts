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
