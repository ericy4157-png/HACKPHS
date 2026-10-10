import type { DecisionResult, Flight, Incident, ScenarioSnapshot, TickSnapshot } from "../types";
import { loadDemoScenarios } from "../data/demoData";

/**
 * API client for Skyward.
 *
 * Talks to the Skyward backend by default. In dev, Vite proxies /api to the backend
 * (see vite.config.ts). Set VITE_API_BASE_URL to call a backend on another origin,
 * or VITE_USE_MOCK=true to run the UI on local mock data. If the backend cannot be
 * reached, the app can switch to mock data at runtime via `enableMockMode()`.
 *
 * List endpoints request `?scope=active` so unaffected multi-day legs arrive as compact
 * markers. Full detail is fetched with GET /api/flights/:id when a flight is selected.
 *
 *   GET  {base}/api/incident             → Incident
 *   GET  {base}/api/flights?scope=active → Flight[]
 *   GET  {base}/api/flights/:id          → Flight
 *   POST {base}/api/flights/:id/accept   → DecisionResult
 *   POST {base}/api/flights/:id/reject   → DecisionResult
 *   POST {base}/api/scenario/next?scope=active → ScenarioSnapshot
 *   POST {base}/api/tick?scope=active    → TickSnapshot
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
let demoReady: Promise<void> | null = null;
let mockFlights: Flight[] = [];
let demoIncidents: Incident[] = [];
let demoFlightSets: Flight[][] = [];
let mockSimMinutes = 0;
let mockPlanRevision = 0;
let mockLastOpsNote: string | null = null;

async function ensureDemo(): Promise<void> {
  if (demoFlightSets.length) return;
  if (!demoReady) {
    demoReady = loadDemoScenarios().then((scenarios) => {
      demoIncidents = scenarios.map((s) => s.incident);
      demoFlightSets = scenarios.map((s) => s.flights.map((f) => ({ ...f })));
      mockFlights = demoFlightSets[mockScenarioIndex].map((f) => ({ ...f }));
      mockSimMinutes = 0;
      mockPlanRevision = 0;
      mockLastOpsNote = null;
    });
  }
  await demoReady;
}

function mockIncident(): Incident {
  const needsPlan = mockFlights.filter((f) => f.planId !== undefined);
  const decided = needsPlan.filter((f) => f.approvalStatus !== "pending").length;
  const approved = needsPlan.filter((f) => f.approvalStatus === "approved").length;
  const tickSeconds = demoIncidents[mockScenarioIndex]?.tickSeconds ?? 12;
  return {
    ...demoIncidents[mockScenarioIndex],
    recoveryProgress: needsPlan.length ? decided / needsPlan.length : 1,
    statusLine: `${approved} of ${needsPlan.length} recovery plans approved · demo data`,
    simMinutes: mockSimMinutes,
    simClockIso: new Date(Date.now() + mockSimMinutes * 60_000).toISOString(),
    tickSeconds,
    lastOpsNote: mockLastOpsNote,
    planRevision: mockPlanRevision,
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
      : {
          ...existing,
          approvalStatus: "pending",
          status: "disrupted",
          action: "hold_for_human_review",
          supersededReason: `decision rejected on ${flightId}`,
        };
  mockPlanRevision += 1;
  mockFlights = mockFlights.map((f) => {
    if (f.id === flightId) return updated;
    // Demo butterfly: mark other pending plans as refreshed after a decision.
    if (f.planId && f.approvalStatus === "pending" && decision === "accept") {
      return { ...f, planRevision: mockPlanRevision, supersededReason: `decision accepted on ${flightId}` };
    }
    return f;
  });
  const flight = mockFlights.find((f) => f.id === flightId)!;
  return {
    ok: true,
    flightId,
    flight: { ...flight },
    flights: mockFlights.map((f) => ({ ...f })),
    incident: mockIncident(),
  };
}

function mockTick(): TickSnapshot {
  mockSimMinutes += 5;
  mockPlanRevision += 1;
  const pendingOps = mockFlights.filter((f) => f.approvalStatus === "pending" && f.status !== "ok");
  if (pendingOps.length < 2) {
    const candidate = mockFlights.find((f) => f.status === "ok" && !f.compact);
    if (candidate) {
      mockLastOpsNote = `Gate hold — inbound late to the gate on ${candidate.callsign} (+45m)`;
      mockFlights = mockFlights.map((f) =>
        f.id === candidate.id
          ? {
              ...f,
              status: "rerouting",
              action: "delay",
              delayMinutes: 45,
              approvalStatus: "pending",
              planId: `DEMO-OPS-${candidate.id}`,
              planRevision: mockPlanRevision,
              supersededReason: "ops noise (demo)",
            }
          : f,
      );
    }
  }
  return { incident: mockIncident(), flights: mockFlights.map((f) => ({ ...f })) };
}

export async function getIncident(): Promise<Incident> {
  if (mockMode) {
    await ensureDemo();
    return delay(mockIncident());
  }
  return requestJson<Incident>("/api/incident");
}

export async function getFlights(): Promise<Flight[]> {
  if (mockMode) {
    await ensureDemo();
    return delay(mockFlights.map((f) => ({ ...f })));
  }
  return requestJson<Flight[]>("/api/flights?scope=active");
}

export async function getFlight(id: string): Promise<Flight | undefined> {
  if (mockMode) {
    await ensureDemo();
    return delay(mockFlights.find((f) => f.id === id));
  }
  return requestJson<Flight>(`/api/flights/${encodeURIComponent(id)}`);
}

async function decide(flightId: string, decision: "accept" | "reject"): Promise<DecisionResult> {
  if (mockMode) {
    await ensureDemo();
    return delay(mockDecide(flightId, decision));
  }
  return requestJson<DecisionResult>(`/api/flights/${encodeURIComponent(flightId)}/${decision}?scope=active`, {
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
    await ensureDemo();
    mockScenarioIndex = (mockScenarioIndex + 1) % demoFlightSets.length;
    mockFlights = demoFlightSets[mockScenarioIndex].map((f) => ({ ...f }));
    mockSimMinutes = 0;
    mockPlanRevision = 0;
    mockLastOpsNote = null;
    return delay({ incident: mockIncident(), flights: mockFlights.map((f) => ({ ...f })) });
  }
  return requestJson<ScenarioSnapshot>("/api/scenario/next?scope=active", { method: "POST" });
}

/** Advance the live ops clock one tick and return the refreshed snapshot. */
export async function tickNetwork(): Promise<TickSnapshot> {
  if (mockMode) {
    await ensureDemo();
    return delay(mockTick(), 120);
  }
  return requestJson<TickSnapshot>("/api/tick?scope=active", { method: "POST" });
}
