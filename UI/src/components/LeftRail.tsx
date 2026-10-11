import type { ReactNode } from "react";
import { LEFT_TABS, type LeftTab } from "../pages";

type Props = {
  tab: LeftTab;
  onTabChange: (tab: LeftTab) => void;
  operations: ReactNode;
  flights: ReactNode;
};

/** Single left panel: Operations (network status) and Flights share one rail. */
export function LeftRail({ tab, onTabChange, operations, flights }: Props) {
  return (
    <aside className="rail rail-left">
      <div className="rail-tabs" role="tablist" aria-label="Network panel">
        {LEFT_TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className="rail-tab"
            data-active={tab === id}
            onClick={() => onTabChange(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="rail-tab-panel" role="tabpanel">
        {tab === "operations" ? operations : flights}
      </div>
    </aside>
  );
}
