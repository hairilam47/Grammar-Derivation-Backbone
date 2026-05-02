// EAStudio — palette registry.
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
//   - the secondary label rendered as a small subtitle under each
//     palette tile and node card (the "sub" line in the prototype);
//   - the lucide-react icon class used to render the palette tile
//     and the resulting card.
//
// EAStudio Phase 1–3 visual alignment (Task #99) — palette is now
// 32 tiles (8 per domain). Every Business tile materialises as a
// `Zone` element so the strict Business chain in the validator
// (BusinessEntity → Zone children only, with System/Component
// permitted only deeper) accepts every direct drop into the
// Business container without cascading the user into a refusal.
//
// Constitutional discipline this module follows:
//   - No emoji. The master prompt §11 vocabulary tier the ACW
//     transitively inherits forbids emoji as decorative load
//     bearers; lucide-react's vector icons are the sanctioned
//     iconography surface.
//   - Every static label below is asserted against
//     ACW_PLACEHOLDER_FORBIDDEN at module load. Sub-labels also
//     run through the guard so a future copy-edit cannot smuggle
//     a forbidden vocabulary token into the rendered surface.
//   - The registry is a frozen module-load constant. The Studio
//     canvas reads it; nothing in this module touches React, the
//     store, or persistence.
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Archive,
  ArrowRightLeft,
  Briefcase,
  ClipboardList,
  Cloud,
  Cog,
  Database,
  Gauge,
  GitBranch,
  Globe,
  Handshake,
  HardDrive,
  Heart,
  Key,
  KeyRound,
  Landmark,
  Layers,
  Library,
  Monitor,
  Network,
  Package,
  Plug,
  Puzzle,
  Radio,
  Repeat,
  Ruler,
  Server,
  Share2,
  Shield,
  ShieldCheck,
  Smartphone,
  Target,
  Users,
  Workflow,
  Wrench,
  Zap,
} from "lucide-react";
import { assertAllAcwPlaceholderLanguage } from "../../governance/staticTextGuard";
import { lookupIconForCategory } from "../icons/iconRegistry";
import {
  ACW_DOMAIN_TAGS,
  type AcwDomainTag,
  type AcwElementType,
} from "../acwGrammar";

// EAStudio Path B Phase 1 (Task #113) — per-tile default semantic
// binding shape. Mirrors the optional fields already accepted by
// `createNode` and `AcwNode` since ACW Phase 5; declared locally here
// rather than imported from `acwStore` so the palette registry stays
// a leaf module that nothing in the store imports back into.
export interface PaletteBoundParamDefault {
  readonly sectionId: string;
  readonly paramId: string;
  readonly optionValue: string | null;
}

export interface PaletteItem {
  /** Stable id, unique across the whole palette. */
  readonly paletteKind: string;
  /** Domain tab this item lives under. */
  readonly domain: AcwDomainTag;
  /** Underlying grammar element type the drop materialises. */
  readonly elementType: AcwElementType;
  /** Visible label rendered on the tile and on the resulting card. */
  readonly label: string;
  /** Small secondary label rendered beneath the primary label. */
  readonly subLabel: string;
  /** Vector icon — lucide-react component, no emoji. */
  readonly Icon: LucideIcon;
  /**
   * EAStudio Path B Phase 1 (Task #113) — default categorical icon
   * binding the drop handler forwards onto the new node. When set,
   * MUST be a category string the icon registry knows about; the
   * module-load assertion at the bottom of this file fails the
   * bundle if a tile names a category that does not resolve through
   * `lookupIconForCategory`. The field is intentionally categorical
   * (e.g. `"API gateway"`, `"Backend service"`) and never branded.
   * When omitted, dropped nodes carry no default category and the
   * renderer falls through to the palette tile's own `Icon`.
   */
  readonly boundTechnologyCategory?: string;
  /**
   * EAStudio Path B Phase 1 (Task #113) — default CTAD parameter
   * binding the drop handler forwards onto the new node. Reserved
   * for a follow-up phase (Path B Phase 2) — no Phase 1 tile sets
   * this. When introduced, the binding's `(sectionId, paramId)`
   * pair MUST resolve through the CTAD registry exactly as the
   * runtime resolver `findSectionForParam` requires; the sibling
   * `paletteRegistryInvariants.test-shape.ts` asserts the pair
   * resolves so a typo fails the bundle rather than silently
   * degrading to the node's own label at render time.
   */
  readonly boundParam?: PaletteBoundParamDefault;
}

