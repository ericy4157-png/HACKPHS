import type { CSSProperties, ReactNode } from "react";
import type { SkyMode } from "../hooks/useDayNight";
import type { StoryLayers } from "../hooks/useStoryScroll";

type Props = {
  mode: SkyMode;
  layers: StoryLayers;
  page?: "dashboard" | "network" | "sheet";
  /** When true, story parallax is off; dashboard may scroll and the globe may zoom. */
  scrollLocked?: boolean;
  onBrandClick?: () => void;
  children: ReactNode;
};

export function SkyShell({ mode, layers, page, scrollLocked = false, onBrandClick, children }: Props) {
  const style = {
    "--story-p": String(layers.eased),
    "--dash-p": String(layers.dash),
    "--swoosh-p": String(layers.swoosh),
    "--globe-p": String(layers.globe),
    "--rail-p": String(layers.rail),
    "--sky-p": String(layers.sky),
  } as CSSProperties;

  return (
    <div
      className="sky-shell"
      data-mode={mode}
      data-page={page ?? (layers.progress > 0.55 ? "network" : "dashboard")}
      data-story={layers.progress > 0.55 ? "network" : "dashboard"}
      data-scroll-lock={scrollLocked}
      style={style}
    >
      <div className="sky-backdrop" aria-hidden>
        <div className="sky-stars" />
      </div>
      <div className="sky-content">
        <header className="brand">
          <button type="button" className="brand-mark" onClick={onBrandClick} title="Back to dashboard">
            Skyward
          </button>
          <p className="brand-tag">Disaster flight recovery</p>
        </header>
        {children}
      </div>
    </div>
  );
}
