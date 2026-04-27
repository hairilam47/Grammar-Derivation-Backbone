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
import { useEffect, useRef, useState } from "react";
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
import { Canvas3DStructural } from "@/components/acw/Canvas3DStructural";
import { ensureDomainContainers } from "@/acw/palette/domainContainerSeed";
import {
  getCurrentDomain,
  getSelectedNodeId,
  getViewTab,
  setConnectMode,
  setConnectPendingSource,
  setSelectedEdgeId,
  subscribeViewState,
  getActiveLod,
} from "@/acw/acwViewState";
import { subscribeRefusals } from "@/acw/acwRefusalChannel";
import { getWorkspace, subscribe as subscribeAcwStore } from "@/acw/acwStore";
import { runL3GeneratorForAllArchitectures } from "@/acw/l3/l3Generator";
import { setActiveLod } from "@/acw/acwViewState";

const REFUSAL_PREFIX = "Refused:";
const DISMISS_LABEL = "Dismiss";
// EAStudio Phase 2 (LoS framework) — empty hint shown when L3 has
// nothing to render (no architectures bound, or no CTAD options
// chosen). Vector glyph in the 3D surface only; this label is plain
// text so it threads through the placeholder-language guard.
const L3_EMPTY_HINT = "Bind an architecture to see L3 detail";

assertAllAcwPlaceholderLanguage([REFUSAL_PREFIX, DISMISS_LABEL, L3_EMPTY_HINT]);

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
  // EAStudio Phase 2 (LoS framework) — current Level of Specification
  // for this lens. The L3 surface mounts only when this is `3`; the
  // L1 / L2 surfaces are still served by the existing 2D grid (the
  // `lodRange` filter inside `enumerateLensVisibility` decides which
  // nodes are visible at each level).
  const activeLod = getActiveLod(lensId);

  // EAStudio Phase 2 — re-render the L3 3D surface whenever the
  // workspace changes (e.g. the generator just minted nodes).
  // Pre-Phase-2 surfaces did not need this because they composed
  // smaller, store-aware children; the L3 surface here pulls
  // `getWorkspace()` directly to feed Canvas3DStructural.
  const [storeTick, setStoreTick] = useState(0);
  useEffect(() => subscribeAcwStore(() => setStoreTick((t) => t + 1)), []);
  void storeTick;

  // EAStudio Phase 2 — Run the L3 generator once per "edge" entry
  // into L3 (transition from a non-3 LoS to LoS=3). The generator
  // is constitutionally idempotent, so re-running on every render
  // would be safe, but the ref-gated edge-trigger keeps the call
  // count predictable and matches the spec's "session-memoized"
  // wording. Resets to false whenever the user leaves L3 so a
  // subsequent re-entry triggers a fresh run.
  const ranForCurrentEntryRef = useRef<boolean>(false);
  useEffect(() => {
    if (activeLod !== 3) {
      ranForCurrentEntryRef.current = false;
      return;
    }
    if (ranForCurrentEntryRef.current) return;
    ranForCurrentEntryRef.current = true;
    runL3GeneratorForAllArchitectures();
  }, [activeLod]);

  // Escape cancels Connect mode (clearing any pending source) and
  // dismisses any standing edge selection. The listener is
  // suppressed when focus is in an editable field so typing Esc
  // inside the Properties panel inputs does not blow away the
  // user's pending selection.
  //
  // EAStudio Phase 2 (LoS framework) — when the active LoS is 3,
  // Escape is repurposed to exit the L3 fullscreen surface back
  // to L2 (the existing 2D shell). This mirrors the Track 3 /
  // SystemLandscape Escape-to-exit-fullscreen pattern with the
  // same editable-target suppression. Only AFTER L3 has been
  // exited does Escape resume its connect / edge-selection
  // dismissal duties.
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
      if (getActiveLod(lensId) === 3) {
        setActiveLod(lensId, 2);
        return;
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

          {activeTab === "design" && activeLod !== 3 ? (
            <DomainTabBar lensId={lensId} />
          ) : null}

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

          {/*
            EAStudio Phase 2 (LoS framework) — at L1 / L2 the
            existing design / matrix / export tabs render normally.
            At L3 the body is replaced by the 3D surface (sibling
            to those tabs) so the StudioTopBar stays visible above
            it and the user can switch back to L1 / L2 by clicking
            the LoS toggle. We render the L3 surface as a normal
            in-flow block (`flex: 1`) rather than as a fixed
            overlay so the topbar / status-bar layout is preserved
            and no z-index gymnastics are needed.
           */}
          {activeLod !== 3 ? (
            <>
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
            </>
          ) : (
            <div
              className="es-body"
              data-testid="acw-studio-l3-surface"
              style={{ display: "block", padding: 0 }}
            >
              <Canvas3DStructural
                lensId={lensId}
                nodes={getWorkspace().structureGraph.nodes}
                edges={getWorkspace().structureGraph.edges}
                focusedParentId={null}
                emptyHint={L3_EMPTY_HINT}
                height="100%"
                testId="acw-studio-l3-canvas"
              />
            </div>
          )}

          <StatusBar lensId={lensId} />
        </div>
        <DecisionContractNav />
      </div>
    </WorkspaceShell>
  );
}