// ---------------------------------------------------------------------------
// Domain catalog (visible labels used by the tab bar and quadrant
// headers). Entries are themselves asserted against the vocabulary
// tier; the keys mirror `ACW_DOMAIN_TAGS` and any future drift
// between the two sets fails the bundle via the matching assertion
// at the bottom of this module.
// ---------------------------------------------------------------------------
export const ACW_DOMAIN_LABEL: Readonly<Record<AcwDomainTag, string>> =
  Object.freeze({
    business: "Business",
    data: "Data",
    application: "Application",
    technology: "Technology",
    // EAStudio Phase 4 (Task #170) — additive entries for the two
    // lens-only tags. They surface in the lens filters at
    // `/workspace/*` but do NOT seed Studio canvas quadrants.
    operations: "Operations",
    external: "External",
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
    operations: Heart,
    external: Share2,
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
    operations: "border-rose-500/40 text-rose-400",
    external: "border-slate-500/40 text-slate-400",
  });

// Short domain key used in the prototype CSS variables
// (`--biz`, `--data`, `--app`, `--tech`). Used by render code to
// read the right CSS custom property without re-implementing the
// tag-to-shorthand mapping at every call site.
export const ACW_DOMAIN_SHORTHAND: Readonly<Record<AcwDomainTag, string>> =
  Object.freeze({
    business: "biz",
    data: "data",
    application: "app",
    technology: "tech",
    operations: "ops",
    external: "ext",
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
    paletteKind: "biz-strategy-map",
    domain: "business",
    elementType: "Zone",
    label: "Strategy Map",
    subLabel: "Vision & goals",
    Icon: Target,
  }),
  Object.freeze({
    paletteKind: "biz-business-process",
    domain: "business",
    elementType: "Zone",
    label: "Business Process",
    subLabel: "Process model",
    Icon: Workflow,
  }),
  Object.freeze({
    paletteKind: "biz-governance-model",
    domain: "business",
    elementType: "Zone",
    label: "Governance Model",
    subLabel: "Policy & control",
    Icon: Landmark,
  }),
  Object.freeze({
    paletteKind: "biz-capability-map",
    domain: "business",
    elementType: "Zone",
    label: "Capability Map",
    subLabel: "Business capabilities",
    Icon: ClipboardList,
  }),
  Object.freeze({
    paletteKind: "biz-value-stream",
    domain: "business",
    elementType: "Zone",
    label: "Value Stream",
    subLabel: "End-to-end value",
    Icon: Handshake,
  }),
  Object.freeze({
    paletteKind: "biz-org-unit",
    domain: "business",
    elementType: "Zone",
    label: "Org Unit",
    subLabel: "Business unit",
    Icon: Users,
  }),
  Object.freeze({
    paletteKind: "biz-kpi-dashboard",
    domain: "business",
    elementType: "Zone",
    label: "KPI Dashboard",
    subLabel: "Metrics & OKRs",
    Icon: Gauge,
  }),
  Object.freeze({
    paletteKind: "biz-compliance",
    domain: "business",
    elementType: "Zone",
    label: "Compliance",
    subLabel: "Regulatory control",
    Icon: ShieldCheck,
  }),

  // ---------------------------- Data ----------------------------
  Object.freeze({
    paletteKind: "data-store",
    domain: "data",
    elementType: "Zone",
    label: "Data Store",
    subLabel: "Logical entity",
    Icon: Database,
    // Path B Phase 1 default binding — `Relational database` is the
    // most common categorical home for an authored data store; the
    // resolver still permits the user to rebind via the properties
    // panel after the drop.
    boundTechnologyCategory: "Relational database",
  }),
  Object.freeze({
    paletteKind: "data-stream",
    domain: "data",
    elementType: "System",
    label: "Data Stream",
    subLabel: "Integration pipe",
    Icon: ArrowRightLeft,
  }),
  Object.freeze({
    paletteKind: "data-model",
    domain: "data",
    elementType: "Component",
    label: "Data Model",
    subLabel: "Schema & structure",
    Icon: Ruler,
  }),
  Object.freeze({
    paletteKind: "data-product",
    domain: "data",
    elementType: "System",
    label: "Data Product",
    subLabel: "Consumable dataset",
    Icon: Package,
  }),
  Object.freeze({
    paletteKind: "data-master",
    domain: "data",
    elementType: "Component",
    label: "Master Data",
    subLabel: "Golden record",
    Icon: Key,
  }),
  Object.freeze({
    paletteKind: "data-catalog",
    domain: "data",
    elementType: "Component",
    label: "Data Catalog",
    subLabel: "Metadata registry",
    Icon: Library,
  }),
  Object.freeze({
    paletteKind: "data-policy",
    domain: "data",
    elementType: "Component",
    label: "Data Policy",
    subLabel: "Governance rules",
    Icon: Shield,
  }),
  Object.freeze({
    paletteKind: "data-etl",
    domain: "data",
    elementType: "System",
    label: "ETL Pipeline",
    subLabel: "Transform & load",
    Icon: GitBranch,
  }),

  // ------------------------ Application -------------------------
  Object.freeze({
    paletteKind: "app-application",
    domain: "application",
    elementType: "System",
    label: "Application",
    subLabel: "System component",
    Icon: Monitor,
  }),
  Object.freeze({
    paletteKind: "app-api-gateway",
    domain: "application",
    elementType: "System",
    label: "API Gateway",
    subLabel: "Integration point",
    Icon: Plug,
    boundTechnologyCategory: "API gateway",
  }),
  Object.freeze({
    paletteKind: "app-microservice",
    domain: "application",
    elementType: "System",
    label: "Microservice",
    subLabel: "Bounded context",
    Icon: Radio,
    boundTechnologyCategory: "Backend service",
  }),
  Object.freeze({
    paletteKind: "app-module",
    domain: "application",
    elementType: "Component",
    label: "Module",
    subLabel: "App subsystem",
    Icon: Puzzle,
  }),
  Object.freeze({
    paletteKind: "app-mobile",
    domain: "application",
    elementType: "System",
    label: "Mobile App",
    subLabel: "Client endpoint",
    Icon: Smartphone,
    boundTechnologyCategory: "Component-tree frontend",
  }),
  Object.freeze({
    paletteKind: "app-event-bus",
    domain: "application",
    elementType: "System",
    label: "Event Bus",
    subLabel: "Async messaging",
    Icon: Zap,
    boundTechnologyCategory: "Message broker",
  }),
  Object.freeze({
    paletteKind: "app-web-portal",
    domain: "application",
    elementType: "System",
    label: "Web Portal",
    subLabel: "User interface",
    Icon: Globe,
    boundTechnologyCategory: "Server-rendered frontend",
  }),
  Object.freeze({
    paletteKind: "app-integration",
    domain: "application",
    elementType: "Component",
    label: "Integration",
    subLabel: "System connector",
    Icon: Repeat,
  }),

  // ------------------------- Technology -------------------------
  Object.freeze({
    paletteKind: "tech-cloud-region",
    domain: "technology",
    elementType: "Zone",
    label: "Cloud Region",
    subLabel: "Compute zone",
    Icon: Cloud,
  }),
  Object.freeze({
    paletteKind: "tech-network",
    domain: "technology",
    elementType: "Zone",
    label: "Network Layer",
    subLabel: "Topology segment",
    Icon: Network,
  }),
  Object.freeze({
    paletteKind: "tech-database",
    domain: "technology",
    elementType: "Component",
    label: "Database",
    subLabel: "Persistent store",
    Icon: HardDrive,
    boundTechnologyCategory: "Relational database",
  }),
  Object.freeze({
    paletteKind: "tech-runtime",
    domain: "technology",
    elementType: "ComputeNode",
    label: "Runtime Engine",
    subLabel: "Execution env",
    Icon: Cog,
    boundTechnologyCategory: "Managed runtime",
  }),
  Object.freeze({
    paletteKind: "tech-iam",
    domain: "technology",
    elementType: "Component",
    label: "IAM Service",
    subLabel: "Auth & identity",
    Icon: KeyRound,
    boundTechnologyCategory: "Identity provider",
  }),
  Object.freeze({
    paletteKind: "tech-monitoring",
    domain: "technology",
    elementType: "Component",
    label: "Monitoring",
    subLabel: "Observability",
    Icon: Activity,
  }),
  Object.freeze({
    paletteKind: "tech-object-storage",
    domain: "technology",
    elementType: "Component",
    label: "Object Storage",
    subLabel: "Blob tier",
    Icon: Archive,
  }),
  Object.freeze({
    paletteKind: "tech-cicd",
    domain: "technology",
    elementType: "Component",
    label: "CI/CD Pipeline",
    subLabel: "DevOps toolchain",
    Icon: Wrench,
  }),
] as const);

