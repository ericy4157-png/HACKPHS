import type { ScenarioSnapshot } from "../types";
import snapshot from "./demoSnapshot.json";

/**
 * Offline demo data: a frozen copy of the backend's four seeded scenarios, as returned by
 * GET /api/incident + GET /api/flights (scenario 1) and POST /api/scenario/next (scenarios 2-4).
 * The fallback therefore shows the same 32-airport network as the API.
 *
 * To refresh it, start the API fresh, capture those responses in order, and save them into
 * demoSnapshot.json under "scenarios". The UI never imports backend code.
 */
export const DEMO_CAPTURED_AT: string = snapshot.capturedAt;
// Through `unknown`: TypeScript infers JSON paths as number[][], which it will not compare
// directly with the [lat, lng] tuples once the snapshot holds the full multi-day network.
export const DEMO_SCENARIOS: ScenarioSnapshot[] = snapshot.scenarios as unknown as ScenarioSnapshot[];
