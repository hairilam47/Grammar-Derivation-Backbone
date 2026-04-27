// EAStudio Path B Phase 2 (LoS framework) — L3 generator carve-out.
//
// Reads a frozen, read-only snapshot of every CTAD architecture and
// projects a small, deterministic set of L3 ACW nodes into the
// Studio workspace. The generator is the ONLY module under
// `/src/acw/l3/` that touches the CTAD store; it is allowed two
// named imports (`exportArchitectureState` for the per-architecture
// state snapshot and `listArchitectures` for the architecture
// roster) plus the matching read-only types. No write helper, no
// namespace import, no dynamic import — the dedicated isolation
// invariant `acwL3IsolationInvariants.test-shape.ts` enforces that
// stricter contract at build time.
//
// Constitutional discipline:
//   - Pure, idempotent, deterministic. Stable id
//     `l3:<architectureId>:<sectionId>:<paramId>` short-circuits on
//     re-run via the store's id-collision shortcut, so calling the
//     generator N times produces the same workspace as calling it
//     once.
//   - The generated nodes carry `lodRange: [3, 3]` so they are
//     visible ONLY at L3. L1 / L2 views remain pixel-identical to
//     pre-Phase-2 behaviour.
//   - Generated nodes attach to the sealed `domain-technology`
//     container (which the Studio canvas seeds on mount). If the
//     container is missing — for example because the workspace
//     document was hand-edited — the generator no-ops rather than
//     creating an orphan parent.
//   - Mapping is intentionally narrow in this phase:
//       * infrastructure.hostingModel  → ComputeNode "<value> hosting"
//       * infrastructure.databaseClass → Component  "<value> database"
//     Other CTAD parameters are reserved for later phases and are
//     not projected into the workspace today.
//   - The generator never deletes anything. A user-authored L3 node
//     at a colliding id is left in place via the same id-collision
//     shortcut the store uses for the domain containers.
//
// This module performs no IO; React lenses call
// `runL3GeneratorForAllArchitectures` once on L3 entry and the
// store's subscriber API drives the re-render.
import {
  exportArchitectureState,
  listArchitectures,
  type CtadArchitectureDoc,
  type CtadArchitectureStateExport,
} from "@/ctad/ctadStore";
import { createNode, getWorkspace, type AcwNode } from "../acwStore";

const L3_PARENT_ID = "domain-technology";
const L3_LOD_RANGE: readonly [3, 3] = Object.freeze([3, 3] as const);

// Per-architecture column stride in workspace-px. Picked to keep
// generated nodes inside the technology container's quadrant
// without overlapping siblings the user has authored. Layout
// carries no semantics; it is the same stride the existing palette
// drop helper uses.
const L3_COLUMN_STRIDE = 140;
const L3_ROW_STRIDE = 60;
const L3_BASE_X = 1000; // column 1 (technology) center
const L3_BASE_Y = 1000;

// Closed mapping table. Each entry projects ONE CTAD parameter into
// ONE ACW element type with a label derived from the option value.
// Adding a new mapping means adding a row here; the generator does
// not invent mappings on the fly.
interface L3Mapping {
  readonly sectionId: keyof Pick<
    CtadArchitectureStateExport,
    "infrastructure" | "application" | "integration" | "crossCutting" | "ops"
  >;
  readonly paramId: string;
  readonly elementType: AcwNode["type"];
  /**
   * Builds the visible label from the chosen option value. Returns
   * null to skip emission (the option value is unset / blank).
   */
  readonly labelOf: (value: string) => string;
}

const L3_MAPPINGS: readonly L3Mapping[] = Object.freeze([
  {
    sectionId: "infrastructure",
    paramId: "hostingModel",
    elementType: "ComputeNode",
    labelOf: (v) => `${v} hosting`,
  },
  {
    sectionId: "infrastructure",
    paramId: "databaseClass",
    elementType: "Component",
    labelOf: (v) => `${v} database`,
  },
]);

