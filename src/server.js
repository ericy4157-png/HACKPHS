import http from "node:http";
import { readFile } from "node:fs/promises";
import { airports, flights, restrictedZones } from "./data.js";
import { planReroute } from "./routing.js";

const incidents = [];
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
    if (req.method === "GET" && url.pathname === "/v1/airspace/restrictions") return send(res, 200, { restrictions: restrictedZones });
    if (req.method === "GET" && url.pathname === "/v1/incidents") return send(res, 200, { incidents });
    if (req.method === "POST" && url.pathname === "/v1/incidents") {
      const incident = await readJson(req);
      if (!incident.airport || !incident.type) return send(res, 400, { error: "airport and type are required" });
      const airport = airports.find((a) => a.icao === incident.airport);
      if (!airport) return send(res, 404, { error: "Unknown airport" });
      if (incident.type === "airport_closed") airport.status = "closed";
      const stored = { id: `INC-${Date.now()}`, createdAt: new Date().toISOString(), active: true, ...incident };
      incidents.unshift(stored); return send(res, 201, { incident: stored });
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
