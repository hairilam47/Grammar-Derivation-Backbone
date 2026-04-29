// CTAD Phase 3 — Multi-Diagram Logical Design palette registry.
//
// Single source of truth for the five-diagram element palette
// surfaced by the `CtadDesignShell` logical authoring surface. Each
// palette item names:
//   - the unique `paletteKind` used by the drop handler to look the
//     tile back up after a HTML5 drag-and-drop dataTransfer round
//     trip;
//   - the diagram surface it belongs to (`diagramType`); selecting
//     a different diagram in the shell filters the palette to that
//     subset;
//   - the diagram-specific subtype (`diagramSubtype`); this is the
//     user-visible classification ("pool", "lane", "task", etc.)
//     and is what a downstream renderer (or a future graduation
//     pass) discriminates on;
//   - the ACW element type (`elementType`) that will be stamped
//     onto the AcwNode at creation time. CTAD logical nodes drop
//     at the workspace root (`parentId = null`), so this is
//     restricted to the three element types whose grammar permits
//     a `null` parent (`Zone`, `ComputeNode`, `System`); the
//     fourth user-creatable type (`Component`) is excluded because
//     `permittedParentsFor("Component")` is `["System", "Zone"]`
//     and a root-drop would be refused by the validator. The fifth
//     type (`BusinessEntity`) is sealed for the Business domain
//     container and is not creatable via any palette;
//   - the user-facing `label` and `subLabel`; both are run through
//     the CTAD vocabulary guard at module load so a future copy
//     edit cannot smuggle a forbidden token (approve / confirm /
//     recommend / best / optimal / final / score / ranked / mandate
//     / justify / enforce / must) into the rendered surface;
//   - the lucide-react `Icon` rendered in the tile.
//
// Constitutional discipline this module follows:
//   - No emoji. CTAD inherits the ACW vocabulary tier; lucide-react
//     vector glyphs are the sanctioned iconography.
//   - The registry is a frozen module-load constant. Nothing in
//     this module touches React, the store, or persistence.
//   - The palette knows nothing about EAStudio promotion. The
//     `Promote to EAStudio` panel inside the design shell decides
//     which quadrant a logical node may attach to and is gated by
//     the same grammar (BusinessEntity will not parent a System,
//     so a Business promotion is greyed for System-typed logical
//     nodes).

import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Circle,
  CircleDot,
  Cog,
  Columns3,
  Database,
  Diamond,
  Eye,
  FileCode,
  GitMerge,
  KeyRound,
  Layers,
  Link as LinkIcon,
  ListOrdered,
  Minus,
  Network,
  Square,
  SquareFunction,
  Table2,
  Type,
  User,
  Variable,
  Workflow,
} from "lucide-react";
import { assertAllCtadLanguage } from "../governance/staticTextGuard";
import {
  ACW_DIAGRAM_TYPES,
  type AcwDiagramType,
  isAcwDiagramType,
} from "../acw/acwStore";
import {
  permittedParentsFor,
  type AcwElementType,
} from "../acw/acwGrammar";

// CTAD palette items create logical nodes at the workspace root.
// Only element types whose grammar permits `parentId = null` are
// usable; this constant is asserted at module load.
const CTAD_PALETTE_ROOTABLE_ELEMENT_TYPES: ReadonlySet<AcwElementType> =
  new Set<AcwElementType>(["Zone", "ComputeNode", "System"]);

export interface CtadPaletteItem {
  readonly paletteKind: string;
  readonly diagramType: AcwDiagramType;
  readonly diagramSubtype: string;
  readonly elementType: AcwElementType;
  readonly label: string;
  readonly subLabel: string;
  readonly Icon: LucideIcon;
}

// dataTransfer key used by the design-shell drag-and-drop wiring.
// Distinct from the EAStudio palette key so a CTAD tile dragged
// onto the EAStudio canvas (or vice versa) is a no-op rather than
// a silent mis-route.
export const CTAD_PALETTE_DATA_KEY = "application/x-ctad-palette-kind";

