// ACW lens — System Landscape (TOGAF Application).
//
// Empty system nodes and placeholder connections on the 2D canvas
// primitive. Instructional empty state. No lifecycle, legacy
// labels, or quality indicators.
//
// Drill-down contract: this lens owns its own depth-path state and
// passes a callback into Canvas2D so that any node placed on the
// canvas in a later iteration becomes a clickable affordance for
// stepping into a deeper level of decomposition. The contract is
// wired today against an empty node set so the API surface is
// demonstrably present; clicking is a no-op until nodes exist.
import { useState } from "react";
import { WorkspaceShell } from "../WorkspaceShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Canvas2D } from "@/components/acw/Canvas2D";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";

const LENS_TITLE = "System Landscape";
const LENS_LAYER = "TOGAF Application";
const LENS_HINT =
  "Empty 2D canvas. Pan with mouse drag, zoom with mouse wheel. Add systems to begin.";
const EMPTY_HINT = "Add systems to begin";
const ROOT_CRUMB = "Root";
const BACK_LABEL = "Step out";
const DEPTH_LABEL = "Depth";

assertAllAcwPlaceholderLanguage([
  LENS_TITLE,
  LENS_LAYER,
  LENS_HINT,
  EMPTY_HINT,
  ROOT_CRUMB,
  BACK_LABEL,
  DEPTH_LABEL,
]);

export default function SystemLandscape() {
  // Depth path: each entry is a system id the reader has stepped
  // into. An empty array means we are at the root level.
  const [depthPath, setDepthPath] = useState<readonly string[]>([]);

  const handleDrillDown = (nodeId: string) => {
    setDepthPath((prev) => [...prev, nodeId]);
  };
  const handleStepOut = () => {
    setDepthPath((prev) => prev.slice(0, -1));
  };

  return (
    <WorkspaceShell>
      <Card data-testid="acw-landscape-header">
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-wider">
            {LENS_TITLE}
          </CardTitle>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {LENS_LAYER}
          </p>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          {LENS_HINT}
        </CardContent>
      </Card>

      <div
        className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-muted-foreground"
        data-testid="acw-landscape-breadcrumb"
      >
        <span>{DEPTH_LABEL}:</span>
        <span data-testid="acw-landscape-breadcrumb-path">
          {[ROOT_CRUMB, ...depthPath].join(" / ")}
        </span>
        {depthPath.length > 0 ? (
          <button
            type="button"
            onClick={handleStepOut}
            className="px-2 py-0.5 border border-border/60 rounded hover:text-primary hover:border-primary/60 transition-colors"
            data-testid="acw-landscape-step-out"
          >
            {BACK_LABEL}
          </button>
        ) : null}
      </div>

      <Canvas2D
        emptyHint={EMPTY_HINT}
        height={420}
        testId="acw-landscape-canvas"
        onNodeDrillDown={handleDrillDown}
      />
    </WorkspaceShell>
  );
}
