import test from "node:test";
import assert from "node:assert/strict";
import { flights } from "../src/data.js";
import { simulateDisaster } from "../src/simulation.js";

test("a diversion balances safety with proximity to the passenger's intended destination", () => {
  const result = simulateDisaster({ airport: "EGLL", radiusNm: 5, severity: "severe" });
  const plan = result.plans.find((item) => item.flightId === flights[0].id);
  assert.equal(plan.action, "reroute");
  assert.equal(plan.plan.diversionAirport, "LFPG");
});
