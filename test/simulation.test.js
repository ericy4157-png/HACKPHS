import test from "node:test";
import assert from "node:assert/strict";
import { simulateDisaster } from "../src/simulation.js";

test("a benchmark disaster identifies affected airports and generates only reviewable plans", () => {
  const result = simulateDisaster({ type: "hurricane", airport: "KJFK", radiusNm: 5, severity: "severe" });
  assert.equal(result.mode, "benchmark_simulation_only");
  assert.ok(result.affectedAirports.some((airport) => airport.icao === "KJFK"));
  assert.ok(result.plans.length > 0);
  assert.ok(result.plans.every((plan) => plan.approvalStatus === "pending"));
  assert.ok(result.plans.some((plan) => plan.action === "cancel"));
});

test("the network scenario includes flight rotations", () => {
  const result = simulateDisaster({ airport: "KSEA", radiusNm: 5, severity: "moderate" });
  assert.ok(result.plans.some((plan) => plan.aircraft === "N905SK"));
});
