import type { Flight, Incident } from "../types";
import { MOCK_INCIDENT } from "../data/mockIncident";
import { MOCK_FLIGHTS } from "../data/mockFlights";

/**
 * API client for Skyward.
 *
 * Today: returns mock data.
 * Tomorrow: set VITE_API_BASE_URL and flip USE_MOCK to false once the backend is up.
 *
 * Expected endpoints (contract for teammates):
 *   GET  {base}/api/incident          → Incident
 *   GET  {base}/api/flights           → Flight[]
 *   GET  {base}/api/flights/:id       → Flight
 *   POST {base}/api/flights/:id/accept
 *   POST {base}/api/flights/:id/reject
 */

const USE_MOCK = true;
const BASE = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    throw new Error(`API ${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function delay<T>(value: T, ms = 280): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export async function getIncident(): Promise<Incident> {
  if (USE_MOCK || !BASE) return delay(MOCK_INCIDENT);
  return getJson<Incident>("/api/incident");
}

export async function getFlights(): Promise<Flight[]> {
  if (USE_MOCK || !BASE) return delay(MOCK_FLIGHTS);
  return getJson<Flight[]>("/api/flights");
}

export async function getFlight(id: string): Promise<Flight | undefined> {
  if (USE_MOCK || !BASE) {
    return delay(MOCK_FLIGHTS.find((f) => f.id === id));
  }
  return getJson<Flight>(`/api/flights/${id}`);
}

/** UI-only placeholders until backend wires decisions */
export async function acceptReroute(flightId: string): Promise<{ ok: true; flightId: string }> {
  if (USE_MOCK || !BASE) return delay({ ok: true, flightId });
  const res = await fetch(`${BASE}/api/flights/${flightId}/accept`, { method: "POST" });
  if (!res.ok) throw new Error(`accept failed: ${res.status}`);
  return res.json();
}

export async function rejectReroute(flightId: string): Promise<{ ok: true; flightId: string }> {
  if (USE_MOCK || !BASE) return delay({ ok: true, flightId });
  const res = await fetch(`${BASE}/api/flights/${flightId}/reject`, { method: "POST" });
  if (!res.ok) throw new Error(`reject failed: ${res.status}`);
  return res.json();
}
