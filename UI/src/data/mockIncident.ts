import type { Incident } from "../types";

export const MOCK_INCIDENT: Incident = {
  id: "inc-cloudstrike-nas-2024",
  name: "Cloud infrastructure outage — NAS cascade",
  region: "Continental United States",
  severity: 0.92,
  startedAt: new Date(Date.now() - 1000 * 60 * 97).toISOString(),
  summary:
    "A major vendor outage disrupted airline ops systems nationwide. Thousands of flights need coordinated reroutes across hub capacity.",
  recoveryProgress: 0.38,
  statusLine: "Skyward solver optimizing hub slots · wave 2 of 4",
};
