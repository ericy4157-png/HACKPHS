export const LEFT_TABS = [
  { id: "operations", label: "Operations" },
  { id: "flights", label: "Flights" },
] as const;

export type LeftTab = (typeof LEFT_TABS)[number]["id"];

export const APP_PAGES = [
  { id: "dashboard", label: "Dashboard" },
  { id: "network", label: "Network" },
  { id: "sheet", label: "Flight sheet" },
] as const;
