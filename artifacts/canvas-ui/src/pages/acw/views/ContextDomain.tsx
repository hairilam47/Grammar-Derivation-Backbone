// ACW lens — Context & Domain (TOGAF Business, structural only).
//
// Empty domain panels with neutral labels. No processes, KPIs, or
// value metrics.
import { WorkspaceShell } from "../WorkspaceShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";

const LENS_TITLE = "Context & Domain";
const LENS_LAYER = "TOGAF Business — structural only";
const LENS_HINT =
  "Empty domain panels. Domains are placeholders; no content is generated.";
const PANEL_LABEL = "Business Domain";
const PANEL_EMPTY = "No systems defined";
const PANEL_COUNT = 4;

assertAllAcwPlaceholderLanguage([
  LENS_TITLE,
  LENS_LAYER,
  LENS_HINT,
  PANEL_LABEL,
  PANEL_EMPTY,
]);

export default function ContextDomain() {
  return (
    <WorkspaceShell>
      <Card data-testid="acw-context-header">
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
        data-testid="acw-context-panels"
      >
        {Array.from({ length: PANEL_COUNT }).map((_, i) => (
          <Card
            key={i}
            data-testid={`acw-context-panel-${i + 1}`}
            className="border-dashed"
          >
            <CardHeader>
              <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {PANEL_LABEL}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-[11px] italic text-muted-foreground/70 min-h-[80px] flex items-center justify-center">
              {PANEL_EMPTY}
            </CardContent>
          </Card>
        ))}
      </div>
    </WorkspaceShell>
  );
}
