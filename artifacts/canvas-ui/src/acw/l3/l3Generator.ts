// EAStudio Path B Phase 2 (LoS framework) — L3 generator carve-out.
//
// Reads a frozen, read-only snapshot of a single CTAD architecture
// and projects a small, deterministic set of L3 ACW nodes into the
// Studio workspace. The generator is the ONLY module under
// `/src/acw/l3/` that touches the CTAD store; it is allowed two
// named imports (`exportArchitectureState` for the per-architecture
// state snapshot, `listArchitectures` for the architecture roster
// used by the convenience entry point) plus the matching read-only
// types. No write helper, no namespace import, no dynamic import —
// the dedicated isolation invariant
// `acwL3IsolationInvariants.test-shape.ts` enforces that stricter
// contract at build time.
//
// Constitutional discipline:
//   - Pure, idempotent, deterministic. Stable id
//     `l3:<parentNodeId>:<sectionId>:<paramId>` short-circuits on
//     re-run via the store's id-collision shortcut, so calling the
//     generator N times produces the same workspace as calling it
//     once.
//   - For every L2 ACW node that carries a `boundParam`, the
//     generator creates exactly ONE L3 child parented to that L2
//     node, with `lodRange: [3, 3]` so the child is visible only
//     at L3. Nodes without a `boundParam` are ignored.
//   - The generator never mutates L1 or L2 nodes and never deletes
//     anything. Once an L2 origin is removed (by whatever mechanism
//     the surrounding shell offers — Phase 2 ships none), a
//     subsequent generator call will NOT re-mint the now-orphaned
//     L3 child, because the originating `boundParam` is gone.
//     The dedicated invariant probe asserts this no-orphan-recreate
//     contract.
//   - A user-authored L3 node at a colliding id is left in place
//     via the same id-collision shortcut the store uses for the
//     four sealed domain containers.
//   - Mapping is intentionally narrow in this phase:
//       * (infrastructure, hostingModel) where the option value
//         resolves to "kubernetes" → ComputeNode "Kubernetes
//         cluster"; any other option value → ComputeNode labelled
//         "<value> hosting".
//       * (infrastructure, databaseClass) → Component labelled
//         with the option value verbatim (e.g. "Postgres database"
//         from option "Postgres").
//     Any (sectionId, paramId) pair NOT listed in `L3_MAPPINGS` is
//     skipped; the table is the closed set.
//   - The L2 node's `boundParam.optionValue` is intentionally NOT
//     used as the source of truth — the live CTAD architecture
//     state is. The seed copies the option onto the bound node
//     for label-resolution caching, but Phase 2's L3 children
//     follow whatever the user has subsequently configured in the
//     Decision Contract.
//
// Session memoization (per spec): `runL3Generator(architectureId)`
// runs `generateL3Nodes` exactly once per architecture per session
// AND once per CTAD-state hash. Subsequent L3 entries with no
// upstream change are byte-identical no-ops without re-walking the
// store. The cache is module-scoped because the carve-out is the
// single owner of the L3 generation contract; clearing the cache
// requires the workspace `Clear` action followed by an L3 entry,
// which both flushes the cache (via `__resetL3GeneratorMemo` on
// internals) and re-mints any still-applicable L3 children.
import {
  exportArchitectureState,
  listArchitectures,
  type CtadArchitectureDoc,
  type CtadArchitectureStateExport,
} from "@/ctad/ctadStore";
import { createNode, getWorkspace, type AcwNode } from "../acwStore";
import { isVisibleAtLod } from "../acwGrammar";

const L3_LOD_RANGE: readonly [3, 3] = Object.freeze([3, 3] as const);

// Pixel offset of the generated child relative to its L2 parent.
// Layout carries no semantics; it just keeps the L3 child away
// from the parent's centre so the two are visually distinguishable
// when both are rendered (in 3D L3 view, only the child is shown,
// but the parent's x/y is the local origin).
const L3_CHILD_DX = 60;
const L3_CHILD_DY = 60;

