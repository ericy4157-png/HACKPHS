import type { Flight } from "./types";

export const ACTION_LABEL: Record<NonNullable<Flight["action"]>, string> = {
  reroute: "Divert",
  delay: "Delay",
  cancel: "Cancel & rebook",
  hold_for_human_review: "Manual review",
};

/** Pending recovery plans that still need a human. */
export function needsDecision(flight: Flight): boolean {
  return flight.status !== "ok" && (flight.approvalStatus === undefined || flight.approvalStatus === "pending");
}

/** One-line reason a flight is on the board, for notices and the approval card. */
export function affectedHow(flight: Flight): string {
  if (flight.supersededReason) return `Plan rewritten: ${flight.supersededReason}`;
  if (flight.action) {
    const delay = flight.delayMinutes ? ` · +${flight.delayMinutes}m` : "";
    return `${ACTION_LABEL[flight.action]}${delay}`;
  }
  if (flight.status === "disrupted") return "Disrupted";
  if (flight.status === "rerouting") return "Rerouting";
  if (flight.status === "rerouted") return "Rerouted";
  return "Affected";
}
