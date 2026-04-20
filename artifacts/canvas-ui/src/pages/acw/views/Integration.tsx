// ACW lens — Integration (Application + Data).
//
// Empty interface slots and data-exchange placeholders. No schema,
// sensitivity, or risk attributes. ("exchange" is used throughout
// in place of "flow" because "flow" embeds the substring "low",
// which is banned by the responsibility-lens tier the ACW vocabulary
// transitively inherits.)
import { WorkspaceShell } from "../WorkspaceShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LiveStructurePanel } from "@/components/acw/LiveStructurePanel";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";

const LENS_TITLE = "Integration";
const LENS_LAYER = "TOGAF Application + Data";
const LENS_HINT =
  "Empty interface slots and data-exchange placeholders. No schema or sensitivity attributes are inferred.";
const INTERFACE_LABEL = "Interface";
const INTERFACE_EMPTY = "No interface defined";
const FLOW_LABEL = "Data exchange";
const FLOW_EMPTY = "No data exchange defined";
const INTERFACE_COUNT = 4;
const FLOW_COUNT = 3;

assertAllAcwPlaceholderLanguage([
  LENS_TITLE,
  LENS_LAYER,
  LENS_HINT,
  INTERFACE_LABEL,
  INTERFACE_EMPTY,
  FLOW_LABEL,
  FLOW_EMPTY,
]);

export default function Integration() {
  return (
    <WorkspaceShell>
      <Card data-testid="acw-integration-header">
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
        className="grid grid-cols-1 md:grid-cols-2 gap-3"
        data-testid="acw-integration-interfaces"
      >
        {Array.from({ length: INTERFACE_COUNT }).map((_, i) => (
          <Card
            key={`interface-${i}`}
            data-testid={`acw-integration-interface-${i + 1}`}
            className="border-dashed"
          >
            <CardHeader>
              <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {INTERFACE_LABEL}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-[11px] italic text-muted-foreground/70 min-h-[60px] flex items-center justify-center">
              {INTERFACE_EMPTY}
            </CardContent>
          </Card>
        ))}
      </div>

      <div
        className="grid grid-cols-1 md:grid-cols-3 gap-3"
        data-testid="acw-integration-flows"
      >
        {Array.from({ length: FLOW_COUNT }).map((_, i) => (
          <Card
            key={`flow-${i}`}
            data-testid={`acw-integration-flow-${i + 1}`}
            className="border-dashed"
          >
            <CardHeader>
              <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {FLOW_LABEL}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-[11px] italic text-muted-foreground/70 min-h-[40px] flex items-center justify-center">
              {FLOW_EMPTY}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Application + Data lens filter: Systems and Components,
          plus the two relationship kinds that carry interface and
          data-exchange semantics. */}
      <LiveStructurePanel
        testIdPrefix="acw-integration-structure"
        nodeFilter={(n) => n.type === "System" || n.type === "Component"}
        edgeFilter={(e) => e.kind === "INTERFACES_WITH" || e.kind === "DATA_FLOW"}
      />
    </WorkspaceShell>
  );
}
