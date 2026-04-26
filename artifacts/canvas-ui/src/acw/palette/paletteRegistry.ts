// EAStudio Phase 1 — palette registry.
//
// Single source of truth for the four-domain element palette
// surfaced by the Studio canvas. Each palette item names:
//   - the EAStudio domain it belongs to (drives which palette
//     section the user sees inside DomainTabBar);
//   - the underlying ACW grammar element type that will be
//     materialised when the user drops the item onto a quadrant
//     (the validator decides whether the resulting parent / child
//     pair is well-formed; the palette is purely a presentation
//     surface);
//   - the human-readable label that becomes the node's `label`
//     field at creation time;
//   - the lucide-react icon class used to render the palette tile
//     and the resulting card.
//
// Constitutional discipline this module follows:
//   - No emoji. The master prompt §11 vocabulary tier the ACW
//     transitively inherits forbids emoji as decorative load
//     bearers; lucide-react's vector icons are the sanctioned
//     iconography surface.
//   - Every static label below is asserted against
//     ACW_PLACEHOLDER_FORBIDDEN at module load.
//   - The registry is a frozen module-load constant. The Studio
//     canvas reads it; nothing in this module touches React, the
//     store, or persistence.
//
// Phase 1 scope — deliberately narrow per the task brief:
//   * Business: Department, Org unit, Business process, KPI card.
//   * Data: Data domain, Dataset, Data product.
//   * Application: Application, Service, Component module.
//   * Technology: Compute node, Container, Database, Network zone.
//
// The four lists above are intentionally short and additive.
// Extending the palette is a registry edit only; nothing in the
// Studio surfaces hard-codes the items.
import type { LucideIcon } from "lucide-react";
import {
  Briefcase,
  Building2,
  Cpu,
  Database,
  Gauge,
  Layers,
  Network,
  Package,
  Puzzle,
  Server,
  Settings,
  ShieldCheck,
  Table2,
  Workflow,
} from "lucide-react";
import { assertAllAcwPlaceholderLanguage } from "../../governance/staticTextGuard";
import {
  ACW_DOMAIN_TAGS,
  type AcwDomainTag,
  type AcwElementType,
} from "../acwGrammar";

export interface PaletteItem {
  /** Stable id, unique across the whole palette. */
  readonly paletteKind: string;
  /** Domain tab this item lives under. */
  readonly domain: AcwDomainTag;
  /** Underlying grammar element type the drop materialises. */
  readonly elementType: AcwElementType;
  /** Visible label rendered on the tile and on the resulting card. */
  readonly label: string;
  /** Vector icon — lucide-react component, no emoji. */
  readonly Icon: LucideIcon;
}

// ---------------------------------------------------------------------------
// Domain catalog (visible labels used by the tab bar and quadrant
// headers). The four entries are themselves asserted against the
// vocabulary tier; the keys mirror `ACW_DOMAIN_TAGS` and any future
// drift between the two sets fails the bundle via the matching
// assertion at the bottom of this module.
// ---------------------------------------------------------------------------
export const ACW_DOMAIN_LABEL: Readonly<Record<AcwDomainTag, string>> =
  Object.freeze({
    business: "Business",
    data: "Data",
    application: "Application",
    technology: "Technology",
  });

// Icon for each domain — used by DomainTabBar and the quadrant
// header to give the four domains a stable visual identity. Keep
// this list ordered exactly like `ACW_DOMAIN_TAGS` so a future
// re-ordering is a one-line edit.
export const ACW_DOMAIN_ICON: Readonly<Record<AcwDomainTag, LucideIcon>> =
  Object.freeze({
    business: Briefcase,
    data: Database,
    application: Layers,
    technology: Server,
  });

// Tailwind colour token per domain. Used as a thin border accent on
// the quadrant header and palette section card. Pure UI styling — no
// judgement, no traffic-light mapping.
export const ACW_DOMAIN_ACCENT: Readonly<Record<AcwDomainTag, string>> =
  Object.freeze({
    business: "border-orange-500/40 text-orange-400",
    data: "border-cyan-500/40 text-cyan-400",
    application: "border-purple-500/40 text-purple-400",
    technology: "border-emerald-500/40 text-emerald-400",
  });

