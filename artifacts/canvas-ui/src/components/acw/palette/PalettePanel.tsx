// EAStudio Phase 1 — palette panel (left rail).
//
// Renders the palette items for the currently active domain. Each
// tile is HTML5 draggable; the drag carries the `paletteKind`
// string so the receiving DomainGrid can resolve the underlying
// grammar element type via `paletteItemByKind`. The panel itself
// owns no state — the active domain comes from `acwViewState`.
//
// Constitutional discipline:
//   - Vector icons only (lucide-react). No emoji.
//   - Every static label asserted against ACW_PLACEHOLDER_FORBIDDEN
//     at module load.
//   - The panel never mutates the workspace; it only initiates
//     drags. The drop handler in DomainGrid is the single
//     validator-gated entry point.
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

assertAllAcwPlaceholderLanguage([PANEL_TITLE, PANEL_HINT]);

// HTML5 dataTransfer key — shared with DomainGrid's drop handler.
export const ACW_PALETTE_DATA_KEY = "application/x-eastudio-palette-kind";

export interface PalettePanelProps {
  readonly activeDomain: AcwDomainTag;
}

export function PalettePanel({ activeDomain }: PalettePanelProps) {
  const items = paletteItemsByDomain(activeDomain);
  const accent = ACW_DOMAIN_ACCENT[activeDomain];
  const DomainIcon = ACW_DOMAIN_ICON[activeDomain];

  return (
    <aside
      data-testid="acw-studio-palette"
      className="w-56 shrink-0 border-r border-border/40 bg-card/40 backdrop-blur p-3 space-y-3 overflow-y-auto"
    >
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          <DomainIcon className={`w-4 h-4 ${accent.split(" ")[1] ?? ""}`} />
          <span>{PANEL_TITLE}</span>
          <span className="text-[10px] opacity-60">
            · {ACW_DOMAIN_LABEL[activeDomain]}
          </span>
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
