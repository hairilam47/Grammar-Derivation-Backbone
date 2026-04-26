// EAStudio Phase 1 — palette panel (left rail).
//
// Renders the palette items for the currently active domain. Each
// tile is HTML5 draggable; the drag carries the `paletteKind`
// string so the receiving DomainGrid can resolve the underlying
// grammar element type via `paletteItemByKind`. The panel itself
// owns no workspace state — the active domain comes from
// `acwViewState`. The panel does own a *local* collapsed-state
// boolean so the user can hide the palette and reclaim horizontal
// space for the four quadrants while still keeping the expand
// affordance one click away. Collapse is purely visual; it does
// not mutate the workspace or the view-state slice, so a re-mount
// re-opens the palette by default.
//
// Constitutional discipline:
//   - Vector icons only (lucide-react). No emoji.
//   - Every static label asserted against ACW_PLACEHOLDER_FORBIDDEN
//     at module load.
//   - The panel never mutates the workspace; it only initiates
//     drags. The drop handler in DomainGrid is the single
//     validator-gated entry point.
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";
import {
  ACW_DOMAIN_LABEL,
  ACW_DOMAIN_ACCENT,
  ACW_DOMAIN_ICON,
  paletteItemsByDomain,
  type PaletteItem,
} from "@/acw/palette/paletteRegistry";
import type { AcwDomainTag } from "@/acw/acwGrammar";

const PANEL_TITLE = "Palette";
const PANEL_HINT =
  "Drag a tile into a quadrant to add an element. The grammar validator gates every drop.";
const COLLAPSE_LABEL = "Hide palette";
const EXPAND_LABEL = "Show palette";

assertAllAcwPlaceholderLanguage([
  PANEL_TITLE,
  PANEL_HINT,
  COLLAPSE_LABEL,
  EXPAND_LABEL,
]);

// HTML5 dataTransfer key — shared with DomainGrid's drop handler.
export const ACW_PALETTE_DATA_KEY = "application/x-eastudio-palette-kind";

export interface PalettePanelProps {
  readonly activeDomain: AcwDomainTag;
}

export function PalettePanel({ activeDomain }: PalettePanelProps) {
  const items = paletteItemsByDomain(activeDomain);
  const accent = ACW_DOMAIN_ACCENT[activeDomain];
  const DomainIcon = ACW_DOMAIN_ICON[activeDomain];
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <aside
        data-testid="acw-studio-palette"
        data-collapsed="true"
        className="w-8 shrink-0 border-r border-border/40 bg-card/40 backdrop-blur flex flex-col items-center py-2"
      >
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label={EXPAND_LABEL}
          title={EXPAND_LABEL}
          data-testid="acw-studio-palette-expand"
          className="flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:text-foreground hover:bg-background/60 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <div className="mt-3 flex flex-col items-center gap-2 opacity-70">
          <DomainIcon className={`w-4 h-4 ${accent.split(" ")[1] ?? ""}`} />
        </div>
      </aside>
    );
  }

  return (
    <aside
      data-testid="acw-studio-palette"
      data-collapsed="false"
      className="w-56 shrink-0 border-r border-border/40 bg-card/40 backdrop-blur p-3 space-y-3 overflow-y-auto"
    >
      <header className="space-y-1">
        <div className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          <div className="flex items-center gap-2">
            <DomainIcon className={`w-4 h-4 ${accent.split(" ")[1] ?? ""}`} />
            <span>{PANEL_TITLE}</span>
            <span className="text-[10px] opacity-60">
              · {ACW_DOMAIN_LABEL[activeDomain]}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label={COLLAPSE_LABEL}
            title={COLLAPSE_LABEL}
            data-testid="acw-studio-palette-collapse"
            className="flex items-center justify-center w-5 h-5 rounded text-muted-foreground hover:text-foreground hover:bg-background/60 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground">{PANEL_HINT}</p>
      </header>

      <ul className="space-y-2" data-testid="acw-studio-palette-list">
        {items.map((item) => (
          <PaletteTile key={item.paletteKind} item={item} accent={accent} />
        ))}
      </ul>
    </aside>
  );
}

interface PaletteTileProps {
  readonly item: PaletteItem;
  readonly accent: string;
}

function PaletteTile({ item, accent }: PaletteTileProps) {
  const { Icon } = item;
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(ACW_PALETTE_DATA_KEY, item.paletteKind);
          e.dataTransfer.effectAllowed = "copy";
        }}
        data-testid={`acw-palette-tile-${item.paletteKind}`}
        data-palette-kind={item.paletteKind}
        className={`flex items-center gap-2 px-2 py-1.5 border rounded text-xs font-mono cursor-grab active:cursor-grabbing select-none bg-background/70 hover:bg-background ${accent}`}
      >
        <Icon className="w-3.5 h-3.5" />
        <span>{item.label}</span>
      </div>
    </li>
  );
}
