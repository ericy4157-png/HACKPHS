import http from "node:http";
import { readFile } from "node:fs/promises";
import { airports, flights, restrictedZones } from "./data.js";
import { planReroute } from "./routing.js";
import { operationalNetwork, pullOpenSkyStates } from "./network.js";
import { simulateDisaster } from "./simulation.js";
import { buildOperationalSnapshot } from "./scenarios.js";
import { decideFlight, toUiFlights, toUiIncident } from "./uiApi.js";

const incidents = [];
let refreshNumber = 0;
let operationalSnapshot = buildOperationalSnapshot(refreshNumber);
const approvalQueue = [...operationalSnapshot.plans];
const advanceScenario = () => {
  refreshNumber += 1;
  operationalSnapshot = buildOperationalSnapshot(refreshNumber);
  approvalQueue.length = 0; approvalQueue.push(...operationalSnapshot.plans);
  return operationalSnapshot;
};
const send = (res, status, body) => { res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" }); res.end(JSON.stringify(body)); };
const readJson = async (req) => new Promise((resolve, reject) => { let body = ""; req.on("data", (chunk) => body += chunk); req.on("end", () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error("Invalid JSON")); } }); });

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "OPTIONS") return send(res, 204, {});
    if (req.method === "GET" && url.pathname === "/") {
      const page = await readFile(new URL("../public/index.html", import.meta.url));
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(page);
    }
    if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { status: "ok", service: "skyward-ops-api", now: new Date().toISOString() });
    if (req.method === "GET" && url.pathname === "/v1/airports") return send(res, 200, { airports });
    if (req.method === "GET" && url.pathname === "/v1/flights") return send(res, 200, { flights });
    if (req.method === "GET" && url.pathname === "/v1/network") return send(res, 200, operationalNetwork());
    if (req.method === "GET" && url.pathname === "/v1/dashboard") return send(res, 200, operationalSnapshot);
    if (req.method === "POST" && url.pathname === "/v1/dashboard/refresh") return send(res, 200, advanceScenario());
    // Globe UI contract (UI/src/api/client.ts).
    if (req.method === "GET" && url.pathname === "/api/incident") return send(res, 200, toUiIncident(operationalSnapshot));
    if (req.method === "GET" && url.pathname === "/api/flights") return send(res, 200, toUiFlights(operationalSnapshot));
    if (req.method === "POST" && url.pathname === "/api/scenario/next") {
      const snapshot = advanceScenario();
      return send(res, 200, { incident: toUiIncident(snapshot), flights: toUiFlights(snapshot) });
    }
    const uiFlightMatch = url.pathname.match(/^\/api\/flights\/([^/]+)$/);
    if (req.method === "GET" && uiFlightMatch) {
      const flight = toUiFlights(operationalSnapshot).find((item) => item.id === decodeURIComponent(uiFlightMatch[1]));
      return flight ? send(res, 200, flight) : send(res, 404, { error: "Unknown flight" });
    }
    const uiDecisionMatch = url.pathname.match(/^\/api\/flights\/([^/]+)\/(accept|reject)$/);
    if (req.method === "POST" && uiDecisionMatch) {
      const flightId = decodeURIComponent(uiDecisionMatch[1]);
      const input = await readJson(req);
      const flight = decideFlight(operationalSnapshot, flightId, uiDecisionMatch[2], input.decidedBy);
      if (!flight) return send(res, 404, { error: "No recovery plan for this flight in the current scenario" });
      return send(res, 200, { ok: true, flightId, flight, incident: toUiIncident(operationalSnapshot), notice: "Decision recorded only; dispatch/ATC execution is intentionally not automated." });
    }
    if (req.method === "GET" && url.pathname === "/v1/integrations/opensky/states") return send(res, 200, await pullOpenSkyStates());
    if (req.method === "GET" && url.pathname === "/v1/airspace/restrictions") return send(res, 200, { restrictions: restrictedZones });
    if (req.method === "GET" && url.pathname === "/v1/incidents") return send(res, 200, { incidents });
    if (req.method === "GET" && url.pathname === "/v1/disruption-plans") return send(res, 200, { plans: approvalQueue });
    if (req.method === "POST" && url.pathname === "/v1/simulations/disaster") {
      const simulation = simulateDisaster(await readJson(req));
      approvalQueue.unshift(...simulation.plans);
      return send(res, 201, simulation);
    }
    if (req.method === "POST" && url.pathname === "/v1/incidents") {
      const incident = await readJson(req);
      if (!incident.airport || !incident.type) return send(res, 400, { error: "airport and type are required" });
      const airport = airports.find((a) => a.icao === incident.airport);
      if (!airport) return send(res, 404, { error: "Unknown airport" });
      if (incident.type === "airport_closed") airport.status = "closed";
      const stored = { id: `INC-${Date.now()}`, createdAt: new Date().toISOString(), active: true, ...incident };
      incidents.unshift(stored);
      // This is the live-style workflow: create approval items automatically, but never execute them.
      const pipeline = incident.type === "airport_closed" ? simulateDisaster({ airport: incident.airport, radiusNm: 1, severity: incident.severity || "moderate", type: incident.reason || "airport closure" }) : null;
      if (pipeline) approvalQueue.unshift(...pipeline.plans);
      return send(res, 201, { incident: stored, generatedApprovalPlans: pipeline?.plans.length || 0 });
    }
    const approvalMatch = url.pathname.match(/^\/v1\/disruption-plans\/([^/]+)\/approve$/);
    if (req.method === "POST" && approvalMatch) {
      const plan = approvalQueue.find((item) => item.id === decodeURIComponent(approvalMatch[1]));
      if (!plan) return send(res, 404, { error: "Unknown disruption plan" });
      const input = await readJson(req);
      plan.approvalStatus = "approved"; plan.approvedAt = new Date().toISOString(); plan.approvedBy = input.approvedBy || "unattributed-operator";
      return send(res, 200, { plan, notice: "Approval recorded only; external dispatch/ATC execution is intentionally not automated." });
    }
    const match = url.pathname.match(/^\/v1\/flights\/([^/]+)\/reroute$/);
    if (req.method === "POST" && match) {
      const flight = flights.find((item) => item.id === decodeURIComponent(match[1]));
      if (!flight) return send(res, 404, { error: "Unknown flight" });
      const input = await readJson(req);
      const closedAirports = airports.filter((airport) => airport.status === "closed").map((airport) => airport.icao);
      const destination = input.destination || (closedAirports.includes(flight.destination) ? undefined : flight.destination);
      if (!destination) return send(res, 409, { error: "Destination is closed. Supply an alternate destination ICAO." });
      return send(res, 200, planReroute({ flight, destination, closedAirports, policy: input.policy || { avoidHighTerrain: true } }));
    }
    return send(res, 404, { error: "Route not found" });
  } catch (error) { return send(res, 400, { error: error.message }); }
});

if (process.env.NODE_ENV !== "test") server.listen(process.env.PORT || 3000, () => console.log("Skyward API listening on :3000"));
export { server };
