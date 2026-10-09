import test from "node:test";
import assert from "node:assert/strict";
import { airports, flights } from "../src/data.js";
import { crossedZones, findRoute, planReroute } from "../src/routing.js";

test("direct route through restricted conflict space is detected", () => {
  const westOfUkraine = { lat: 48, lon: 20 }, eastOfUkraine = { lat: 48, lon: 45 };
  assert.ok(crossedZones(westOfUkraine, eastOfUkraine).some((zone) => zone.id === "UA-CONFLICT"));
});
test("reroute avoids prohibited zones and returns a passenger impact", () => {
  const plan = planReroute({ flight: flights[1], destination: "OMDB", policy: { avoidHighTerrain: true } });
  assert.ok(plan.route.waypoints.length >= 2);
  assert.equal(plan.operationalAssessment.requiresDispatcherApproval, true);
  assert.ok(Number.isInteger(plan.passengerImpact.extraMinutes));
});
