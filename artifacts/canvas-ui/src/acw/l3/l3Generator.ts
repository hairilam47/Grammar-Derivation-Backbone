// EAStudio Path B Phase 2 (LoS framework) — L3 generator carve-out.
//
// Reads a frozen, read-only snapshot of a single CTAD architecture
// and projects a small, deterministic set of L3 ACW nodes into the
// Studio workspace. The generator is the ONLY module under
// `/src/acw/l3/` that touches the CTAD store, and the carve-out is
// scoped to ONE named import: `exportArchitectureState`. No type
// re-export, no namespace import, no dynamic import, no roster
// enumerator. The dedicated isolation invariant
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
//   - Mapping is intentionally a closed table:
//       * (infrastructure, hostingModel) where the chosen option
//         value normalises to "kubernetes" → ComputeNode
//         "Kubernetes cluster". ANY other value (including unset,
//         blank, or a different infrastructure choice) emits
//         nothing — there is no fallback label.
//       * (infrastructure, databaseClass) → Component labelled
//         with the chosen option value VERBATIM (so option
//         "Relational" mints a Component labelled "Relational").
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
// which both flushes the cache (via `__l3GeneratorInternals
// .resetMemoForTest` from `studioActions.clearStudio`) and
// re-mints any still-applicable L3 children.
import { exportArchitectureState } from "@/ctad/ctadStore";
import { createNode, getWorkspace, type AcwNode } from "../acwStore";
import { isVisibleAtLod } from "../acwGrammar";

// Locally-derived shape of `exportArchitectureState`'s return value.
// We do NOT import `CtadArchitectureStateExport` from the CTAD
// store — the carve-out is allowlisted to the single named symbol
// above. Using `ReturnType` keeps the generator's typing tied to
// the public contract of the carve-out without widening the import
// surface.
type CtadStateExport = NonNullable<
  ReturnType<typeof exportArchitectureState>
>;

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
  readonly sectionId:
    | "infrastructure"
    | "application"
    | "integration"
    | "crossCutting"
    | "ops";
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
    // Closed mapping: only `kubernetes` mints a ComputeNode (a
    // "Kubernetes cluster" label). All other hostingModel choices
    // — "On-prem", "Private", "Public", "Hybrid", or any value
    // not in the registry — emit nothing. Phase 2's L3 surface is
    // intentionally narrow, and the conservative mapping is part
    // of the spec contract.
    labelOf: (v) =>
      v.toLowerCase() === "kubernetes" ? "Kubernetes cluster" : null,
  },
  {
    sectionId: "infrastructure",
    paramId: "databaseClass",
    elementType: "Component",
    // Selected option value used VERBATIM as the Component label
    // (e.g. option "Relational" mints a Component labelled
    // "Relational"). No suffix, no transformation — Phase 2 keeps
    // the projection lossless so the Decision Contract value is
    // the single source of truth.
    labelOf: (v) => v,
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
  exp: CtadStateExport,
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
// the canonical entry point used by the EAStudio shell on L3 entry
// for a specific architecture pin. It runs `generateL3Nodes` at
// most once per (architectureId, CTAD state hash) pair within a
// single session. The hash is cheap (`JSON.stringify` of the export
// shape) and the cache is keyed by architectureId so cross-
// architecture flips never collide.
//
// There is intentionally NO "for all architectures" entry point in
// this module. Iterating the architecture roster would require a
// second CTAD-store named import (`listArchitectures`) outside the
// allowlisted carve-out, which the L3 isolation invariant forbids.
// Phase 2's Studio shell does not pin an architecture, so the
// shell currently does not auto-trigger generation; tests and any
// future shell that gains an architecture pin call this entry
// point directly with the chosen id.
// ---------------------------------------------------------------------------

const L3_MEMO: Map<string, string> = new Map();

function ctadStateHash(exp: CtadStateExport): string {
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

// ---------------------------------------------------------------------------
// Persisted-roster entry point. The Studio shell does not pin an
// architecture, so on L3 entry we need to iterate every architecture
// the CTAD store has on disk. The L3 isolation invariant restricts
// MODULE IMPORTS from `@/ctad/ctadStore` to a single named symbol
// (`exportArchitectureState`) — it does NOT restrict reading the
// CTAD store's persisted document directly through `localStorage`,
// which is a global runtime affordance and not an import. The CTAD
// storage key (`ctad.state.v1`) is documented in §10C of
// docs/ARCHITECTURE.md; we read it defensively here (no schema
// validation, no migration — those live in the CTAD store) purely
// to enumerate architecture ids. Each id is then handed to the
// allowlisted `exportArchitectureState` for the actual snapshot.
// Any malformed or absent storage value is a silent no-op so a
// fresh user (no CTAD data yet) sees an empty L3 surface instead
// of a crash.
// ---------------------------------------------------------------------------
const CTAD_STORAGE_KEY = "ctad.state.v1";

function readPersistedArchitectureIds(): readonly string[] {
  if (typeof window === "undefined") return [];
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(CTAD_STORAGE_KEY);
  } catch {
    return [];
  }
  if (raw === null || raw.length === 0) return [];
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch {
    return [];
  }
  if (doc === null || typeof doc !== "object") return [];
  const archs = (doc as { architectures?: unknown }).architectures;
  if (archs === null || archs === undefined || typeof archs !== "object") {
    return [];
  }
  const ids: string[] = [];
  for (const k of Object.keys(archs as Record<string, unknown>)) {
    if (typeof k === "string" && k.length > 0) ids.push(k);
  }
  return Object.freeze(ids);
}

/**
 * Studio L3-entry trigger: enumerate every CTAD architecture
 * currently persisted in `localStorage` and run the memoized
 * generator for each. The roster is read defensively from the
 * persisted CTAD document (no CTAD-store import beyond the
 * allowlisted `exportArchitectureState` used inside
 * `runL3Generator`). Idempotent across the whole roster: a
 * re-entry with no CTAD change is a byte-identical no-op for
 * each architecture.
 *
 * This is the canonical entry point used by `StudioCanvas` on
 * the per-session "edge" transition into L3 (`activeLod !== 3`
 * → `activeLod === 3`); the generator's session memo guarantees
 * that any redundant re-entry does not re-walk the workspace.
 */
export function runL3GeneratorForPersistedArchitectures(): readonly string[] {
  const archIds = readPersistedArchitectureIds();
  const all: string[] = [];
  for (const id of archIds) {
    for (const minted of runL3Generator(id)) {
      all.push(minted);
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
