import { simulateDisaster } from "./simulation.js";

const scenarios = [
  { label: "Atlantic hurricane band", events: [{ type: "hurricane", airport: "KMIA", radiusNm: 125, severity: "severe", windowHours: 24 }, { type: "severe weather", airport: "KATL", radiusNm: 55, severity: "moderate", windowHours: 24 }] },
  { label: "North Atlantic wind disruption", events: [{ type: "windstorm", airport: "EGLL", radiusNm: 45, severity: "severe", windowHours: 24 }, { type: "flooding", airport: "EHAM", radiusNm: 25, severity: "moderate", windowHours: 24 }] },
  { label: "Pacific volcanic ash advisory", events: [{ type: "volcanic ash", airport: "RJTT", radiusNm: 160, severity: "severe", windowHours: 24 }, { type: "typhoon", airport: "VHHH", radiusNm: 80, severity: "moderate", windowHours: 24 }] },
  { label: "Mediterranean heat and wildfire event", events: [{ type: "wildfire", airport: "LIRF", radiusNm: 65, severity: "moderate", windowHours: 24 }, { type: "heat event", airport: "LTFM", radiusNm: 45, severity: "moderate", windowHours: 24 }] }
];

export function buildOperationalSnapshot(refreshNumber = 0) {
  const scenario = scenarios[refreshNumber % scenarios.length];
  const simulations = scenario.events.map((event) => simulateDisaster(event));
  const plans = simulations.flatMap((simulation) => simulation.plans);
  const uniqueAirports = [...new Map(simulations.flatMap((simulation) => simulation.affectedAirports).map((airport) => [airport.icao, airport])).values()];
  const summary = plans.reduce((total, plan) => ({ ...total, [plan.action]: (total[plan.action] || 0) + 1, passengersAffected: total.passengersAffected + plan.passengers }), { passengersAffected: 0 });
  return { mode: "synthetic_network_test_run", refreshedAt: new Date().toISOString(), refreshNumber, scenario: scenario.label, activeEvents: scenario.events, affectedAirports: uniqueAirports, plans, summary, notice: "Synthetic, benchmark-only operational picture. All recommendations require human review and do not execute flight operations." };
}
