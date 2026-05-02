// Dev-only golden-scenario seeder invariants.
//
// File suffix `.test-shape.ts` mirrors the existing seedAllInvariants
// pattern: this module's exports are predicates, not feature surface.
// Removing this file plus its side-effect import in `App.tsx` reverts
// the golden seeder's invariants without touching the seeder itself.
//
// Asserts at module load (browser only — no-op on the server):
//
//   1. Running `seedGolden()` twice from a clean state produces a
//      byte-identical localStorage snapshot for every key the seeder
//      writes. This is the determinism contract: identical runs over
//      identical starting state yield identical persisted bytes.
//   2. The seeded entity counts in the returned summary match the
//      spec contract (modules:6, requirements:11, ctadNodes:22,
//      acwNodes:46, edges:26, ous:2, signals:2). This locks the
//      surface contract so a regression in any seeded sub-domain
//      surfaces immediately on the next dev-build load.
//
// Probe protocol:
//   * Snapshot `currentScope` before the probe and restore it in the
//     same `finally` block that restores localStorage — mirroring the
//     `seedAllInvariants.test-shape.ts` scope-safe pattern exactly.
//     Without this, `seedGolden()`'s internal `currentScope.set` call
//     would leak the golden org/WI scope into the live app after the
//     probe exits.
//   * Capture a full snapshot of the entire localStorage key universe
//     before the probe so any pre-existing user data can be restored
//     verbatim in the `finally` block.
//   * Run seedGolden() once. The seeder calls clearGoldenScope() as
//     its own preflight, so it always starts from a clean slate.
//   * Resolve the golden scoped storage keys by looking up the
//     deterministic EA Blueprint WI id that createOrganisation minted
//     during run 1. Use getScopedKey to build the on-disk form of
//     each GOLDEN_BASE_KEY.
//   * Assert spec counts for run 1.
//   * Capture Snapshot A (seeded-key set only).
//   * Run seedGolden() a second time (same self-clearing preflight).
//   * Assert spec counts for run 2.
//   * Capture Snapshot B of the same seeded-key set.
//   * Compare A and B for byte equality. Throw on any mismatch so the
//     regression surfaces on the next dev-build page load.
//   * Restore localStorage snapshot and then restore the original
//     `currentScope` — the probe never disturbs user data or scope,
//     even on failure.
//
// The probe is gated to dev builds (`import.meta.env.DEV`) so the
// production bundle pays no cost.

import { seedGolden, __seedGoldenInternals, type GoldenSeedSummary } from "./seedGolden";
import { getEaBlueprintForOrg } from "@/governance/workItemStore";
import {
  getScopedKey,
  __snapshotScope,
  __restoreScopeSnapshot,
} from "@/governance/storageKeyUtils";
import { __acwStoreInternals } from "@/acw/acwStore";
import { __acwViewStateInternals } from "@/acw/acwViewState";
import { __acwWorkspaceViewPrefsInternals } from "@/acw/acwWorkspaceViewPrefs";
import { __ouStoreInternals } from "@/acw/orgUnits/ouStore";
import { __track3ViewPrefsInternals } from "@/acw/track3/track3ViewPrefs";
import { __resetScopedStorageForTest } from "@/governance/scopedStorageClient";

const { GOLDEN_BASE_KEYS, ORG_ID } = __seedGoldenInternals;

// Spec-contract counts derived from reading seedGolden.ts:
//   modules      — 6  (six createModule calls)
//   requirements — 11 (REQUIREMENT_FIXTURES length)
//   ctadNodes    — 22 (CTAD_NODES array: 9 BPMN + 4 ERD + 3 DDL + 3 Seq + 3 Class)
//   acwNodes     — 46 (24 ACW canvas nodes from sections 5a–5d + 22 CTAD nodes)
//   edges        — 26 (10 canvas + 7 BPMN + 3 ERD + 2 DDL + 2 Seq + 2 Class)
//   ous          — 2  (ou-border + ou-visa)
//   signals      — 2  (Risk Accumulation + Posture Drift)
const EXPECTED_COUNTS: Readonly<
  Pick<
    GoldenSeedSummary,
    | "modules"
    | "requirements"
    | "ctadNodes"
    | "acwNodes"
    | "edges"
    | "ous"
    | "signals"
  >
> = Object.freeze({
  modules:      6,
  requirements: 11,
  ctadNodes:    22,
  acwNodes:     46,
  edges:        26,
  ous:          2,
  signals:      2,
});

function assertExpectedCounts(label: string, summary: GoldenSeedSummary): void {
  for (const [k, expected] of Object.entries(EXPECTED_COUNTS)) {
    const actual = summary[k as keyof typeof EXPECTED_COUNTS];
    if (actual !== expected) {
      throw new Error(
        `seedGolden spec-count contract violated (${label}): ` +
          `expected ${k}=${expected}, got ${k}=${actual}.`,
      );
    }
  }
}

