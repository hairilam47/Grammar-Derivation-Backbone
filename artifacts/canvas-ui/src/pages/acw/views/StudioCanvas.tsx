// EAStudio Phase 1 — Studio canvas lens.
//
// Sixth ACW lens (additive — the original five lenses remain
// untouched). Composes the four EAStudio surfaces:
//
//   ┌────────────────────────────────────────────────────┐
//   │ DomainTabBar (Business / Data / App / Tech)        │
//   ├──────────┬─────────────────────────────────────────┤
//   │ Palette  │ DomainGrid (2x2 quadrants)              │
//   │ panel    │                                         │
//   └──────────┴─────────────────────────────────────────┘
//
// On mount the page calls `ensureDomainContainers()` so the four
// immutable domain containers (`domain-business`, `domain-data`,
// `domain-application`, `domain-technology`) are seeded into the
// workspace if they do not already exist. Re-seeding is a no-op
// because the seed routine uses stable ids that the store
// short-circuits on collision.
//
// Constitutional discipline:
//   - The lens is a thin composition layer. It mutates nothing
//     directly — every structural change goes through the existing
//     validator-gated store API.
//   - The shell suppresses its inline AuthoringPanel via the
//     `hideShellChrome` prop because the Studio surface owns the
//     full viewport. Refusals still flow through `acwRefusalChannel`;
//     the StudioCanvas surfaces them in its own inline banner so
//     the shell chrome does not need to be reintroduced.
//   - Vector icons only (lucide-react). No emoji.
//   - Every static label asserted against ACW_PLACEHOLDER_FORBIDDEN
//     at module load.
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";
import { WorkspaceShell } from "@/pages/acw/WorkspaceShell";
import { DomainTabBar } from "@/components/acw/palette/DomainTabBar";
import { PalettePanel } from "@/components/acw/palette/PalettePanel";
import { DomainGrid } from "@/components/acw/palette/DomainGrid";
import { ConnectToggle } from "@/components/acw/studio/ConnectToggle";
import { NodePropertiesPanel } from "@/components/acw/studio/NodePropertiesPanel";
import { StatusBar } from "@/components/acw/studio/StatusBar";
import { StudioTopBar } from "@/components/acw/studio/StudioTopBar";
import { MatrixView } from "@/components/acw/studio/MatrixView";
import { ExportView } from "@/components/acw/studio/ExportView";
import { ensureDomainContainers } from "@/acw/palette/domainContainerSeed";
import {
  getCurrentDomain,
  getViewTab,
  setConnectMode,
  setConnectPendingSource,
  setSelectedEdgeId,
  subscribeViewState,
} from "@/acw/acwViewState";
import { subscribeRefusals } from "@/acw/acwRefusalChannel";

const PAGE_TITLE = "EAStudio canvas";
const PAGE_HINT =
  "Four-domain workspace. Pick a domain, drag a palette tile into a quadrant.";
const REFUSAL_PREFIX = "Refused:";
const DISMISS_LABEL = "Dismiss";

assertAllAcwPlaceholderLanguage([
  PAGE_TITLE,
  PAGE_HINT,
  REFUSAL_PREFIX,
  DISMISS_LABEL,
]);

export default function StudioCanvas() {
  const [location] = useLocation();
  const lensId = location;

  // Inline refusal banner — same channel AuthoringPanel uses, but
  // surfaced inside the Studio surface because the shell chrome is
  // hidden in this lens.
  //
  // Subscribe BEFORE the seed effect runs so any refusal that
  // `ensureDomainContainers()` may publish on first mount (e.g. a
  // corrupted persisted document) is captured by this banner. React
  // executes `useEffect` callbacks in source order; reversing the
  // declaration order would let a seed-time refusal arrive before
  // the subscriber attaches and silently drop it.
  const [refusal, setRefusal] = useState<string | null>(null);
  useEffect(() => subscribeRefusals((m) => setRefusal(m)), []);

  // Seed the four domain containers once on mount. Idempotent: if
  // they already exist the seed routine no-ops via the store's
  // stable-id collision shortcut.
  useEffect(() => {
    ensureDomainContainers();
  }, []);

  // Tick on view-state changes so the panel re-reads the active
  // domain after the user clicks a tab.
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeViewState(() => setTick((t) => t + 1)), []);
  void tick;
  const activeDomain = getCurrentDomain(lensId);
  const activeTab = getViewTab(lensId);

  // EAStudio Phase 2 — Escape cancels Connect mode (clearing any
  // pending source) and dismisses any standing edge selection. The
  // listener is suppressed when focus is in an editable field so
  // typing Esc inside the Properties panel inputs does not blow
  // away the user's pending selection. The page lensId scopes every
  // mutation, mirroring the per-page slices used by ConnectToggle
  // and DomainGrid.
  useEffect(() => {
    function onKeyDown(ev: KeyboardEvent): void {
      if (ev.key !== "Escape") return;
      const t = ev.target;
      if (t instanceof HTMLElement) {
        const tag = t.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          t.isContentEditable
        ) {
          return;
        }
      }
      setConnectPendingSource(lensId, null);
      setConnectMode(lensId, false);
      setSelectedEdgeId(lensId, null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lensId]);

  return (
    <WorkspaceShell hideShellChrome>
      <div
        data-testid="acw-studio-canvas"
        data-lens-id={lensId}
        className="flex flex-col border border-border/40 rounded bg-card/30"
      >
        <header className="flex items-start justify-between gap-3 px-3 py-2 border-b border-border/30">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              {PAGE_TITLE}
            </h2>
            <p className="text-[10px] text-muted-foreground">{PAGE_HINT}</p>
          </div>
          <ConnectToggle lensId={lensId} />
        </header>

        <StudioTopBar lensId={lensId} />

        {activeTab === "design" ? <DomainTabBar lensId={lensId} /> : null}

        {refusal !== null ? (
          <div
            data-testid="acw-studio-refusal-banner"
            className="mx-3 mt-2 px-3 py-2 border border-destructive/50 bg-destructive/10 rounded text-xs flex items-start justify-between gap-3"
          >
            <span>
              <span className="font-semibold uppercase tracking-widest text-[10px] mr-2">
                {REFUSAL_PREFIX}
              </span>
              <span data-testid="acw-studio-refusal-banner-message">{refusal}</span>
            </span>
            <button
              type="button"
              onClick={() => setRefusal(null)}
              className="text-[10px] uppercase tracking-widest underline"
              data-testid="acw-studio-refusal-banner-dismiss"
            >
              {DISMISS_LABEL}
            </button>
          </div>
        ) : null}

        {activeTab === "design" ? (
          <div className="flex flex-1 min-h-[480px]">
            <PalettePanel activeDomain={activeDomain} />
            <DomainGrid lensId={lensId} />
            <NodePropertiesPanel lensId={lensId} />
          </div>
        ) : null}
        {activeTab === "matrix" ? <MatrixView lensId={lensId} /> : null}
        {activeTab === "export" ? <ExportView lensId={lensId} /> : null}

        <StatusBar lensId={lensId} />
      </div>
    </WorkspaceShell>
  );
}
