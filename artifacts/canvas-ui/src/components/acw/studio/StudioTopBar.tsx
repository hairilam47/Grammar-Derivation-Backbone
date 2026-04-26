// EAStudio Phase 3 — top-bar tab strip.
//
// Three-tab selector that drives the lens-keyed `viewTabByLens`
// slice in `acwViewState`. Switching tabs swaps the rendered
// sub-surface in the Studio shell; nothing here mutates the
// workspace document.
//
// Constitutional discipline:
//   - Lucide icons only.
//   - Every static label asserted against ACW_PLACEHOLDER_FORBIDDEN
//     at module load.
//   - State lives in the lens-keyed view-state singleton; this
//     component is a pure render of that slice.
import { useEffect, useState } from "react";
import { LayoutGrid, Grid3X3, Download } from "lucide-react";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";
import {
  ACW_STUDIO_VIEW_TABS,
  getViewTab,
  setViewTab,
  subscribeViewState,
  type AcwStudioViewTab,
} from "@/acw/acwViewState";

const DESIGN_LABEL = "Design";
const MATRIX_LABEL = "Matrix";
const EXPORT_LABEL = "Export";

assertAllAcwPlaceholderLanguage([
  DESIGN_LABEL,
  MATRIX_LABEL,
  EXPORT_LABEL,
]);

// Mapping from tab literal → display label + icon. Keeping the
// dictionary local to this component scopes the icon choice (and
// the lucide import) to the surface that renders it.
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

  return (
    <div
      data-testid="acw-studio-top-bar"
      data-active-tab={active}
      role="tablist"
      className="flex items-center gap-1 px-3 py-2 border-b border-border/30"
    >
      {ACW_STUDIO_VIEW_TABS.map((tab) => {
        const on = active === tab;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => setViewTab(lensId, tab)}
            data-testid={`acw-studio-top-bar-tab-${tab}`}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-[10px] uppercase tracking-widest transition-colors ${
              on
                ? "border-primary bg-primary/10 text-primary"
                : "border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            <TabIcon tab={tab} />
            <span>{TAB_LABELS[tab]}</span>
          </button>
        );
      })}
    </div>
  );
}