function readSingleParam(
  exp: CtadArchitectureStateExport,
  m: L3Mapping,
): string | null {
  const section = exp[m.sectionId] as Record<string, unknown> | undefined;
  if (section === undefined) return null;
  const v = section[m.paramId];
  if (typeof v !== "string") return null;
  if (v.length === 0) return null;
  return v;
}

/**
 * Generates L3 nodes for a single architecture. Idempotent —
 * calling twice produces the same workspace as calling once. Skips
 * silently when the architecture id resolves to no doc, when the
 * `domain-technology` container is missing, or when an individual
 * mapping reads an unset / blank parameter.
 *
 * Returns the set of node ids the generator considered (whether
 * created this call or already present), so callers can verify the
 * deterministic id contract from a probe without re-reading the
 * mapping.
 */
export function generateL3Nodes(architectureId: string): readonly string[] {
  if (typeof architectureId !== "string" || architectureId.length === 0) {
    return [];
  }
  const exp = exportArchitectureState(architectureId);
  if (exp === null) return [];
  // Refuse to mint orphans: if the sealed technology container
  // does not exist (e.g. the lens has not seeded it yet) we no-op.
  const ws = getWorkspace();
  const techParent = ws.structureGraph.nodes.find(
    (n) => n.id === L3_PARENT_ID,
  );
  if (techParent === undefined) return [];

  const considered: string[] = [];
  let column = 0;
  for (const m of L3_MAPPINGS) {
    const value = readSingleParam(exp, m);
    if (value === null) {
      // Bump the column anyway so a later mapping that DOES emit
      // does not slide on top of an earlier emission's slot when
      // the user changes a CTAD value upstream. The slot is
      // determined entirely by the mapping index.
      column += 1;
      continue;
    }
    const id = `l3:${architectureId}:${String(m.sectionId)}:${m.paramId}`;
    considered.push(id);
    // Idempotency: createNode short-circuits on id collision (same
    // mechanism the four sealed domain containers rely on). A
    // refused creation (e.g. the validator rejecting the parent
    // pairing) is not surfaced here — the L3 surface stays
    // visually empty and the validator's refusal channel carries
    // the diagnostic.
    createNode({
      id,
      type: m.elementType,
      parentId: L3_PARENT_ID,
      label: m.labelOf(value),
      x: L3_BASE_X + column * L3_COLUMN_STRIDE,
      y: L3_BASE_Y + L3_MAPPINGS.indexOf(m) * L3_ROW_STRIDE,
      domainTag: "technology",
      lodRange: L3_LOD_RANGE,
    });
    column += 1;
  }
  return Object.freeze(considered);
}

/**
 * Convenience entry point invoked by the Studio canvas on L3 entry.
 * Iterates every architecture currently in the CTAD store and runs
 * `generateL3Nodes` for each. Idempotent over the entire roster:
 * re-running with no CTAD change is a byte-identical no-op.
 *
 * NOTE on CTAD value changes: the stable id contract
 * (`l3:<architectureId>:<sectionId>:<paramId>`) guarantees no
 * duplicates on re-run, but it ALSO means the generator will not
 * overwrite an already-minted node's label when the upstream CTAD
 * value flips (e.g. the user toggles a `hostingModel` selection
 * between its two enum branches). Phase 2 deliberately does not
 * surface a destructive delete from this carve-out; refreshing
 * existing L3 nodes requires the workspace Clear action and a
 * fresh L3 entry. This matches the "no orphan recreate, never
 * deletes" discipline at the top of this module.
 */
export function runL3GeneratorForAllArchitectures(): readonly string[] {
  const archs: readonly CtadArchitectureDoc[] = listArchitectures();
  const all: string[] = [];
  for (const a of archs) {
    for (const id of generateL3Nodes(a.architectureId)) {
      all.push(id);
    }
  }
  return Object.freeze(all);
}
