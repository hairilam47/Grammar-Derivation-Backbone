// ACW Workspace Builder — floating overlay for the authored
// fullscreen lenses (Task #86, sibling of Task #81's Track 3
// overlay).
//
// Wraps the non-canvas UI of an authored lens (lens identity +
// exit-fullscreen affordance, an authoring drawer, a structure
// drawer, a depth-breadcrumb pill) and positions each cluster
// as an absolutely-positioned quadrant over the fullscreen
// `LensCanvas`. The overlay is purely presentational; it
// imports nothing from the lens primitives. Each lens wires
// its own slot content through props so the authored-vs-derived
// isolation contract continues to hold.
//
// Pointer-event discipline: every quadrant `<div>` carries
// `pointer-events-none`; interactive children opt in with
// `pointer-events-auto`. This mirrors the Track 3 overlay
// discipline so the underlying canvas keeps receiving drag /
// wheel / click events anywhere outside an interactive child.
//
// Architectural note: the visual scaffolding here looks similar
// to Track 3's `Track3FloatingOverlay`, but the two components
// are intentionally NOT abstracted into a shared primitive. The
// authored ACW and the derived Track 3 view live on opposite
// sides of an isolation contract; coupling their overlay
// scaffolding would create an indirect dependency we explicitly
// chose not to incur. Visual drift between the two surfaces is
// preferable to coupling.
import { useState } from "react";
import type { ReactNode } from "react";
import {
  Layers,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
  Settings,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";

const OVERLAY_LABELS = {
  exitFullscreen: "Exit full-screen",
  closeAuthoring: "Close authoring",
  openAuthoring: "Open authoring",
  closeStructure: "Close structure",
  openStructure: "Open structure",
  authoringHeading: "Authoring",
  structureHeading: "Structure",
  escHint: "Press Esc to exit full-screen",
} as const;

assertAllAcwPlaceholderLanguage(Object.values(OVERLAY_LABELS));

export interface WorkspaceLensFloatingOverlayProps {
  /**
   * The lens display name (e.g. "System Landscape"). Rendered in
   * the top-left identity pill.
   */
  readonly lensName: string;
  /**
   * Optional secondary line below the lens name (e.g. the TOGAF
   * layer label). Rendered subtle / muted.
   */
  readonly lensLayer?: string;
  /**
   * The authoring slot — typically the shared `<AuthoringPanel />`.
   * Rendered inside a collapsible right-side drawer. Pass `null`
   * to hide the authoring drawer entirely.
   */
  readonly authoringSlot: ReactNode;
  /**
   * The structure slot — typically the per-lens
   * `<LiveStructurePanel />`. Rendered inside a collapsible
   * bottom-right drawer. Pass `null` to hide the structure drawer
   * entirely.
   */
  readonly structureSlot: ReactNode;
  /**
   * The bottom-centre slot — typically the lens depth breadcrumb
   * or a status pill. Pass `null` to omit. The slot is rendered
   * inside an already-styled pill container, so callers should
   * pass plain inline content (text + optional small button),
   * not their own card wrapper.
   */
  readonly bottomCenterSlot: ReactNode;
  /**
   * Callback fired when the user clicks the exit-fullscreen
   * button.
   */
  readonly onExitFullscreen: () => void;
  /**
   * Optional `data-testid` prefix so each lens that mounts the
   * overlay can scope its query selectors (e.g.
   * "acw-landscape-overlay" vs "acw-deployment-overlay"). The
   * component appends quadrant-specific suffixes to this prefix.
   * Defaults to "acw-lens-overlay".
   */
  readonly testIdPrefix?: string;
}

export function WorkspaceLensFloatingOverlay(
  props: WorkspaceLensFloatingOverlayProps,
) {
  const {
    lensName,
    lensLayer,
    authoringSlot,
    structureSlot,
    bottomCenterSlot,
    onExitFullscreen,
    testIdPrefix = "acw-lens-overlay",
  } = props;

  const [authoringOpen, setAuthoringOpen] = useState(false);
  const [structureOpen, setStructureOpen] = useState(false);

  return (
    <>
      {/* Top-left quadrant: lens identity + exit-fullscreen.
          The `top-28` (112px) clearance is sized to clear BOTH
          ACW sticky bars: the global header (`h-14` = 56px) and
          the lens sub-nav stuck immediately below it (~40px).
          Track 3 only has the global header and uses `top-16`
          in its own overlay; the two offsets are kept independent
          on purpose. */}
      <div
        className="pointer-events-none absolute top-28 left-3 flex flex-col gap-2 max-w-[60vw]"
        data-testid={`${testIdPrefix}-topleft`}
      >
        <div className="pointer-events-none inline-flex items-center gap-2 rounded-md border border-border/50 bg-card/80 backdrop-blur px-3 py-1.5 text-xs">
          <Layers className="w-3.5 h-3.5 text-primary" />
          <span
            className="font-mono truncate max-w-[40vw]"
            data-testid={`${testIdPrefix}-lens-name`}
            title={lensName}
          >
            {lensName}
          </span>
          {lensLayer ? (
            <span
              className="text-[9px] uppercase tracking-widest text-muted-foreground"
              data-testid={`${testIdPrefix}-lens-layer`}
            >
              {lensLayer}
            </span>
          ) : null}
        </div>
        <div className="pointer-events-auto inline-flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[10px]"
            onClick={onExitFullscreen}
            data-testid={`${testIdPrefix}-exit-fullscreen`}
            title={OVERLAY_LABELS.escHint}
          >
            <Minimize2 className="w-3 h-3 mr-1" />
            {OVERLAY_LABELS.exitFullscreen}
          </Button>
        </div>
      </div>

      {/* Right-edge: collapsible authoring drawer. The trigger
          button stays pinned to the right edge so the drawer is
          always reachable; the drawer body itself only renders
          when `authoringOpen` so the canvas keeps the maximum
          area in the common (closed) case. */}
      {authoringSlot !== null ? (
        <div
          className="pointer-events-none absolute top-28 right-3 flex items-start gap-2 max-w-[90vw]"
          data-testid={`${testIdPrefix}-right`}
        >
          {authoringOpen ? (
            <div
              className="pointer-events-auto rounded-md border border-border/50 bg-card/90 backdrop-blur p-3 max-h-[78vh] overflow-y-auto w-[min(420px,80vw)]"
              data-testid={`${testIdPrefix}-authoring-panel`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {OVERLAY_LABELS.authoringHeading}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setAuthoringOpen(false)}
                  data-testid={`${testIdPrefix}-authoring-close`}
                  title={OVERLAY_LABELS.closeAuthoring}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
              {authoringSlot}
            </div>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            className="pointer-events-auto h-8 w-8 p-0 shrink-0"
            onClick={() => setAuthoringOpen((v) => !v)}
            data-testid={`${testIdPrefix}-authoring-toggle`}
            title={
              authoringOpen
                ? OVERLAY_LABELS.closeAuthoring
                : OVERLAY_LABELS.openAuthoring
            }
            aria-pressed={authoringOpen}
          >
            {authoringOpen ? (
              <PanelRightClose className="w-4 h-4" />
            ) : (
              <PanelRightOpen className="w-4 h-4" />
            )}
          </Button>
        </div>
      ) : null}

      {/* Bottom-centre: lens depth breadcrumb / status pill. */}
      {bottomCenterSlot !== null ? (
        <div
          className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 max-w-[60vw]"
          data-testid={`${testIdPrefix}-bottomcenter`}
        >
          <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-border/50 bg-card/80 backdrop-blur px-3 py-1 text-[10px] uppercase tracking-widest text-muted-foreground">
            {bottomCenterSlot}
          </div>
        </div>
      ) : null}

      {/* Bottom-right: collapsible structure drawer. */}
      {structureSlot !== null ? (
        <div
          className="pointer-events-none absolute bottom-3 right-3 flex flex-col items-end gap-2 max-w-[90vw]"
          data-testid={`${testIdPrefix}-bottomright`}
        >
          {structureOpen ? (
            <div
              className="pointer-events-auto rounded-md border border-border/50 bg-card/90 backdrop-blur p-3 max-h-[60vh] overflow-y-auto w-[min(520px,85vw)]"
              data-testid={`${testIdPrefix}-structure-panel`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {OVERLAY_LABELS.structureHeading}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setStructureOpen(false)}
                  data-testid={`${testIdPrefix}-structure-close`}
                  title={OVERLAY_LABELS.closeStructure}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
              {structureSlot}
            </div>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            className="pointer-events-auto h-8 w-8 p-0"
            onClick={() => setStructureOpen((v) => !v)}
            data-testid={`${testIdPrefix}-structure-toggle`}
            title={
              structureOpen
                ? OVERLAY_LABELS.closeStructure
                : OVERLAY_LABELS.openStructure
            }
            aria-pressed={structureOpen}
          >
            {structureOpen ? (
              <X className="w-4 h-4" />
            ) : (
              <Settings className="w-4 h-4" />
            )}
          </Button>
        </div>
      ) : null}
    </>
  );
}