// Closed mapping table. Each row projects ONE CTAD parameter into
// ONE ACW element type with a label derived from the option value.
// Adding a row here is the only way to extend the L3 surface; the
// generator never invents a mapping on the fly.
interface L3Mapping {
  readonly sectionId: keyof Pick<
    CtadArchitectureStateExport,
    "infrastructure" | "application" | "integration" | "crossCutting" | "ops"
  >;
  readonly paramId: string;
  readonly elementType: AcwNode["type"];
  /**
   * Builds the visible label from the chosen option value. Returns
   * null to skip emission (the option value is unset / blank /
   * outside the closed set the mapping recognises).
   */
  readonly labelOf: (value: string) => string | null;
}

const L3_MAPPINGS: readonly L3Mapping[] = Object.freeze([
  {
    sectionId: "infrastructure",
    paramId: "hostingModel",
    elementType: "ComputeNode",
    labelOf: (v) => {
      const lower = v.toLowerCase();
      if (lower === "kubernetes") return "Kubernetes cluster";
      return `${v} hosting`;
    },
  },
  {
    sectionId: "infrastructure",
    paramId: "databaseClass",
    elementType: "Component",
    labelOf: (v) => `${v} database`,
  },
]);

function findMapping(
  sectionId: string,
  paramId: string,
): L3Mapping | undefined {
  for (const m of L3_MAPPINGS) {
    if (m.sectionId === sectionId && m.paramId === paramId) return m;
  }
  return undefined;
}

function readCtadValue(
  exp: CtadArchitectureStateExport,
  sectionId: string,
  paramId: string,
): string | null {
  if (
    sectionId !== "infrastructure" &&
    sectionId !== "application" &&
    sectionId !== "integration" &&
    sectionId !== "crossCutting" &&
    sectionId !== "ops"
  ) {
    return null;
  }
  const section = exp[sectionId];
  if (section === undefined) return null;
  const v = section[paramId];
  if (typeof v !== "string") return null;
  if (v.length === 0) return null;
  return v;
}

/**
 * Generates L3 nodes for a single architecture. Idempotent —
 * calling twice produces the same workspace as calling once. Skips
 * silently when the architecture id resolves to no doc, when no L2
 * node carries `boundParam`, or when an individual `boundParam`
 * does not resolve to a value via the closed mapping table.
 *
 * Returns the set of node ids the generator considered (whether
 * created this call or already present), so the dedicated
 * generator invariant probe can verify the deterministic id
 * contract without re-reading the mapping.
 */
export function generateL3Nodes(architectureId: string): readonly string[] {
  if (typeof architectureId !== "string" || architectureId.length === 0) {
    return [];
  }
  const exp = exportArchitectureState(architectureId);
  if (exp === null) return [];

  const ws = getWorkspace();
  const considered: string[] = [];
  // Snapshot the parent set before iteration so creating a child
  // does not extend the iteration range. Filter out nodes that
  // are themselves L3-only (lodRange = [3, 3]) — the generator
  // only descends from L1 / L2 origins.
  const l2Origins = ws.structureGraph.nodes.filter(
    (n) =>
      n.boundParam !== undefined &&
      n.isDomainContainer !== true &&
      isVisibleAtLod(n, 2),
  );

  for (const parent of l2Origins) {
    const bp = parent.boundParam;
    if (bp === undefined) continue;
    const mapping = findMapping(bp.sectionId, bp.paramId);
    if (mapping === undefined) continue;
    const value = readCtadValue(exp, bp.sectionId, bp.paramId);
    if (value === null) continue;
    const label = mapping.labelOf(value);
    if (label === null) continue;

    const id = `l3:${parent.id}:${bp.sectionId}:${bp.paramId}`;
    considered.push(id);
    // Idempotency: createNode short-circuits on id collision (same
    // mechanism the four sealed domain containers rely on). A
    // refused creation (e.g. the validator rejecting the parent
    // pairing because the L2 origin's element type cannot host
    // the projected child type) is not surfaced here — the L3
    // surface stays visually empty for that mapping and the
    // validator's refusal channel carries the diagnostic.
    createNode({
      id,
      type: mapping.elementType,
      parentId: parent.id,
      label,
      x: parent.x + L3_CHILD_DX,
      y: parent.y + L3_CHILD_DY,
      domainTag: parent.domainTag,
      lodRange: L3_LOD_RANGE,
    });
  }
  return Object.freeze(considered);
}

