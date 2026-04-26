// EAStudio Phase 1 — Studio canvas lens (Task #99 visual alignment).
//
// Sixth ACW lens (additive — the original five lenses remain
// untouched). Layout matches the prototype HTML:
//
//   ┌─────────────────────────────────────────────────────────┐
//   │ TopBar (brand · view tabs · Sample / Clear / Connect)   │
//   ├─────────────────────────────────────────────────────────┤
//   │ DomainTabBar (Business / Data / App / Tech)             │
//   ├──────────┬───────────────────────────┬──────────────────┤
//   │ Palette  │ Canvas-wrap (4 zones,     │ Properties panel │
//   │  panel   │ flat node cards)          │ (selection only) │
//   ├──────────┴───────────────────────────┴──────────────────┤
//   │ StatusBar (counts · mode · framework badge)             │
//   └─────────────────────────────────────────────────────────┘
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
//   - All studio CSS is scoped under the `.eastudio-root` class so
//     Tailwind / shadcn primitives outside this lens are unaffected.
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";
import { WorkspaceShell } from "@/pages/acw/WorkspaceShell";
import { DomainTabBar } from "@/components/acw/palette/DomainTabBar";
import { PalettePanel } from "@/components/acw/palette/PalettePanel";
import { DomainGrid } from "@/components/acw/palette/DomainGrid";
import { NodePropertiesPanel } from "@/components/acw/studio/NodePropertiesPanel";
import { StatusBar } from "@/components/acw/studio/StatusBar";
import { StudioTopBar } from "@/components/acw/studio/StudioTopBar";
import { MatrixView } from "@/components/acw/studio/MatrixView";
import { ExportView } from "@/components/acw/studio/ExportView";
import { DecisionContractNav } from "@/components/acw/studio/DecisionContractNav";
import { ensureDomainContainers } from "@/acw/palette/domainContainerSeed";
import {
  getCurrentDomain,
  getSelectedNodeId,
  getViewTab,
  setConnectMode,
  setConnectPendingSource,
  setSelectedEdgeId,
  subscribeViewState,
} from "@/acw/acwViewState";
import { subscribeRefusals } from "@/acw/acwRefusalChannel";

const REFUSAL_PREFIX = "Refused:";
const DISMISS_LABEL = "Dismiss";

assertAllAcwPlaceholderLanguage([REFUSAL_PREFIX, DISMISS_LABEL]);

export default function StudioCanvas() {
  const [location] = useLocation();
  const lensId = location;

  // Inline refusal banner — same channel AuthoringPanel uses, but
  // surfaced inside the Studio surface because the shell chrome is
  // hidden in this lens.
  //
  // Subscribe BEFORE the seed effect runs so any refusal that
  // `ensureDomainContainers()` may publish on first mount (e.g. a
  // corrupted persisted document) is captured by this banner.
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
  const selectedNodeId = getSelectedNodeId(lensId);

  // Escape cancels Connect mode (clearing any pending source) and
  // dismisses any standing edge selection. The listener is
  // suppressed when focus is in an editable field so typing Esc
  // inside the Properties panel inputs does not blow away the
  // user's pending selection.
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
        className="eastudio-root"
        data-testid="acw-studio-canvas"
        data-lens-id={lensId}
      >
        <div className="es-shell">
          <StudioTopBar lensId={lensId} />

          {activeTab === "design" ? <DomainTabBar lensId={lensId} /> : null}

          {refusal !== null ? (
            <div
              data-testid="acw-studio-refusal-banner"
              className="es-refusal"
            >
              <span>
                <span className="es-refusal-prefix">{REFUSAL_PREFIX}</span>
                <span data-testid="acw-studio-refusal-banner-message">
                  {refusal}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setRefusal(null)}
                className="es-refusal-dismiss"
                data-testid="acw-studio-refusal-banner-dismiss"
              >
                {DISMISS_LABEL}
              </button>
            </div>
          ) : null}

          {activeTab === "design" ? (
            <div
              className="es-body"
              data-properties={selectedNodeId !== null ? "shown" : "hidden"}
            >
              <PalettePanel activeDomain={activeDomain} />
              <DomainGrid lensId={lensId} />
              <NodePropertiesPanel lensId={lensId} />
            </div>
          ) : null}
          {activeTab === "matrix" ? <MatrixView lensId={lensId} /> : null}
          {activeTab === "export" ? <ExportView lensId={lensId} /> : null}

          <StatusBar lensId={lensId} />
        </div>
        <DecisionContractNav />
      </div>
    </WorkspaceShell>
  );
}
