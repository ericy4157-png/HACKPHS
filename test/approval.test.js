import test from "node:test";
import assert from "node:assert/strict";
import { buildOperationalSnapshot } from "../src/scenarios.js";
import { simulateDisaster } from "../src/simulation.js";

// server.js only auto-listens on :3000 outside NODE_ENV=test, so set it before importing.
process.env.NODE_ENV = "test";
const { server } = await import("../src/server.js");

test("every seeded scenario starts with all plans pending human approval", () => {
  for (const refreshNumber of [0, 1, 2, 3]) {
    const { plans } = buildOperationalSnapshot(refreshNumber);
    assert.ok(plans.length > 0);
    assert.ok(plans.every((plan) => plan.approvalStatus === "pending"), `scenario ${refreshNumber + 1}`);
  }
});

test("benchmark simulations create only pending plans", () => {
  const { plans } = simulateDisaster({ type: "typhoon", airport: "VHHH", radiusNm: 80, severity: "severe" });
  assert.ok(plans.length > 0);
  assert.ok(plans.every((plan) => plan.approvalStatus === "pending"));
});

test("an airport closure created through the API queues pending plans only", async (t) => {
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  const created = await fetch(`${base}/v1/incidents`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ airport: "EGLL", type: "airport_closed", reason: "flooding" })
  });
  assert.equal(created.status, 201);
  assert.ok((await created.json()).generatedApprovalPlans > 0);

  const { plans } = await (await fetch(`${base}/v1/disruption-plans`)).json();
  assert.ok(plans.length > 0);
  assert.ok(plans.every((plan) => plan.approvalStatus === "pending"));
});
