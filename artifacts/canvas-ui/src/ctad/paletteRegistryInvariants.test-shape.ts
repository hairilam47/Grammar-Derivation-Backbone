// CTAD Phase 3 (Task #152) — palette registry build-time invariants.
//
// Negative-shape module: fails the bundle if the CTAD palette
// registry drifts from the structural contract that
// `CtadDesignShell` and the drop wiring rely on. Side-effect
// import in `App.tsx` (alongside the other CTAD invariant probes)
// so any drift produces a load-time failure rather than a silent
// runtime regression.
//
// What this module guards (in addition to the inline assertions
// inside `paletteRegistry.ts` itself; the inline pass is a second
// line of defence so the bundle still fails even if this probe is
// ever excised in error):
//
//   (1) `paletteKind` values are unique across the whole palette.
//   (2) Every tile names a `diagramType` the store recognises
//       (`isAcwDiagramType` from `acwStore`).
//   (3) Every tile names an `elementType` whose grammar permits a
//       `null` parent — i.e. the validator will accept a root drop.
//       The four sealed domain containers (`BusinessEntity`) are
//       NOT droppable; `Component` is NOT droppable because its
//       permitted parents are `["System", "Zone"]`.
//   (4) Every diagram type carries at least one tile (the design
//       shell would otherwise present an empty palette and a user
//       could not author into that diagram).
//   (5) `paletteKind` strings are namespaced with the literal
//       prefix `"ctad-"` so a stray drop into an EAStudio palette
//       handler (or vice versa) cannot accidentally collide on
//       kind values.
//   (6) Every label and sub-label is asserted against the CTAD
//       vocabulary tier via `assertAllCtadLanguage`.
//
// Removing this file plus its side-effect import in App.tsx
// restores pre-Phase-3 behaviour with no other change required.
import { assertAllCtadLanguage } from "../governance/staticTextGuard";
import {
  ACW_DIAGRAM_TYPES,
  isAcwDiagramType,
} from "../acw/acwStore";
import { permittedParentsFor } from "../acw/acwGrammar";
import {
  CTAD_PALETTE,
  CTAD_DIAGRAM_TYPE_LABEL,
} from "./paletteRegistry";

const PREFIX = "CTAD Phase 3 palette-registry invariant violation";

// (1) paletteKind uniqueness.
{
  const seen = new Set<string>();
  for (const item of CTAD_PALETTE) {
    if (seen.has(item.paletteKind)) {
      throw new Error(
        `${PREFIX}: duplicate paletteKind "${item.paletteKind}".`,
      );
    }
    seen.add(item.paletteKind);
  }
}

// (5) Namespacing — every paletteKind starts with "ctad-".
for (const item of CTAD_PALETTE) {
  if (!item.paletteKind.startsWith("ctad-")) {
    throw new Error(
      `${PREFIX}: paletteKind "${item.paletteKind}" must start with "ctad-" so it cannot collide with EAStudio palette kinds.`,
    );
  }
}

// (2) Every diagramType is a known store-recognised value.
for (const item of CTAD_PALETTE) {
  if (!isAcwDiagramType(item.diagramType)) {
    throw new Error(
      `${PREFIX}: item "${item.paletteKind}" references unknown diagramType "${item.diagramType}".`,
    );
  }
}

// (3) Every elementType permits a `null` parent (root-droppable).
for (const item of CTAD_PALETTE) {
  const permitted = permittedParentsFor(item.elementType);
  if (!permitted.includes(null)) {
    throw new Error(
      `${PREFIX}: item "${item.paletteKind}" uses elementType "${item.elementType}" whose grammar does NOT permit a null parent. CTAD palette tiles must be root-droppable; only Zone, ComputeNode, and System are eligible (Component requires System/Zone parent; BusinessEntity is sealed).`,
    );
  }
}

// (4) Every diagram type has at least one tile, AND each diagram
// carries the exact tile count this Phase-3 surface ships with.
// Pinning the per-diagram count is what catches an accidental
// drop or rename of a tile that still passes uniqueness — the
// designed BPMN/ERD/DDL/Sequence/Class palettes have known fixed
// rosters and a regression should fail the bundle, not silently
// shrink the palette.
{
  const expectedCounts: Readonly<Record<string, number>> = {
    bpmn: 8,
    erd: 5,
    ddl: 6,
    sequence: 5,
    class: 5,
  };
  const actual = new Map<string, number>();
  for (const item of CTAD_PALETTE) {
    actual.set(item.diagramType, (actual.get(item.diagramType) ?? 0) + 1);
  }
  for (const t of ACW_DIAGRAM_TYPES) {
    const have = actual.get(t) ?? 0;
    const want = expectedCounts[t];
    if (have === 0) {
      throw new Error(
        `${PREFIX}: diagram type "${t}" has zero palette tiles. Every diagram surface must be authorable.`,
      );
    }
    if (want !== undefined && have !== want) {
      throw new Error(
        `${PREFIX}: diagram type "${t}" has ${have} palette tile(s); the Phase-3 contract pins this at ${want}. Update the expected-count table here when the contract changes intentionally.`,
      );
    }
  }
}

// (6) Vocabulary tier — every label / sub-label / diagram-type
// label is CTAD-vocabulary clean. (assertAllCtadLanguage throws
// on the first forbidden token, naming both token and source.)
assertAllCtadLanguage([
  ...CTAD_PALETTE.map((p) => p.label),
  ...CTAD_PALETTE.map((p) => p.subLabel),
  ...Object.values(CTAD_DIAGRAM_TYPE_LABEL),
]);
