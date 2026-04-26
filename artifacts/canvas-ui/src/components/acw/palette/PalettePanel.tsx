// EAStudio Phase 1 — palette panel (left rail).
//
// Renders the palette tiles for the currently active domain. Each
// tile is HTML5 draggable; the drag carries the `paletteKind`
// string so the receiving DomainGrid can resolve the underlying
// grammar element type via `paletteItemByKind`. The panel itself
// owns no workspace state — the active domain comes from
// `acwViewState`.
//
// Visual alignment with the prototype HTML (Task #99): every tile
// renders an icon chip + primary label + secondary `subLabel`
// rather than a single line of text.
//
// Constitutional discipline:
//   - Vector icons only (lucide-react). No emoji.
//   - Every static label asserted against ACW_PLACEHOLDER_FORBIDDEN
//     at module load.
//   - The panel never mutates the workspace; it only initiates
//     drags. The drop handler in DomainGrid is the single
//     validator-gated entry point.
import { Layers } from "lucide-react";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";
import {
  ACW_DOMAIN_LABEL,
  paletteItemsByDomain,
  type PaletteItem,
} from "@/acw/palette/paletteRegistry";
import type { AcwDomainTag } from "@/acw/acwGrammar";

const PANEL_TITLE = "Palette";

assertAllAcwPlaceholderLanguage([PANEL_TITLE]);

// HTML5 dataTransfer key — shared with DomainGrid's drop handler.
export const ACW_PALETTE_DATA_KEY = "application/x-eastudio-palette-kind";

export interface PalettePanelProps {
  readonly activeDomain: AcwDomainTag;
}

export function PalettePanel({ activeDomain }: PalettePanelProps) {
  const items = paletteItemsByDomain(activeDomain);

  return (
    <aside
      data-testid="acw-studio-palette"
      data-active-domain={activeDomain}
      className="es-palette"
    >
      <div className="es-palette-title">
        <Layers className="w-3.5 h-3.5" />
        <span>{PANEL_TITLE}</span>
        <span style={{ opacity: 0.6 }}>· {ACW_DOMAIN_LABEL[activeDomain]}</span>
      </div>
      <ul
        className="es-palette-list"
        data-testid="acw-studio-palette-list"
        style={{ listStyle: "none", margin: 0, padding: 0 }}
      >
        {items.map((item) => (
          <PaletteTile key={item.paletteKind} item={item} />
        ))}
      </ul>
    </aside>
  );
}

interface PaletteTileProps {
  readonly item: PaletteItem;
}

function PaletteTile({ item }: PaletteTileProps) {
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
        data-domain={item.domain}
        className="es-palette-item"
      >
        <span className="es-pal-icon" aria-hidden="true">
          <Icon className="w-3.5 h-3.5" />
        </span>
        <span className="es-pal-text">
          <span className="es-pal-label">{item.label}</span>
          <span className="es-pal-sub es-mono">{item.subLabel}</span>
        </span>
      </div>
    </li>
  );
}