export const CTAD_PALETTE: readonly CtadPaletteItem[] = Object.freeze([
  // ---------------------------------------------------------------
  // BPMN — Business Process Model and Notation.
  // ---------------------------------------------------------------
  Object.freeze<CtadPaletteItem>({
    paletteKind: "ctad-bpmn-pool",
    diagramType: "bpmn",
    diagramSubtype: "pool",
    elementType: "Zone",
    label: "Pool",
    subLabel: "Process container",
    Icon: Workflow,
  }),
  Object.freeze<CtadPaletteItem>({
    paletteKind: "ctad-bpmn-lane",
    diagramType: "bpmn",
    diagramSubtype: "lane",
    elementType: "Zone",
    label: "Lane",
    subLabel: "Role swimlane",
    Icon: Layers,
  }),
  Object.freeze<CtadPaletteItem>({
    paletteKind: "ctad-bpmn-task",
    diagramType: "bpmn",
    diagramSubtype: "task",
    elementType: "System",
    label: "Task",
    subLabel: "Generic activity",
    Icon: Square,
  }),
  Object.freeze<CtadPaletteItem>({
    paletteKind: "ctad-bpmn-service-task",
    diagramType: "bpmn",
    diagramSubtype: "service-task",
    elementType: "System",
    label: "Service Task",
    subLabel: "Automated activity",
    Icon: Cog,
  }),
  Object.freeze<CtadPaletteItem>({
    paletteKind: "ctad-bpmn-user-task",
    diagramType: "bpmn",
    diagramSubtype: "user-task",
    elementType: "System",
    label: "User Task",
    subLabel: "Human activity",
    Icon: User,
  }),
  Object.freeze<CtadPaletteItem>({
    paletteKind: "ctad-bpmn-start-event",
    diagramType: "bpmn",
    diagramSubtype: "start-event",
    elementType: "System",
    label: "Start Event",
    subLabel: "Process start",
    Icon: Circle,
  }),
  Object.freeze<CtadPaletteItem>({
    paletteKind: "ctad-bpmn-end-event",
    diagramType: "bpmn",
    diagramSubtype: "end-event",
    elementType: "System",
    label: "End Event",
    subLabel: "Process end",
    Icon: CircleDot,
  }),
  Object.freeze<CtadPaletteItem>({
    paletteKind: "ctad-bpmn-gateway",
    diagramType: "bpmn",
    diagramSubtype: "gateway",
    elementType: "System",
    label: "Gateway",
    subLabel: "Branch / merge",
    Icon: Diamond,
  }),
  // ---------------------------------------------------------------
  // ERD — Entity-Relationship Diagram.
  // ---------------------------------------------------------------
  Object.freeze<CtadPaletteItem>({
    paletteKind: "ctad-erd-entity",
    diagramType: "erd",
    diagramSubtype: "entity",
    elementType: "System",
    label: "Entity",
    subLabel: "Domain noun",
    Icon: Database,
  }),
  Object.freeze<CtadPaletteItem>({
    paletteKind: "ctad-erd-weak-entity",
    diagramType: "erd",
    diagramSubtype: "weak-entity",
    elementType: "System",
    label: "Weak Entity",
    subLabel: "Identifier-dependent",
    Icon: Database,
  }),
  Object.freeze<CtadPaletteItem>({
    paletteKind: "ctad-erd-attribute",
    diagramType: "erd",
    diagramSubtype: "attribute",
    elementType: "System",
    label: "Attribute",
    subLabel: "Entity field",
    Icon: Type,
  }),
  Object.freeze<CtadPaletteItem>({
    paletteKind: "ctad-erd-key-attribute",
    diagramType: "erd",
    diagramSubtype: "key-attribute",
    elementType: "System",
    label: "Key Attribute",
    subLabel: "Identifier field",
    Icon: KeyRound,
  }),
  Object.freeze<CtadPaletteItem>({
    paletteKind: "ctad-erd-relationship",
    diagramType: "erd",
    diagramSubtype: "relationship",
    elementType: "System",
    label: "Relationship",
    subLabel: "Entity association",
    Icon: GitMerge,
  }),
  // ---------------------------------------------------------------
  // DDL — Data Definition Language (physical schema).
  // ---------------------------------------------------------------
  Object.freeze<CtadPaletteItem>({
    paletteKind: "ctad-ddl-table",
    diagramType: "ddl",
    diagramSubtype: "table",
    elementType: "Zone",
    label: "Table",
    subLabel: "Physical relation",
    Icon: Table2,
  }),
  Object.freeze<CtadPaletteItem>({
    paletteKind: "ctad-ddl-column",
    diagramType: "ddl",
    diagramSubtype: "column",
    elementType: "System",
    label: "Column",
    subLabel: "Typed field",
    Icon: Columns3,
  }),
  Object.freeze<CtadPaletteItem>({
    paletteKind: "ctad-ddl-primary-key",
    diagramType: "ddl",
    diagramSubtype: "primary-key",
    elementType: "System",
    label: "Primary Key",
    subLabel: "Row identifier",
    Icon: KeyRound,
  }),
  Object.freeze<CtadPaletteItem>({
    paletteKind: "ctad-ddl-foreign-key",
    diagramType: "ddl",
    diagramSubtype: "foreign-key",
    elementType: "System",
    label: "Foreign Key",
    subLabel: "Cross-table reference",
    Icon: LinkIcon,
  }),
  Object.freeze<CtadPaletteItem>({
    paletteKind: "ctad-ddl-index",
    diagramType: "ddl",
    diagramSubtype: "index",
    elementType: "System",
    label: "Index",
    subLabel: "Lookup acceleration",
    Icon: ListOrdered,
  }),
  Object.freeze<CtadPaletteItem>({
    paletteKind: "ctad-ddl-view",
    diagramType: "ddl",
    diagramSubtype: "view",
    elementType: "System",
    label: "View",
    subLabel: "Derived projection",
    Icon: Eye,
  }),
  // ---------------------------------------------------------------
  // Sequence — UML Sequence Diagram.
  // ---------------------------------------------------------------
  Object.freeze<CtadPaletteItem>({
    paletteKind: "ctad-sequence-actor",
    diagramType: "sequence",
    diagramSubtype: "actor",
    elementType: "Zone",
    label: "Actor",
    subLabel: "External role",
    Icon: User,
  }),
  Object.freeze<CtadPaletteItem>({
    paletteKind: "ctad-sequence-lifeline",
    diagramType: "sequence",
    diagramSubtype: "lifeline",
    elementType: "System",
    label: "Lifeline",
    subLabel: "Participant timeline",
    Icon: Minus,
  }),
  Object.freeze<CtadPaletteItem>({
    paletteKind: "ctad-sequence-activation",
    diagramType: "sequence",
    diagramSubtype: "activation",
    elementType: "System",
    label: "Activation",
    subLabel: "Active execution",
    Icon: Square,
  }),
  Object.freeze<CtadPaletteItem>({
    paletteKind: "ctad-sequence-message",
    diagramType: "sequence",
    diagramSubtype: "message",
    elementType: "System",
    label: "Message",
    subLabel: "Inter-lifeline call",
    Icon: ArrowRight,
  }),
  Object.freeze<CtadPaletteItem>({
    paletteKind: "ctad-sequence-fragment",
    diagramType: "sequence",
    diagramSubtype: "fragment",
    elementType: "Zone",
    label: "Fragment",
    subLabel: "Combined fragment",
    Icon: Network,
  }),
  // ---------------------------------------------------------------
  // Class — UML Class Diagram.
  // ---------------------------------------------------------------
  Object.freeze<CtadPaletteItem>({
    paletteKind: "ctad-class-class",
    diagramType: "class",
    diagramSubtype: "class",
    elementType: "Zone",
    label: "Class",
    subLabel: "Type definition",
    Icon: FileCode,
  }),
  Object.freeze<CtadPaletteItem>({
    paletteKind: "ctad-class-interface",
    diagramType: "class",
    diagramSubtype: "interface",
    elementType: "Zone",
    label: "Interface",
    subLabel: "Contract",
    Icon: FileCode,
  }),
  Object.freeze<CtadPaletteItem>({
    paletteKind: "ctad-class-method",
    diagramType: "class",
    diagramSubtype: "method",
    elementType: "System",
    label: "Method",
    subLabel: "Operation",
    Icon: SquareFunction,
  }),
  Object.freeze<CtadPaletteItem>({
    paletteKind: "ctad-class-property",
    diagramType: "class",
    diagramSubtype: "property",
    elementType: "System",
    label: "Property",
    subLabel: "Field",
    Icon: Variable,
  }),
  Object.freeze<CtadPaletteItem>({
    paletteKind: "ctad-class-enum",
    diagramType: "class",
    diagramSubtype: "enum",
    elementType: "System",
    label: "Enum",
    subLabel: "Enumerated set",
    Icon: ListOrdered,
  }),
] as const);