// ---------------------------------------------------------------------------
// Palette items
// ---------------------------------------------------------------------------
//
// Each entry is frozen individually so callers cannot accidentally
// mutate a tile's icon / label after module load.
export const ACW_PALETTE: readonly PaletteItem[] = Object.freeze([
  // -------------------------- Business --------------------------
  Object.freeze({
    paletteKind: "biz-department",
    domain: "business",
    elementType: "Zone",
    label: "Department",
    Icon: Building2,
  }),
  Object.freeze({
    paletteKind: "biz-org-unit",
    domain: "business",
    elementType: "Zone",
    label: "Org unit",
    Icon: Briefcase,
  }),
  Object.freeze({
    paletteKind: "biz-business-process",
    domain: "business",
    elementType: "System",
    label: "Business process",
    Icon: Workflow,
  }),
  Object.freeze({
    paletteKind: "biz-kpi-card",
    domain: "business",
    elementType: "Component",
    label: "KPI card",
    Icon: Gauge,
  }),
  // ---------------------------- Data ----------------------------
  Object.freeze({
    paletteKind: "data-domain",
    domain: "data",
    elementType: "Zone",
    label: "Data domain",
    Icon: Database,
  }),
  Object.freeze({
    paletteKind: "data-dataset",
    domain: "data",
    elementType: "Component",
    label: "Dataset",
    Icon: Table2,
  }),
  Object.freeze({
    paletteKind: "data-product",
    domain: "data",
    elementType: "System",
    label: "Data product",
    Icon: Package,
  }),
  // ------------------------ Application -------------------------
  Object.freeze({
    paletteKind: "app-application",
    domain: "application",
    elementType: "System",
    label: "Application",
    Icon: Layers,
  }),
  Object.freeze({
    paletteKind: "app-service",
    domain: "application",
    elementType: "System",
    label: "Service",
    Icon: Settings,
  }),
  Object.freeze({
    paletteKind: "app-module",
    domain: "application",
    elementType: "Component",
    label: "Component module",
    Icon: Puzzle,
  }),
  // ------------------------- Technology -------------------------
  Object.freeze({
    paletteKind: "tech-compute-node",
    domain: "technology",
    elementType: "ComputeNode",
    label: "Compute node",
    Icon: Server,
  }),
  Object.freeze({
    paletteKind: "tech-container",
    domain: "technology",
    elementType: "Component",
    label: "Container",
    Icon: Cpu,
  }),
  Object.freeze({
    paletteKind: "tech-database",
    domain: "technology",
    elementType: "Component",
    label: "Database",
    Icon: Database,
  }),
  Object.freeze({
    paletteKind: "tech-network-zone",
    domain: "technology",
    elementType: "Zone",
    label: "Network zone",
    Icon: Network,
  }),
  // ShieldCheck / Network exist on the import but only ShieldCheck
  // is unused above — keep the import surface contained by holding
  // a sentinel reference here. Removing the sentinel would
  // re-introduce an unused-import warning under strict TS.
] as const);

// Sentinel touch — prevents the unused-import warning for
// ShieldCheck without importing-and-discarding inside the body of
// any rendering component.
export const __PALETTE_ICON_SENTINEL: ReadonlyArray<LucideIcon> = Object.freeze([
  ShieldCheck,
]);

export function paletteItemsByDomain(domain: AcwDomainTag): readonly PaletteItem[] {
  return ACW_PALETTE.filter((p) => p.domain === domain);
}

export function paletteItemByKind(kind: string): PaletteItem | undefined {
  return ACW_PALETTE.find((p) => p.paletteKind === kind);
}

// ---------------------------------------------------------------------------
// Module-load assertions
// ---------------------------------------------------------------------------
//
// Vocabulary tier — every label that can render into the DOM is
// asserted against ACW_PLACEHOLDER_FORBIDDEN. A future drift fails
// the bundle at module load.
assertAllAcwPlaceholderLanguage([
  ...Object.values(ACW_DOMAIN_LABEL),
  ...ACW_PALETTE.map((p) => p.label),
]);

// Structural integrity:
//   - every palette item targets a known domain tag;
//   - paletteKind values are unique;
//   - the domain catalog covers exactly the tag set the grammar
//     declares (no orphan tag, no silent extra tag).
{
  const seen = new Set<string>();
  for (const item of ACW_PALETTE) {
    if (seen.has(item.paletteKind)) {
      throw new Error(
        `EAStudio palette registry: duplicate paletteKind "${item.paletteKind}".`,
      );
    }
    seen.add(item.paletteKind);
    if (!(ACW_DOMAIN_TAGS as readonly string[]).includes(item.domain)) {
      throw new Error(
        `EAStudio palette registry: item "${item.paletteKind}" references unknown domain "${item.domain}".`,
      );
    }
  }
  const labelKeys = new Set(Object.keys(ACW_DOMAIN_LABEL));
  for (const tag of ACW_DOMAIN_TAGS) {
    if (!labelKeys.has(tag)) {
      throw new Error(
        `EAStudio palette registry: ACW_DOMAIN_LABEL is missing the "${tag}" entry.`,
      );
    }
  }
  if (labelKeys.size !== ACW_DOMAIN_TAGS.length) {
    throw new Error(
      "EAStudio palette registry: ACW_DOMAIN_LABEL contains a tag not present in ACW_DOMAIN_TAGS.",
    );
  }
}