export function paletteItemsByDomain(domain: AcwDomainTag): readonly PaletteItem[] {
  return ACW_PALETTE.filter((p) => p.domain === domain);
}

export function paletteItemByKind(kind: string): PaletteItem | undefined {
  return ACW_PALETTE.find((p) => p.paletteKind === kind);
}

// Resolve a palette item by its visible label. Used by the sample-
// seed routine so the canonical sample list (which mirrors the
// prototype's autoLayout) can target tiles by label without
// hard-coding palette kinds.
export function paletteItemByLabel(label: string): PaletteItem | undefined {
  return ACW_PALETTE.find((p) => p.label === label);
}

// ---------------------------------------------------------------------------
// Module-load assertions
// ---------------------------------------------------------------------------
//
// Vocabulary tier — every label and sub-label that can render into
// the DOM is asserted against ACW_PLACEHOLDER_FORBIDDEN. A future
// drift fails the bundle at module load.
assertAllAcwPlaceholderLanguage([
  ...Object.values(ACW_DOMAIN_LABEL),
  ...ACW_PALETTE.map((p) => p.label),
  ...ACW_PALETTE.map((p) => p.subLabel),
]);

// Structural integrity:
//   - every palette item targets a known domain tag;
//   - paletteKind values are unique;
//   - the domain catalog covers exactly the tag set the grammar
//     declares (no orphan tag, no silent extra tag);
//   - the shorthand map covers exactly the same tag set.
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
    if (!Object.prototype.hasOwnProperty.call(ACW_DOMAIN_SHORTHAND, tag)) {
      throw new Error(
        `EAStudio palette registry: ACW_DOMAIN_SHORTHAND is missing the "${tag}" entry.`,
      );
    }
  }
  if (labelKeys.size !== ACW_DOMAIN_TAGS.length) {
    throw new Error(
      "EAStudio palette registry: ACW_DOMAIN_LABEL contains a tag not present in ACW_DOMAIN_TAGS.",
    );
  }
}