// Diagram-specific helper for the design shell: surface only the
// tiles that belong to the user's currently selected diagram.
export function ctadPaletteItemsByDiagramType(
  diagramType: AcwDiagramType,
): readonly CtadPaletteItem[] {
  return CTAD_PALETTE.filter((p) => p.diagramType === diagramType);
}

export function ctadPaletteItemByKind(
  kind: string,
): CtadPaletteItem | undefined {
  return CTAD_PALETTE.find((p) => p.paletteKind === kind);
}

// User-facing labels for the diagram selector. Short, descriptive,
// CTAD-vocabulary-clean. Asserted at module load below.
export const CTAD_DIAGRAM_TYPE_LABEL: Readonly<
  Record<AcwDiagramType, string>
> = Object.freeze({
  bpmn: "BPMN",
  erd: "ERD",
  ddl: "DDL",
  sequence: "Sequence",
  class: "Class",
});

// ---------------------------------------------------------------------------
// Module-load assertions.
// ---------------------------------------------------------------------------
//
// These are duplicated by `paletteRegistryInvariants.test-shape.ts`
// so the failure attributes to the negative-shape probe rather
// than this leaf module on regression. They run here as a
// belt-and-braces second line of defence.

// (a) Vocabulary tier — every label / sub-label / diagram-type
// label is asserted against CTAD_FORBIDDEN.
assertAllCtadLanguage([
  ...CTAD_PALETTE.map((p) => p.label),
  ...CTAD_PALETTE.map((p) => p.subLabel),
  ...Object.values(CTAD_DIAGRAM_TYPE_LABEL),
]);

