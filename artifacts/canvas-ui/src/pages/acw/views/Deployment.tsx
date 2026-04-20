// ACW lens — Deployment & Infrastructure (TOGAF Technology).
//
// Empty zones with empty compute / network / storage slots. The 3D
// canvas primitive is rendered inert (no default scene content).
// No capacity, cost, or performance fields.
import { WorkspaceShell } from "../WorkspaceShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Canvas3D } from "@/components/acw/Canvas3D";
import { LiveStructurePanel } from "@/components/acw/LiveStructurePanel";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";

const LENS_TITLE = "Deployment & Infrastructure";
const LENS_LAYER = "TOGAF Technology";
const LENS_HINT =
  "Empty zones with compute / network / storage slots. The 3D canvas is inert until structure is added.";
const ZONE_LABEL = "Zone";
const COMPUTE_LABEL = "Compute";
const NETWORK_LABEL = "Network";
const STORAGE_LABEL = "Storage";
const SLOT_EMPTY = "No element defined";
const ZONE_COUNT = 3;
const EMPTY_3D_HINT = "Add zones to begin";

assertAllAcwPlaceholderLanguage([
  LENS_TITLE,
  LENS_LAYER,
  LENS_HINT,
  ZONE_LABEL,
  COMPUTE_LABEL,
  NETWORK_LABEL,
  STORAGE_LABEL,
  SLOT_EMPTY,
  EMPTY_3D_HINT,
]);

const SLOT_LABELS: readonly string[] = [COMPUTE_LABEL, NETWORK_LABEL, STORAGE_LABEL];

export default function Deployment() {
  return (
    <WorkspaceShell>
      <Card data-testid="acw-deployment-header">
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

      <Canvas3D
        emptyHint={EMPTY_3D_HINT}
        height={320}
        testId="acw-deployment-canvas"
      />

      <div
        className="grid grid-cols-1 md:grid-cols-3 gap-3"
        data-testid="acw-deployment-zones"
      >
        {Array.from({ length: ZONE_COUNT }).map((_, zi) => (
          <Card
            key={`zone-${zi}`}
            data-testid={`acw-deployment-zone-${zi + 1}`}
            className="border-dashed"
          >
            <CardHeader>
              <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {ZONE_LABEL}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {SLOT_LABELS.map((slot) => (
                <div
                  key={slot}
                  data-testid={`acw-deployment-zone-${zi + 1}-slot-${slot.toLowerCase()}`}
                  className="flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground border border-border/40 rounded px-2 py-1"
                >
                  <span>{slot}</span>
                  <span className="italic text-muted-foreground/60 normal-case tracking-normal">
                    {SLOT_EMPTY}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Technology lens filter: Zone, ComputeNode, and any System
          contained inside a ComputeNode. CONNECTS edges between
          ComputeNodes are surfaced as the only relationship the
          Technology layer authors. */}
      <LiveStructurePanel
        testIdPrefix="acw-deployment-structure"
        nodeFilter={(n) => {
          if (n.type === "Zone" || n.type === "ComputeNode") return true;
          // A System is part of the Technology lens only when it
          // sits inside a ComputeNode. Bare-root Systems belong to
          // the Application / Business lens instead.
          return n.type === "System" && n.parentId !== null;
        }}
        edgeFilter={(e) => e.kind === "CONNECTS"}
      />
    </WorkspaceShell>
  );
}
