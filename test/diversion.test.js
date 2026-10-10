import test from "node:test";
import assert from "node:assert/strict";
import { simulateDisaster } from "../src/simulation.js";

test("a diversion balances safety with proximity to the passenger's intended destination", () => {
  // SKY821 (Hong Kong to Tokyo) diverts to Seoul, close to Tokyo, rather than turning back.
  const result = simulateDisaster({ airport: "RJTT", radiusNm: 5, severity: "severe" });
  const plan = result.plans.find((item) => item.flightId === "SKY821");
  assert.equal(plan.action, "reroute");
  assert.equal(plan.plan.diversionAirport, "RKSI");
});
