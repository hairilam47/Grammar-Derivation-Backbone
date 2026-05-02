// ACW lens — System Landscape (TOGAF Application).
//
// v2: the lens hosts the InteractiveCanvas2D primitive (drag-to-
// move, drag-to-reparent, manual grouping into a Zone, per-lens
// collapse / expand, nested containment cues, alignment guides).
// The structureGraph schema is unchanged (`acw-1.0`); per-lens
// collapse state lives in the separate `acw-view-1.0` document.
//
// Task #86 (authored fullscreen lenses): the lens now runs in
// either a fullscreen layout — `LensCanvas` filling the viewport
// with all non-canvas UI floating in a `WorkspaceLensFloatingOverlay`
// — or the prior inline layout. The choice is per-lens, persisted
// via the `acw-workspace-viewprefs-1.0` slice. The Escape key
// toggles fullscreen in either direction (subject to the editable-
// target + defaultPrevented suppression discipline below); the
// floating overlay also exposes an explicit "Exit full-screen"
// control, and the inline header exposes an "Enter full-page
// canvas" button. The pre-Task-#86 inline layout is preserved as
// the `isFullscreen === false` branch.
//
// Empty / instructional vocabulary is asserted against
// ACW_PLACEHOLDER_FORBIDDEN at module load.
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Maximize2 } from "lucide-react";
import { WorkspaceShell } from "../WorkspaceShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LensCanvas } from "@/components/acw/LensCanvas";
import { LiveStructurePanel } from "@/components/acw/LiveStructurePanel";
import { AuthoringPanel } from "@/components/acw/AuthoringPanel";
import { WorkspaceLensFloatingOverlay } from "@/components/acw/WorkspaceLensFloatingOverlay";
import { useAcwWorkspace } from "@/acw/acwGrammarHooks";
import { ACW_ELEMENT_TYPE_LABEL } from "@/acw/acwGrammar";
import { updateNodePosition } from "@/acw/acwStore";
import {
  getDoc as getViewPrefsDoc,
  getLensPrefs,
  setLensFullscreen,
  subscribePrefs,
} from "@/acw/acwWorkspaceViewPrefs";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";

const LENS_TITLE = "System Landscape";
const LENS_LAYER = "Application";
const LENS_HINT =
  "2D canvas. Pan with mouse drag, zoom with mouse wheel. Drag nodes to position; group selected compute nodes into a Zone; collapse containers to focus.";
const EMPTY_HINT = "Add systems to begin";
const ROOT_CRUMB = "Root";
const BACK_LABEL = "Step out";
const DEPTH_LABEL = "Depth";
const ENTER_FULLSCREEN_LABEL = "Enter full-page canvas";
const LENS_PATH = "/workspace/landscape";

assertAllAcwPlaceholderLanguage([
  LENS_TITLE,
  LENS_LAYER,
  LENS_HINT,
  EMPTY_HINT,
  ROOT_CRUMB,
  BACK_LABEL,
  DEPTH_LABEL,
  ENTER_FULLSCREEN_LABEL,
]);

// Lens filter for the Application layer: Systems and Components.
// Zones / ComputeNodes belong to the Technology lens (Deployment).
const APPLICATION_TYPES = new Set(["System", "Component"] as const);

// Auto-place any node that lacks user-set coordinates so a freshly
// added node is visible. Pure layout convenience; carries no
// priority or ordering meaning.
function autoPosition(index: number): { x: number; y: number } {
  const cols = 4;
  const col = index % cols;
  const row = Math.floor(index / cols);
  return { x: 80 + col * 144, y: 80 + row * 96 };
}

function useViewPrefsDoc(): unknown {
  return useSyncExternalStore(
    subscribePrefs,
    getViewPrefsDoc,
    getViewPrefsDoc,
  );
}

