// ACW lens — System Landscape (TOGAF Application).
//
// Empty system nodes and placeholder connections on the 2D canvas
// primitive. Instructional empty state. No lifecycle, legacy
// labels, or quality indicators.
import { WorkspaceShell } from "../WorkspaceShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Canvas2D } from "@/components/acw/Canvas2D";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";

const LENS_TITLE = "System Landscape";
const LENS_LAYER = "TOGAF Application";
const LENS_HINT =
  "Empty 2D canvas. Pan with mouse drag, zoom with mouse wheel. Add systems to begin.";
const EMPTY_HINT = "Add systems to begin";

assertAllAcwPlaceholderLanguage([LENS_TITLE, LENS_LAYER, LENS_HINT, EMPTY_HINT]);

export default function SystemLandscape() {
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

      <Canvas2D
        emptyHint={EMPTY_HINT}
        height={420}
        testId="acw-landscape-canvas"
      />
    </WorkspaceShell>
  );
}
