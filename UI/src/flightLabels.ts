import type { Flight } from "./types";

export const ACTION_LABEL: Record<NonNullable<Flight["action"]>, string> = {
  reroute: "Divert",
  delay: "Delay",
  cancel: "Cancel & rebook",
  hold_for_human_review: "Manual review",
};