// (b) Structural integrity:
//   - paletteKind values are unique;
//   - every tile names a diagramType the store knows;
//   - every tile names an element type whose grammar permits a
//     `null` parent;
//   - the diagram-label catalog covers exactly the diagram-type
//     set the store declares.
{
  const seen = new Set<string>();
  for (const item of CTAD_PALETTE) {
    if (seen.has(item.paletteKind)) {
      throw new Error(
        `CTAD palette registry: duplicate paletteKind "${item.paletteKind}".`,
      );
    }
    seen.add(item.paletteKind);
    if (!isAcwDiagramType(item.diagramType)) {
      throw new Error(
        `CTAD palette registry: item "${item.paletteKind}" references unknown diagramType "${item.diagramType}".`,
      );
    }
    if (!CTAD_PALETTE_ROOTABLE_ELEMENT_TYPES.has(item.elementType)) {
      throw new Error(
        `CTAD palette registry: item "${item.paletteKind}" uses elementType "${item.elementType}" which cannot sit at the workspace root; only Zone, ComputeNode, and System are root-droppable.`,
      );
    }
    // Belt-and-braces: confirm the rootable claim against the live
    // grammar contract instead of just the local set above.
    const permitted = permittedParentsFor(item.elementType);
    if (!permitted.includes(null)) {
      throw new Error(
        `CTAD palette registry: item "${item.paletteKind}" uses elementType "${item.elementType}" whose grammar does NOT permit a null parent.`,
      );
    }
    if (
      typeof item.diagramSubtype !== "string" ||
      item.diagramSubtype.length === 0
    ) {
      throw new Error(
        `CTAD palette registry: item "${item.paletteKind}" declares an empty diagramSubtype.`,
      );
    }
  }
  const labelKeys = new Set(Object.keys(CTAD_DIAGRAM_TYPE_LABEL));
  for (const t of ACW_DIAGRAM_TYPES) {
    if (!labelKeys.has(t)) {
      throw new Error(
        `CTAD palette registry: CTAD_DIAGRAM_TYPE_LABEL is missing the "${t}" entry.`,
      );
    }
  }
  if (labelKeys.size !== ACW_DIAGRAM_TYPES.length) {
    throw new Error(
      "CTAD palette registry: CTAD_DIAGRAM_TYPE_LABEL contains a key not present in ACW_DIAGRAM_TYPES.",
    );
  }
}
