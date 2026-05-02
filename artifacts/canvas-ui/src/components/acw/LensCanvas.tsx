// ACW v3 — lens canvas wrapper.
//
// Hosts the per-lens 2D/3D toggle and dispatches to either
// `InteractiveCanvas2D` or `Canvas3DStructural`. Both renderers
// receive the IDENTICAL `(lensId, nodes, edges, focusedParentId,
// onDrillDown)` props so neither can fabricate structure the
// other does not also surface.
//
// Toggle behaviour:
//   - Default mode is "2d" (per the v3 brief: degrade to 2D when
//     in doubt).
//   - Mode is per-lens, persisted in `acw-view-1.0` via
//     `setViewMode`. The schema is unchanged (additive optional
//     field).
//   - When WebGL is unavailable in the browser, the toggle silently
//     falls back to 2D — picking 3D in that environment shows the
//     2D canvas, with the toggle still selectable so the user can
//     try 3D again on a different device.
//
// Forbidden semantics carried over from the inner renderers:
//   - No animation between modes.
//   - No mode badge / colour mapped to judgement.
//   - Toggle controls visualisation only — picking 3D never
//     changes the workspace document.
import { useEffect, useState } from "react";
import { Layers } from "lucide-react";
import { InteractiveCanvas2D, type InteractiveCanvas2DProps } from "./InteractiveCanvas2D";
import { Canvas3DStructural } from "./Canvas3DStructural";
import { detectWebGL } from "./Canvas3D";
import {
  getViewMode,
  setViewMode,
  subscribeViewState,
  type AcwLensViewMode,
} from "@/acw/acwViewState";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";

const VIEW_LABEL = "View";
const MODE_2D_LABEL = "2D";
const MODE_3D_LABEL = "3D";
// Canvas Enhancements — layers panel toggle button label.
const LAYERS_LABEL = "Layers";

assertAllAcwPlaceholderLanguage([VIEW_LABEL, MODE_2D_LABEL, MODE_3D_LABEL, LAYERS_LABEL]);

// Canvas Enhancements — extend with layers-panel props so the toggle
// button can live alongside the 2D/3D toggle in the same toolbar row.
// Both props are optional: call sites that have not adopted the layers
// panel omit them and the button is simply absent.
export type LensCanvasProps = InteractiveCanvas2DProps & {
  readonly layersPanelOpen?: boolean;
  readonly onLayersToggle?: () => void;
};

export function LensCanvas(props: LensCanvasProps) {
  const { lensId, testId = "acw-lens-canvas", layersPanelOpen, onLayersToggle } = props;

  // Subscribe to view-state so the toggle reflects external changes.
  const [viewTick, setViewTick] = useState(0);
  useEffect(() => subscribeViewState(() => setViewTick((t) => t + 1)), []);

  // WebGL availability — probed once on mount. Until the probe runs
  // we render nothing 3D (the inner Canvas3D does the same dance
  // for its own fallback hint).
  const [webglOk, setWebglOk] = useState<boolean | null>(null);
  useEffect(() => setWebglOk(detectWebGL()), []);

  const storedMode = getViewMode(lensId);
  // Silent fallback: when WebGL is unavailable we render the 2D
  // canvas regardless of the stored preference. The toggle still
  // surfaces the user's pick so it persists across devices.
  const effectiveMode: AcwLensViewMode =
    storedMode === "3d" && webglOk === false ? "2d" : storedMode;

  // Re-read mode each render so subscribers stay in sync with the
  // singleton. `viewTick` is a render bumper.
  void viewTick;

  return (
    <div
      data-testid={testId}
      data-lens-canvas-mode={effectiveMode}
      className="space-y-2"
    >
      <div
        className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground"
        data-testid={`${testId}-toggle`}
      >
        <span>{VIEW_LABEL}:</span>
        {(["2d", "3d"] as const).map((m) => {
          const active = storedMode === m;
          const label = m === "2d" ? MODE_2D_LABEL : MODE_3D_LABEL;
          return (
            <button
              key={m}
              type="button"
              onClick={() => setViewMode(lensId, m)}
              className={`px-2 py-0.5 rounded border transition-colors ${
                active
                  ? "border-primary text-primary"
                  : "border-border/60 hover:text-primary hover:border-primary/60"
              }`}
              data-testid={`${testId}-toggle-${m}`}
              aria-pressed={active}
            >
              {label}
            </button>
          );
        })}
        {/* Canvas Enhancements — layers panel toggle. Only rendered
            when the host opts in by supplying onLayersToggle. */}
        {onLayersToggle !== undefined ? (
          <button
            type="button"
            onClick={onLayersToggle}
            className={`px-2 py-0.5 rounded border transition-colors ${
              layersPanelOpen
                ? "border-primary text-primary"
                : "border-border/60 hover:text-primary hover:border-primary/60"
            }`}
            data-testid={`${testId}-toggle-layers`}
            aria-pressed={layersPanelOpen ?? false}
            title={LAYERS_LABEL}
            aria-label={LAYERS_LABEL}
          >
            <Layers className="h-3 w-3" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {effectiveMode === "2d" ? (
        <InteractiveCanvas2D {...props} />
      ) : (
        <Canvas3DStructural
          lensId={props.lensId}
          nodes={props.nodes}
          edges={props.edges}
          focusedParentId={props.focusedParentId}
          onDrillDown={props.onDrillDown}
          emptyHint={props.emptyHint}
          height={props.height}
          testId={`${testId}-3d`}
        />
      )}
    </div>
  );
}