export default function SystemLandscape() {
  useViewPrefsDoc();
  const isFullscreen = getLensPrefs(LENS_PATH).isFullscreen;
  const [depthPath, setDepthPath] = useState<readonly string[]>([]);
  const workspace = useAcwWorkspace();

  const handleDrillDown = useCallback((nodeId: string) => {
    setDepthPath((prev) => [...prev, nodeId]);
  }, []);
  const handleStepOut = useCallback(() => {
    setDepthPath((prev) => prev.slice(0, -1));
  }, []);
  const handleEnterFullscreen = useCallback(
    () => setLensFullscreen(LENS_PATH, true),
    [],
  );
  const handleExitFullscreen = useCallback(
    () => setLensFullscreen(LENS_PATH, false),
    [],
  );

  // Escape-key shortcut: toggles fullscreen in either direction.
  // We suppress the toggle while focus is inside an editable
  // element (input / textarea / select / contentEditable) so
  // pressing Escape to dismiss a browser autofill or a dropdown
  // does not also flip the canvas mode. We also bail when the
  // event has already been preventDefault()'d by an upstream
  // dismiss handler (open dialog / popover / dropdown), mirroring
  // the Track 3 Escape discipline.
  useEffect(() => {
    function isEditableTarget(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (t.isContentEditable) return true;
      return false;
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key !== "Escape") return;
      if (isEditableTarget(ev.target)) return;
      if (ev.defaultPrevented) return;
      setLensFullscreen(LENS_PATH, !isFullscreen);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFullscreen]);

  // The Application lens surfaces System + Component across the
  // whole tree so the canvas can render containment cues for
  // Systems whose Components are visible inside them.
  const lensNodes = useMemo(
    () =>
      workspace.structureGraph.nodes.filter((n) =>
        APPLICATION_TYPES.has(n.type as "System" | "Component"),
      ),
    [workspace],
  );

  const focusedParentId =
    depthPath.length === 0 ? null : depthPath[depthPath.length - 1];

  // Auto-place any sibling at the focus level whose stored
  // coordinates are still (0, 0) — the v1 store seeds new nodes at
  // the origin. We write back via the validator-gated mutation so
  // the canonical coords live in the workspace document.
  useEffect(() => {
    const siblings = lensNodes.filter((n) => n.parentId === focusedParentId);
    let i = 0;
    for (const s of siblings) {
      if (s.x === 0 && s.y === 0) {
        const p = autoPosition(i);
        updateNodePosition(s.id, p.x, p.y);
      }
      i += 1;
    }
  }, [lensNodes, focusedParentId]);

  const visibleIds = useMemo(() => new Set(lensNodes.map((n) => n.id)), [lensNodes]);
  const lensEdges = useMemo(
    () =>
      workspace.structureGraph.edges.filter(
        (e) => visibleIds.has(e.fromId) && visibleIds.has(e.toId),
      ),
    [workspace, visibleIds],
  );

  // Crumb labels resolve depth ids to readable names.
  const crumbs = useMemo(() => {
    const acc: string[] = [ROOT_CRUMB];
    for (const id of depthPath) {
      const n = workspace.structureGraph.nodes.find((x) => x.id === id);
      acc.push(n ? `${ACW_ELEMENT_TYPE_LABEL[n.type]}: ${n.label}` : id);
    }
    return acc;
  }, [depthPath, workspace]);

  if (isFullscreen) {
    return (
      <WorkspaceShell hideShellChrome>
        {/*
         * Locked deviation mirroring the Track 3 fullscreen z-index
         * decision (see Track3Shell.tsx, "ACCEPTED DEVIATION FROM
         * TASK #81 SPEC"): the shell's sticky header + sub-nav are
         * `z-10`, so the fullscreen canvas layer sits at `z-0` to
         * keep the route chrome reachable above it. The canvas
         * still fully covers the body content via `fixed inset-0`.
         */}
        <div
          className="fixed inset-0 z-0 bg-background"
          data-testid="acw-landscape-fullscreen-canvas"
        >
          <LensCanvas
            key={`landscape-fullscreen:${LENS_PATH}`}
            lensId={LENS_PATH}
            nodes={lensNodes}
            edges={lensEdges}
            focusedParentId={focusedParentId}
            emptyHint={EMPTY_HINT}
            height="100%"
            testId="acw-landscape-canvas"
            onDrillDown={handleDrillDown}
            permitContainerType={(t) =>
              APPLICATION_TYPES.has(t as "System" | "Component")
            }
          />
          <WorkspaceLensFloatingOverlay
            testIdPrefix="acw-landscape-overlay"
            lensName={LENS_TITLE}
            lensLayer={LENS_LAYER}
            authoringSlot={<AuthoringPanel />}
            structureSlot={
              <LiveStructurePanel
                testIdPrefix="acw-landscape-structure"
                nodeFilter={(n) =>
                  APPLICATION_TYPES.has(n.type as "System" | "Component")
                }
                edgeFilter={(e) =>
                  e.kind === "CONNECTS" || e.kind === "INTERFACES_WITH"
                }
              />
            }
            bottomCenterSlot={
              <div
                className="inline-flex items-center gap-2"
                data-testid="acw-landscape-overlay-breadcrumb"
              >
                <span>{DEPTH_LABEL}:</span>
                <span
                  className="font-mono normal-case tracking-normal text-muted-foreground/80 truncate max-w-[40vw]"
                  data-testid="acw-landscape-overlay-breadcrumb-path"
                  title={crumbs.join(" / ")}
                >
                  {crumbs.join(" / ")}
                </span>
                {depthPath.length > 0 ? (
                  <button
                    type="button"
                    onClick={handleStepOut}
                    className="px-1.5 py-0.5 border border-border/60 rounded text-[10px] hover:text-primary hover:border-primary/60 transition-colors"
                    data-testid="acw-landscape-overlay-step-out"
                  >
                    {BACK_LABEL}
                  </button>
                ) : null}
              </div>
            }
            onExitFullscreen={handleExitFullscreen}
          />
        </div>
      </WorkspaceShell>
    );
  }

  return (
    <WorkspaceShell>
      <Card data-testid="acw-landscape-header">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-semibold uppercase tracking-wider">
                {LENS_TITLE}
              </CardTitle>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                {LENS_LAYER}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[10px]"
              onClick={handleEnterFullscreen}
              data-testid="acw-landscape-enter-fullscreen"
            >
              <Maximize2 className="w-3 h-3 mr-1" />
              {ENTER_FULLSCREEN_LABEL}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">{LENS_HINT}</CardContent>
      </Card>

      <div
        className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-muted-foreground"
        data-testid="acw-landscape-breadcrumb"
      >
        <span>{DEPTH_LABEL}:</span>
        <span data-testid="acw-landscape-breadcrumb-path">{crumbs.join(" / ")}</span>
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

      <LensCanvas
        key={`landscape-inline:${LENS_PATH}`}
        lensId={LENS_PATH}
        nodes={lensNodes}
        edges={lensEdges}
        focusedParentId={focusedParentId}
        emptyHint={EMPTY_HINT}
        height={460}
        testId="acw-landscape-canvas"
        onDrillDown={handleDrillDown}
        permitContainerType={(t) =>
          APPLICATION_TYPES.has(t as "System" | "Component")
        }
      />

      <LiveStructurePanel
        testIdPrefix="acw-landscape-structure"
        nodeFilter={(n) => APPLICATION_TYPES.has(n.type as "System" | "Component")}
        edgeFilter={(e) => e.kind === "CONNECTS" || e.kind === "INTERFACES_WITH"}
      />
    </WorkspaceShell>
  );
}
