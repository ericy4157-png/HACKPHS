import type { DecisionResult, Flight, Incident, ScenarioSnapshot } from "../types";
import { DEMO_SCENARIOS } from "../data/demoData";

/**
 * API client for Skyward.
 *
 * Talks to the Skyward backend by default. In dev, Vite proxies /api to the backend
 * (see vite.config.ts). Set VITE_API_BASE_URL to call a backend on another origin,
 * or VITE_USE_MOCK=true to run the UI on local mock data. If the backend cannot be
 * reached, the app can switch to mock data at runtime via `enableMockMode()`.
 *
 *   GET  {base}/api/incident             → Incident
 *   GET  {base}/api/flights              → Flight[]
 *   GET  {base}/api/flights/:id          → Flight
 *   POST {base}/api/flights/:id/accept   → DecisionResult
 *   POST {base}/api/flights/:id/reject   → DecisionResult
 *   POST {base}/api/scenario/next        → ScenarioSnapshot
 */

let mockMode = import.meta.env.VITE_USE_MOCK === "true";
const BASE = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

/** True when requests are served from local mock data instead of the backend. */
export function isMockMode(): boolean {
  return mockMode;
}

/** Serve all further requests from local mock data (used when the backend is unreachable). */
export function enableMockMode(): void {
  mockMode = true;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error ?? `API ${path} failed: ${res.status}`);
  }
  return body as T;
}

function delay<T>(value: T, ms = 280): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/**
 * In-memory copy of the current demo scenario so decisions made in mock mode persist until
 * "Next scenario". Copies are handed out so React state never shares references with the store.
 */
let mockScenarioIndex = 0;
const freshDemoFlights = (): Flight[] => DEMO_SCENARIOS[mockScenarioIndex].flights.map((f) => ({ ...f }));
let mockFlights: Flight[] = freshDemoFlights();

function mockIncident(): Incident {
  const needsPlan = mockFlights.filter((f) => f.planId !== undefined);
  const decided = needsPlan.filter((f) => f.approvalStatus !== "pending").length;
  const approved = needsPlan.filter((f) => f.approvalStatus === "approved").length;
  return {
    ...DEMO_SCENARIOS[mockScenarioIndex].incident,
    recoveryProgress: needsPlan.length ? decided / needsPlan.length : 1,
    statusLine: `${approved} of ${needsPlan.length} recovery plans approved · demo data`,
  };
}

/** Mirrors the backend: accepted plans show as rerouted, rejected ones as disrupted. */
function mockDecide(flightId: string, decision: "accept" | "reject"): DecisionResult {
  const existing = mockFlights.find((f) => f.id === flightId);
  if (!existing) throw new Error(`Unknown flight ${flightId}`);
  if (existing.planId === undefined) throw new Error("No recovery plan for this flight in the current scenario");
  const updated: Flight =
    decision === "accept"
      ? { ...existing, approvalStatus: "approved", status: "rerouted" }
      : { ...existing, approvalStatus: "rejected", status: "disrupted" };
  mockFlights = mockFlights.map((f) => (f.id === flightId ? updated : f));
  return { ok: true, flightId, flight: { ...updated }, incident: mockIncident() };
}

export async function getIncident(): Promise<Incident> {
  if (mockMode) return delay(mockIncident());
  return requestJson<Incident>("/api/incident");
}

export async function getFlights(): Promise<Flight[]> {
  if (mockMode) return delay(mockFlights.map((f) => ({ ...f })));
  return requestJson<Flight[]>("/api/flights");
}

export async function getFlight(id: string): Promise<Flight | undefined> {
  if (mockMode) return delay(mockFlights.find((f) => f.id === id));
  return requestJson<Flight>(`/api/flights/${encodeURIComponent(id)}`);
}

async function decide(flightId: string, decision: "accept" | "reject"): Promise<DecisionResult> {
  if (mockMode) return delay(mockDecide(flightId, decision));
  return requestJson<DecisionResult>(`/api/flights/${encodeURIComponent(flightId)}/${decision}`, {
    method: "POST",
    body: JSON.stringify({ decidedBy: "skyward-ui-operator" }),
  });
}

export const acceptReroute = (flightId: string) => decide(flightId, "accept");
export const rejectReroute = (flightId: string) => decide(flightId, "reject");

/**
 * Advance the backend to its next seeded disruption scenario.
 * In mock mode, cycles through the frozen scenarios with fresh (all pending) decisions.
 */
export async function nextScenario(): Promise<ScenarioSnapshot> {
  if (mockMode) {
    mockScenarioIndex = (mockScenarioIndex + 1) % DEMO_SCENARIOS.length;
    mockFlights = freshDemoFlights();
    return delay({ incident: mockIncident(), flights: mockFlights.map((f) => ({ ...f })) });
  }
  return requestJson<ScenarioSnapshot>("/api/scenario/next", { method: "POST" });
}
