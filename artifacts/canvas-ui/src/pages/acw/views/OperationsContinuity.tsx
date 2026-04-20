// ACW lens — Operations & Continuity (cross-layer, descriptive only).
//
// Empty redundancy containers with neutral text annotations. No
// SLAs, availability scores, or risk ratings.
import { WorkspaceShell } from "../WorkspaceShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";

const LENS_TITLE = "Operations & Continuity";
const LENS_LAYER = "Cross-layer — descriptive only";
const LENS_HINT =
  "Empty redundancy containers. Annotations are plain text; no availability or continuity figures are inferred.";
const REDUNDANCY_LABEL = "Redundancy container";
const ANNOTATION_LABEL = "Annotation";
const ANNOTATION_EMPTY = "No annotation written";
const CONTAINER_COUNT = 3;

assertAllAcwPlaceholderLanguage([
  LENS_TITLE,
  LENS_LAYER,
  LENS_HINT,
  REDUNDANCY_LABEL,
  ANNOTATION_LABEL,
  ANNOTATION_EMPTY,
]);

export default function OperationsContinuity() {
  return (
    <WorkspaceShell>
      <Card data-testid="acw-operations-header">
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
        className="grid grid-cols-1 md:grid-cols-3 gap-3"
        data-testid="acw-operations-containers"
      >
        {Array.from({ length: CONTAINER_COUNT }).map((_, i) => (
          <Card
            key={`container-${i}`}
            data-testid={`acw-operations-container-${i + 1}`}
            className="border-dashed"
          >
            <CardHeader>
              <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {REDUNDANCY_LABEL}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-[11px]">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                {ANNOTATION_LABEL}
              </p>
              <p className="italic text-muted-foreground/70 min-h-[40px]">
                {ANNOTATION_EMPTY}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </WorkspaceShell>
  );
}