// EAStudio Path B Phase 1 (Task #113) — semantic-binding resolvability:
//   - every tile that declares a `boundTechnologyCategory` MUST name
//     a category the icon registry knows about. A typo (e.g. a future
//     copy-edit that drifts `"API gateway"` to `"API-gateway"`) fails
//     the bundle at module load rather than silently degrading to a
//     blank icon at render time;
//   - every tile that declares a `boundParam` MUST carry both
//     `sectionId` and `paramId` as non-empty strings, with
//     `optionValue` either `null` or a non-empty string. Phase 1
//     ships no `boundParam` defaults — the loop below is therefore a
//     no-op today, but the structural shape check is asserted now so
//     a future Path B Phase 2 edit that introduces tile-level CTAD
//     bindings cannot smuggle in a malformed shape.
//
// The deeper CTAD-registry lookup (the `(sectionId, paramId)` pair
// must resolve through `findRegistryParam`) is intentionally NOT run
// from this module — paletteRegistry is a leaf module that must not
// import from the CTAD registry; the runtime resolver in
// `acw/semantic/techNodeBinding.ts` already pair-validates and
// no-ops on drift, and the test-shape probe at
// `acwGrammarV2Invariants.test-shape.ts` will gain a Phase 2 entry
// once tile-level `boundParam` defaults land.
{
  for (const item of ACW_PALETTE) {
    if (item.boundTechnologyCategory !== undefined) {
      if (
        typeof item.boundTechnologyCategory !== "string" ||
        item.boundTechnologyCategory.length === 0
      ) {
        throw new Error(
          `EAStudio palette registry: item "${item.paletteKind}" declares a non-string / empty boundTechnologyCategory.`,
        );
      }
      if (lookupIconForCategory(item.boundTechnologyCategory) === undefined) {
        throw new Error(
          `EAStudio palette registry: item "${item.paletteKind}" declares boundTechnologyCategory "${item.boundTechnologyCategory}" which is not a known category in iconRegistry.ts.`,
        );
      }
    }
    if (item.boundParam !== undefined) {
      const bp = item.boundParam;
      if (typeof bp.sectionId !== "string" || bp.sectionId.length === 0) {
        throw new Error(
          `EAStudio palette registry: item "${item.paletteKind}" declares a boundParam with empty sectionId.`,
        );
      }
      if (typeof bp.paramId !== "string" || bp.paramId.length === 0) {
        throw new Error(
          `EAStudio palette registry: item "${item.paletteKind}" declares a boundParam with empty paramId.`,
        );
      }
      if (
        bp.optionValue !== null &&
        (typeof bp.optionValue !== "string" || bp.optionValue.length === 0)
      ) {
        throw new Error(
          `EAStudio palette registry: item "${item.paletteKind}" declares a boundParam.optionValue that is neither null nor a non-empty string.`,
        );
      }
    }
  }
}
