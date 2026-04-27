// EAStudio Phase 3 — top-bar.
//
// Three responsibilities, all surfaced in a single horizontal bar
// to mirror the prototype:
//   1. Brand identity — a small mark + the product name.
//   2. View-tab selector (Design / Matrix / Export) backed by the
//      lens-keyed `viewTabByLens` slice in `acwViewState`.
//   3. Action buttons — Sample (seeds a sample workspace), Clear
//      (wipes every user-authored node + edge while preserving
//      the four sealed domain containers), and Connect (toggles
//      the lens-keyed Connect mode).
//
// Constitutional discipline:
//   - Lucide icons only.
//   - Every static label asserted against ACW_PLACEHOLDER_FORBIDDEN
//     at module load.
//   - Sample / Clear delegate to `studioActions` which routes every
//     mutation through the validator-gated store API. Clear gates
//     itself behind `window.confirm` to match the prototype's
//     destructive-action convention.
//   - State lives in the lens-keyed view-state singleton; this
//     component is a pure render of that slice plus the user
//     intent triggers.
import { useEffect, useState } from "react";
import {
  Box,
  Download,
  Grid3X3,
  LayoutGrid,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";
import {
  ACW_STUDIO_VIEW_TABS,
  getActiveLod,
  getConnectMode,
  getViewTab,
  setActiveLod,
  setConnectMode,
  setConnectPendingSource,
  setSelectedEdgeId,
  setViewTab,
  subscribeViewState,
  type AcwStudioViewTab,
} from "@/acw/acwViewState";
import { ACW_LOD_LEVELS, type AcwLodLevel } from "@/acw/acwGrammar";
import { clearStudio, seedStudioSample } from "@/acw/studioActions";

// EAStudio Phase 2 (LoS framework) — the LoS toggle is only
// surfaced inside the Studio canvas. Other lenses keep the
// pre-Phase-2 top-bar exactly as it was.
const STUDIO_LENS_ID = "/workspace/studio";

const BRAND_LABEL = "EA Studio";
const BRAND_SUB = "Architecture Decision Canvas";
const DESIGN_LABEL = "Design";
const MATRIX_LABEL = "Matrix";
const EXPORT_LABEL = "Export";
const SAMPLE_LABEL = "Sample";
const CLEAR_LABEL = "Clear";
const CONNECT_LABEL = "Connect";
const CLEAR_CONFIRM =
  "Remove every node and connection? Sealed domain containers stay.";
// EAStudio Phase 2 (LoS framework) — neutral, descriptive labels for
// the L1 / L2 / L3 toggle. The first letter doubles as the visible
// glyph; the suffix names the level so the affordance reads as a
// view selector and not an icon-only puzzle. No emoji.
const LOD_LABELS: Readonly<Record<AcwLodLevel, string>> = Object.freeze({
  1: "L1 Business",
  2: "L2 Application",
  3: "L3 Technology",
});
// Stable group label for the LoS toggle so screen readers announce
// the affordance's role rather than the currently-selected option
// (which is already exposed via `aria-pressed` on the inner buttons).
const LOD_GROUP_LABEL = "Level of Specification";

assertAllAcwPlaceholderLanguage([
  BRAND_LABEL,
  BRAND_SUB,
  DESIGN_LABEL,
  MATRIX_LABEL,
  EXPORT_LABEL,
  SAMPLE_LABEL,
  CLEAR_LABEL,
  CONNECT_LABEL,
  CLEAR_CONFIRM,
  LOD_LABELS[1],
  LOD_LABELS[2],
  LOD_LABELS[3],
]);

const TAB_LABELS: Readonly<Record<AcwStudioViewTab, string>> = Object.freeze({
  design: DESIGN_LABEL,
  matrix: MATRIX_LABEL,
  export: EXPORT_LABEL,
});

function TabIcon({ tab }: { tab: AcwStudioViewTab }) {
  const cls = "w-3.5 h-3.5";
  if (tab === "design") return <LayoutGrid className={cls} />;
  if (tab === "matrix") return <Grid3X3 className={cls} />;
  return <Download className={cls} />;
}

export interface StudioTopBarProps {
  readonly lensId: string;
}

export function StudioTopBar({ lensId }: StudioTopBarProps) {
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeViewState(() => setTick((t) => t + 1)), []);
  void tick;

  const active = getViewTab(lensId);
  const connectOn = getConnectMode(lensId);
  // EAStudio Phase 2 (LoS framework) — only the Studio canvas owns
  // the L1 / L2 / L3 toggle. Other lenses fall through with the
  // toggle hidden so their existing top-bar layout is unchanged.
  const showLodToggle = lensId === STUDIO_LENS_ID;
  const activeLod = getActiveLod(lensId);

  const onClear = () => {
    if (typeof window !== "undefined" && !window.confirm(CLEAR_CONFIRM)) return;
    clearStudio();
  };
  const onConnectToggle = () => {
    const next = !connectOn;
    setConnectMode(lensId, next);
    if (!next) {
      setConnectPendingSource(lensId, null);
    }
    setSelectedEdgeId(lensId, null);
  };

  return (
    <header
      data-testid="acw-studio-top-bar"
      data-active-tab={active}
      className="es-topbar"
    >
      <div className="es-brand">
        <span className="es-brand-mark" aria-hidden="true">
          <Box className="w-3.5 h-3.5" />
        </span>
        <span>{BRAND_LABEL}</span>
        <span className="es-brand-sub">{BRAND_SUB}</span>
      </div>

      <div className="es-vtabs" role="tablist">
        {ACW_STUDIO_VIEW_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={active === tab}
            onClick={() => setViewTab(lensId, tab)}
            data-testid={`acw-studio-top-bar-tab-${tab}`}
            className="es-vtab"
          >
            <TabIcon tab={tab} />
            <span>{TAB_LABELS[tab]}</span>
          </button>
        ))}
      </div>

      <div className="es-actions">
        {showLodToggle ? (
          <div
            role="group"
            aria-label={LOD_GROUP_LABEL}
            data-testid="acw-studio-lod-toggle"
            data-active-lod={String(activeLod)}
            className="es-vtabs"
          >
            {ACW_LOD_LEVELS.map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setActiveLod(lensId, lvl)}
                aria-pressed={activeLod === lvl}
                data-active={activeLod === lvl ? "true" : "false"}
                data-testid={`acw-studio-lod-button-${lvl}`}
                className="es-vtab"
                title={LOD_LABELS[lvl]}
              >
                <span>{LOD_LABELS[lvl]}</span>
              </button>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => seedStudioSample()}
          data-testid="acw-studio-action-sample"
          className="es-btn"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>{SAMPLE_LABEL}</span>
        </button>
        <button
          type="button"
          onClick={onClear}
          data-testid="acw-studio-action-clear"
          data-tone="danger"
          className="es-btn"
        >
          <X className="w-3.5 h-3.5" />
          <span>{CLEAR_LABEL}</span>
        </button>
        <button
          type="button"
          onClick={onConnectToggle}
          data-testid="acw-studio-connect-toggle-button"
          aria-pressed={connectOn}
          data-active={connectOn ? "true" : "false"}
          className="es-btn"
        >
          <Zap className="w-3.5 h-3.5" />
          <span>{CONNECT_LABEL}</span>
        </button>
        <button
          type="button"
          onClick={() => setViewTab(lensId, "export")}
          data-testid="acw-studio-action-export"
          aria-pressed={active === "export"}
          data-active={active === "export" ? "true" : "false"}
          className="es-btn"
        >
          <Download className="w-3.5 h-3.5" />
          <span>{EXPORT_LABEL}</span>
        </button>
      </div>
    </header>
  );
}