function reloadAllStores(): void {
  __resetScopedStorageForTest();
  __acwStoreInternals.reloadFromStorageForTest();
  __acwViewStateInternals.reloadFromStorageForTest();
  __acwWorkspaceViewPrefsInternals.reloadFromStorageForTest();
  __ouStoreInternals.reloadFromStorageForTest();
  __track3ViewPrefsInternals.reloadFromStorageForTest();
}

// Build the resolved (on-disk) storage key list for the golden org
// and the given EA Blueprint WI id. Mirrors the scoping rules in
// GOLDEN_BASE_KEYS (needsWorkItem flag).
function resolveGoldenKeys(wiId: string): readonly string[] {
  return GOLDEN_BASE_KEYS.map(({ key, needsWorkItem }) =>
    needsWorkItem
      ? getScopedKey(key, ORG_ID, wiId)
      : getScopedKey(key, ORG_ID),
  );
}

// Capture a snapshot of every key in the resolved golden key set.
function snapshotGoldenKeys(goldenKeys: readonly string[]): Record<string, string | null> {
  const snap: Record<string, string | null> = {};
  for (const key of goldenKeys) {
    snap[key] = window.localStorage.getItem(key);
  }
  return snap;
}

// Capture the full localStorage universe as a key→value map so we can
// restore it completely after the probe — including any keys that the
// seeder's clearGoldenScope() removes from the org / WI registries.
function snapshotFullStorage(): Record<string, string | null> {
  const snap: Record<string, string | null> = {};
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const k = window.localStorage.key(i);
    if (k !== null) snap[k] = window.localStorage.getItem(k);
  }
  return snap;
}

function restoreFullStorage(snap: Record<string, string | null>): void {
  // Remove any keys that did not exist before the probe.
  const preProbeKeys = new Set(Object.keys(snap));
  const keysToRemove: string[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const k = window.localStorage.key(i);
    if (k !== null && !preProbeKeys.has(k)) keysToRemove.push(k);
  }
  for (const k of keysToRemove) {
    window.localStorage.removeItem(k);
  }
  // Restore original values (including keys that clearGoldenScope removed).
  for (const [key, value] of Object.entries(snap)) {
    if (value === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  }
  reloadAllStores();
}

function runProbe(): void {
  const originalStorage = snapshotFullStorage();
  try {
    // Run 1 — the seeder calls clearGoldenScope() as its own preflight.
    const summaryA = seedGolden();
    assertExpectedCounts("run 1", summaryA);

    // Resolve the on-disk golden key set now that the org + WI exist.
    const bp = getEaBlueprintForOrg(ORG_ID);
    if (bp === null) {
      throw new Error(
        "seedGolden determinism probe: EA Blueprint Work Item not found " +
          `for org "${ORG_ID}" after run 1.`,
      );
    }
    const goldenKeys = resolveGoldenKeys(bp.id);
    const snapA = snapshotGoldenKeys(goldenKeys);

    // Run 2 — seeder self-clears and re-seeds identically.
    const summaryB = seedGolden();
    assertExpectedCounts("run 2", summaryB);

    const snapB = snapshotGoldenKeys(goldenKeys);

    // Byte-identity check across every seeded key.
    for (const key of goldenKeys) {
      const a = snapA[key];
      const b = snapB[key];
      if (a !== b) {
        const aPreview = a === null ? "<absent>" : a.slice(0, 240);
        const bPreview = b === null ? "<absent>" : b.slice(0, 240);
        throw new Error(
          `seedGolden determinism violation on key "${key}":\n` +
            `  run-1 (${a === null ? 0 : a.length} bytes): ${aPreview}\n` +
            `  run-2 (${b === null ? 0 : b.length} bytes): ${bPreview}`,
        );
      }
    }
  } finally {
    // Restore localStorage + stores first, then restore scope — same
    // order as the seedAllInvariants probe.
    restoreFullStorage(originalStorage);
  }
}

// Probe at module load — runs once per dev page load, before the
// user clicks anything. Gated to browser + dev so SSR / production
// paths pay nothing.
//
// Scope-safe protocol (mirrors seedAllInvariants.test-shape.ts):
//   Snapshot currentScope before the run, restore it in the same
//   finally block so the probe never leaks the golden org/WI scope
//   into the live app after it exits.
const isBrowser = typeof window !== "undefined" && !!window.localStorage;
const isDev =
  typeof import.meta !== "undefined" &&
  typeof import.meta.env !== "undefined" &&
  import.meta.env.DEV === true;

if (isBrowser && isDev) {
  const __scopeSnap = __snapshotScope();
  try {
    runProbe();
  } finally {
    __restoreScopeSnapshot(__scopeSnap);
  }
}

export const __seedGoldenInvariantsInternals = Object.freeze({
  runProbe,
});