// ---------------------------------------------------------------------------
// Session memoization (per spec): `runL3Generator(architectureId)` is
// the canonical entry point used by the EAStudio shell on L3 entry.
// It runs `generateL3Nodes` at most once per (architectureId, CTAD
// state hash) pair within a single session. The hash is cheap
// (`JSON.stringify` of the export shape) and the cache is keyed by
// architectureId so cross-architecture flips never collide.
// ---------------------------------------------------------------------------

const L3_MEMO: Map<string, string> = new Map();

function ctadStateHash(exp: CtadArchitectureStateExport): string {
  return JSON.stringify(exp);
}

/**
 * Run the L3 generator once for `architectureId` per (architectureId,
 * CTAD-state-hash) pair within a session. Re-entry with no upstream
 * change is a memo hit — it does not call `generateL3Nodes` and
 * does not touch the workspace store. A change to ANY value in the
 * architecture's exported state invalidates the memo and triggers a
 * single re-run.
 *
 * Returns the set of node ids the generator considered on this call
 * (empty array on a memo hit).
 */
export function runL3Generator(architectureId: string): readonly string[] {
  if (typeof architectureId !== "string" || architectureId.length === 0) {
    return [];
  }
  const exp = exportArchitectureState(architectureId);
  if (exp === null) return [];
  const hash = ctadStateHash(exp);
  const prev = L3_MEMO.get(architectureId);
  if (prev === hash) return Object.freeze([] as string[]);
  const out = generateL3Nodes(architectureId);
  L3_MEMO.set(architectureId, hash);
  return out;
}

/**
 * Convenience entry point used by the Studio canvas when the user
 * enters L3 with the singleton lens that has no architectureId
 * pin: iterates every architecture currently in the CTAD store and
 * runs the memoized `runL3Generator` for each. Idempotent over the
 * whole roster: a re-entry with no CTAD change is a byte-identical
 * no-op.
 *
 * NOTE on CTAD value changes: the stable id contract
 * (`l3:<parentNodeId>:<sectionId>:<paramId>`) guarantees no
 * duplicates on re-run, but it ALSO means the generator will not
 * overwrite an already-minted node's label when the upstream
 * Decision Contract value flips between options. Phase 2
 * deliberately does not surface a destructive delete from this
 * carve-out; refreshing existing L3 nodes requires the workspace
 * Clear action and a fresh L3 entry. This matches the "no orphan
 * recreate, never deletes" discipline at the top of this module.
 */
export function runL3GeneratorForAllArchitectures(): readonly string[] {
  const archs: readonly CtadArchitectureDoc[] = listArchitectures();
  const all: string[] = [];
  for (const a of archs) {
    for (const id of runL3Generator(a.architectureId)) {
      all.push(id);
    }
  }
  return Object.freeze(all);
}

/**
 * Test-only / Clear-only memo flush. The Studio canvas calls this
 * from the workspace `Clear` action so the next L3 entry mints
 * fresh children that reflect the now-empty workspace. Probes
 * use it to assert generator purity across calls. Not part of the
 * public Phase 2 surface.
 */
export const __l3GeneratorInternals = Object.freeze({
  resetMemoForTest(): void {
    L3_MEMO.clear();
  },
});
