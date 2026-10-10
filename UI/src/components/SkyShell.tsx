import type { ReactNode } from "react";
import type { SkyMode } from "../hooks/useDayNight";

type Props = {
  mode: SkyMode;
  children: ReactNode;
};

export function SkyShell({ mode, children }: Props) {
  return (
    <div className="sky-shell" data-mode={mode}>
      <div className="sky-backdrop" aria-hidden>
        <div className="sky-stars" />
      </div>
      <div className="sky-content">
        <header className="brand">
          <h1 className="brand-mark">Skyward</h1>
          <p className="brand-tag">Disaster flight recovery</p>
        </header>
        {children}
      </div>
    </div>
  );
}
