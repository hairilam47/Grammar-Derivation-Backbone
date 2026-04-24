// ACW Track 3 — floating overlay for the full-page architecture
// canvas (Phase 4, Task #81).
//
// Wraps every non-canvas UI element that previously lived in the
// inline shell (architecture name, refresh button, view-mode
// toggle, perspective selector, layer toggles, stratum legend)
// and positions them as absolutely-positioned quadrants over the
// fullscreen canvas. The overlay is purely presentational; it
// imports nothing from the diagram primitives. The shell wires
// data + callbacks through props so the renderer-isolation
// invariant continues to hold.
//
// Pointer-event discipline: each quadrant `<div>` carries
// `pointer-events-none` so the underlying Three.js / SVG canvas
// continues to receive drag / wheel / click events anywhere
// outside an interactive child. Every interactive child carries
// `pointer-events-auto` to re-enable clicks.
import { useState } from "react";
import { Link } from "wouter";
import { Crosshair, Layers, RefreshCcw, Settings, X, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { assertAllAcwTrack3Language } from "@/governance/staticTextGuard";
import {
  TRACK3_LAYERS,
  TRACK3_PERSPECTIVES,
  type Track3Layer,
  type Track3Perspective,
} from "@/acw/track3/track3Types";
import type { Track3ViewMode } from "@/acw/track3/track3ViewPrefs";

const OVERLAY_LABELS = {
  refreshFromArch: "Refresh from architecture",
  exitFullscreen: "Exit full-screen",
  closeControls: "Close controls",
  openControls: "Open controls",
  modeLabel: "Mode",
  mode2D: "2D",
  mode3D: "3D",
  perspectiveLabel: "Perspective",
  layersLabel: "Layers",
  perspectiveAll: "All layers",
  perspectiveInfra: "Infrastructure-centric",
  perspectiveApp: "Application-centric",
  perspectiveIntegration: "Integration-centric",
  layerInfrastructure: "Infrastructure",
  layerApplication: "Application",
  layerIntegration: "Integration",
  layerCrossCutting: "Cross-Cutting",
  layerOps: "Ops & Lifecycle",
  stratumLegend: "Z axis = stratum",
  focusedHeading: "Focused on",
  clearFocus: "Clear focus",
  openArchitecture: "Open architecture workspace",
  escHint: "Press Esc to exit full-screen",
} as const;

assertAllAcwTrack3Language(Object.values(OVERLAY_LABELS));

const PERSPECTIVE_LABEL: Readonly<Record<Track3Perspective, string>> = {
  all: OVERLAY_LABELS.perspectiveAll,
  infraCentric: OVERLAY_LABELS.perspectiveInfra,
  appCentric: OVERLAY_LABELS.perspectiveApp,
  integrationCentric: OVERLAY_LABELS.perspectiveIntegration,
};

function formatLayerLabel(l: Track3Layer): string {
  switch (l) {
    case "infrastructure":
      return OVERLAY_LABELS.layerInfrastructure;
    case "application":
      return OVERLAY_LABELS.layerApplication;
    case "integration":
      return OVERLAY_LABELS.layerIntegration;
    case "crossCutting":
      return OVERLAY_LABELS.layerCrossCutting;
    case "ops":
      return OVERLAY_LABELS.layerOps;
  }
}

export interface Track3FloatingOverlayProps {
  readonly architectureId: string;
  readonly architectureName: string;
  readonly viewMode: Track3ViewMode;
  readonly perspective: Track3Perspective;
  readonly hiddenLayers: readonly string[];
  readonly focusedLabel: string | null;
  readonly onSetViewMode: (mode: Track3ViewMode) => void;
  readonly onSetPerspective: (p: Track3Perspective) => void;
  readonly onToggleLayer: (layerId: string) => void;
  readonly onClearFocus: () => void;
  readonly onRefresh: () => void;
  readonly onExitFullscreen: () => void;
}

export function Track3FloatingOverlay(props: Track3FloatingOverlayProps) {
  const [controlsOpen, setControlsOpen] = useState(false);
  return (
    <>
      {/* Top-left quadrant: architecture identity + refresh +
          exit-fullscreen. */}
      <div
        className="pointer-events-none absolute top-3 left-3 flex flex-col gap-2 max-w-[60vw]"
        data-testid="track3-overlay-topleft"
      >
        <div className="pointer-events-auto inline-flex items-center gap-2 rounded-md border border-border/50 bg-card/80 backdrop-blur px-3 py-1.5 text-xs">
          <Layers className="w-3.5 h-3.5 text-primary" />
          <span
            className="font-mono truncate max-w-[40vw]"
            data-testid="track3-overlay-arch-name"
            title={props.architectureName}
          >
            {props.architectureName || props.architectureId}
          </span>
        </div>
        <div className="pointer-events-auto inline-flex items-center gap-1">
          <Link
            href={`/ctad/arch/${encodeURIComponent(props.architectureId)}`}
          >
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[10px]"
              data-testid="track3-overlay-open-arch"
            >
              {OVERLAY_LABELS.openArchitecture}
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[10px]"
            onClick={props.onRefresh}
            data-testid="track3-overlay-refresh"
          >
            <RefreshCcw className="w-3 h-3 mr-1" />
            {OVERLAY_LABELS.refreshFromArch}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[10px]"
            onClick={props.onExitFullscreen}
            data-testid="track3-overlay-exit-fullscreen"
            title={OVERLAY_LABELS.escHint}
          >
            <Minimize2 className="w-3 h-3 mr-1" />
            {OVERLAY_LABELS.exitFullscreen}
          </Button>
        </div>
        {props.focusedLabel !== null && (
          <div
            className="pointer-events-auto inline-flex items-center gap-2 rounded-md border border-primary/40 bg-card/80 backdrop-blur px-2 py-1 text-[11px]"
            data-testid="track3-overlay-focus"
          >
            <Crosshair className="w-3 h-3 text-primary" />
            <span className="text-muted-foreground uppercase tracking-wider text-[9px]">
              {OVERLAY_LABELS.focusedHeading}
            </span>
            <span className="text-primary font-mono truncate max-w-[30vw]">
              {props.focusedLabel}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={props.onClearFocus}
              data-testid="track3-overlay-clear-focus"
              className="h-5 text-[10px] px-1.5"
            >
              {OVERLAY_LABELS.clearFocus}
            </Button>
          </div>
        )}
      </div>

      {/* Bottom-centre: stratum legend pill. */}
      <div
        className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2"
        data-testid="track3-overlay-bottomcenter"
      >
        <div
          className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-border/50 bg-card/80 backdrop-blur px-3 py-1 text-[10px] uppercase tracking-widest text-muted-foreground"
          data-testid="track3-overlay-stratum-legend"
        >
          {OVERLAY_LABELS.stratumLegend}
        </div>
      </div>

      {/* Bottom-right: collapsible controls cluster. */}
      <div
        className="pointer-events-none absolute bottom-3 right-3 flex flex-col items-end gap-2 max-w-[90vw]"
        data-testid="track3-overlay-bottomright"
      >
        {controlsOpen && (
          <div
            className="pointer-events-auto rounded-md border border-border/50 bg-card/90 backdrop-blur p-3 flex flex-col gap-3 text-xs min-w-[260px]"
            data-testid="track3-overlay-controls-panel"
          >
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground uppercase tracking-wider text-[10px] shrink-0">
                {OVERLAY_LABELS.modeLabel}
              </span>
              <div className="inline-flex rounded-md border border-border overflow-hidden">
                <button
                  type="button"
                  data-testid="track3-overlay-mode-2d"
                  onClick={() => props.onSetViewMode("2d")}
                  className={`px-2 py-1 text-[11px] ${props.viewMode === "2d" ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}
                >
                  {OVERLAY_LABELS.mode2D}
                </button>
                <button
                  type="button"
                  data-testid="track3-overlay-mode-3d"
                  onClick={() => props.onSetViewMode("3d")}
                  className={`px-2 py-1 text-[11px] ${props.viewMode === "3d" ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}
                >
                  {OVERLAY_LABELS.mode3D}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-muted-foreground uppercase tracking-wider text-[10px] shrink-0">
                {OVERLAY_LABELS.perspectiveLabel}
              </span>
              <select
                data-testid="track3-overlay-perspective"
                value={props.perspective}
                onChange={(e) =>
                  props.onSetPerspective(e.target.value as Track3Perspective)
                }
                className="rounded-md border border-border bg-background px-2 py-1 text-xs flex-1"
              >
                {TRACK3_PERSPECTIVES.map((p) => (
                  <option key={p} value={p}>
                    {PERSPECTIVE_LABEL[p]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground uppercase tracking-wider text-[10px]">
                {OVERLAY_LABELS.layersLabel}
              </span>
              <div className="flex flex-wrap gap-2">
                {TRACK3_LAYERS.map((l) => {
                  const active = !props.hiddenLayers.includes(l);
                  return (
                    <label
                      key={l}
                      className="inline-flex items-center gap-1.5 text-[11px]"
                      data-testid={`track3-overlay-layer-toggle-${l}`}
                    >
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() => props.onToggleLayer(l)}
                      />
                      <span>{formatLayerLabel(l)}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          className="pointer-events-auto h-8 w-8 p-0"
          onClick={() => setControlsOpen((v) => !v)}
          data-testid="track3-overlay-controls-toggle"
          title={
            controlsOpen
              ? OVERLAY_LABELS.closeControls
              : OVERLAY_LABELS.openControls
          }
        >
          {controlsOpen ? (
            <X className="w-4 h-4" />
          ) : (
            <Settings className="w-4 h-4" />
          )}
        </Button>
      </div>
    </>
  );
}
