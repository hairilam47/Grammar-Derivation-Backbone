// Dev-only seeder — build-time invariants.
//
// File suffix `.test-shape.ts` mirrors the existing CTAD / ACW
// negative-shape pattern: this module's exports are predicates,
// not feature surface. Removing this file plus its side-effect
// import in `WorkspaceShell.tsx` reverts the seeder's invariants
// without touching the seeder or its page.
//
// Asserts at module load (browser only — no-op on the server):
//
//   1. The seeder writes EXACTLY the storage keys listed in
//      `STORAGE_KEYS`. Adding a new key requires extending
//      `STORAGE_KEYS` and re-confirming the snapshot/restore
//      probe set.
//   2. Running `seedAll()` twice produces a byte-identical
//      localStorage snapshot for every seeded key. This is the
//      determinism contract: identical runs over identical
//      starting state yield identical persisted bytes.
//   3. The seeder reports zero validator refusals on a clean
//      run (`refusalsObserved === 0`). Any refusal would mean
//      the seeder smuggled a value past a public store API.
//   4. The seeded entity counts in `summary` match the spec
//      contract (portfolio:3, architectures:3, ous:2, signals:3,
//      cards:2, nodes:13, edges:2, track3:1). This locks the
//      surface contract documented in the task spec so a
//      regression in any seeded sub-domain surfaces immediately
//      on the next dev-build load.
//
// Probe protocol:
//   * Snapshot every seeded key (and only those) before the run,
//     plus the *full* set of localStorage key names so stray
//     writes outside `STORAGE_KEYS` are detectable.
//   * Run seedAll twice. After each run:
//       - Assert `summary.refusalsObserved === 0` so the seeder
//         cannot quietly route past a public store API.
//       - Walk the localStorage key universe and reject any new
//         key that is not in `STORAGE_KEYS` (forces the
//         preflight clear set to stay exhaustive).
//   * Capture both snapshots (Snapshot A after run 1, Snapshot B
//     after run 2) of the same seeded-key set.
//   * Restore the original snapshot in a `finally` block — the
//     probe never disturbs user data, even on failure.
//   * Compare A and B for byte equality. Throw if they differ
//     so the next dev-build load catches the regression.
//
// The probe is gated to dev builds (`import.meta.env.DEV`) so the
// production bundle pays no cost. The companion build-bundle
// regression check (Task #120) verifies the seeder symbol is
// absent from the production bundle.

import { seedAll, __seedAllInternals, type SeedSummary } from "./seedAll";
import { __acwStoreInternals } from "@/acw/acwStore";
import { __acwViewStateInternals } from "@/acw/acwViewState";
import { __acwWorkspaceViewPrefsInternals } from "@/acw/acwWorkspaceViewPrefs";
import { __ouStoreInternals } from "@/acw/orgUnits/ouStore";
import { __track3ViewPrefsInternals } from "@/acw/track3/track3ViewPrefs";
import {
  __snapshotScope,
  __restoreScopeSnapshot,
  currentScope,
  getScopedKey,
} from "@/governance/storageKeyUtils";

// Phase 2 (multi-tenant scoping): seedAll's underlying stores
// resolve their localStorage keys through `<orgId>:<workItemId>:<base>`.
// The probe installs a dedicated synthetic scope for the duration
// of the run and restores the original (typically empty) scope in
// the same `finally` block that restores its localStorage
// snapshot, so probe execution remains invisible to the running
// app.
const PROBE_ORG_ID = "__seed-all-probe-org__";
const PROBE_WI_ID = "__seed-all-probe-wi__";

// The seeder reports BASE storage keys (e.g. "ctad.state.v1"). To
// snapshot/restore in localStorage we must use the SCOPED form
// resolved against the synthetic probe scope above.
const BASE_KEYS = __seedAllInternals.STORAGE_KEYS;
// Org+Work-Item-scoped base keys. Keep in sync with the
// `needsWorkItem` flag in each store's `getKey()`. The org-only
// stores (module-catalog, OU registry) drop the workItemId
// segment.
const ORG_ONLY_BASE_KEYS = new Set<string>([
  "adc.module-catalog.v1",
  "acw.organisational-units.v1",
]);
const STORAGE_KEYS: readonly string[] = BASE_KEYS.map((base) =>
  ORG_ONLY_BASE_KEYS.has(base)
    ? getScopedKey(base, PROBE_ORG_ID)
    : getScopedKey(base, PROBE_ORG_ID, PROBE_WI_ID),
);

// Spec-contract counts. See `.local/tasks/seed-all-test-data.md`
// step "Visible counts" — locking these here means any drift in a
// seeded sub-domain surfaces on the next dev-build load.
const EXPECTED_COUNTS: Readonly<
  Pick<
    SeedSummary,
    | "portfolio"
    | "architectures"
    | "ous"
    | "signals"
    | "cards"
    | "nodes"
    | "edges"
    | "track3"
  >
> = Object.freeze({
  portfolio: 3,
  architectures: 3,
  ous: 2,
  signals: 3,
  cards: 2,
  nodes: 13,
  edges: 2,
  track3: 1,
});

function assertExpectedCounts(label: string, summary: SeedSummary): void {
  for (const [k, expected] of Object.entries(EXPECTED_COUNTS)) {
    const actual = summary[k as keyof typeof EXPECTED_COUNTS];
    if (actual !== expected) {
      throw new Error(
        `seedAll spec-count contract violated (${label}): ` +
          `expected ${k}=${expected}, got ${k}=${actual}.`,
      );
    }
  }
}

function reloadAllStores(): void {
  __acwStoreInternals.reloadFromStorageForTest();
  __acwViewStateInternals.reloadFromStorageForTest();
  __acwWorkspaceViewPrefsInternals.reloadFromStorageForTest();
  __ouStoreInternals.reloadFromStorageForTest();
  __track3ViewPrefsInternals.reloadFromStorageForTest();
}

function snapshotKeys(): Record<string, string | null> {
  const snap: Record<string, string | null> = {};
  for (const key of STORAGE_KEYS) {
    snap[key] = window.localStorage.getItem(key);
  }
  return snap;
}

// Captures the *full* set of localStorage keys present right now,
// not just the seeded subset. Used to detect stray writes to keys
// the seeder is not supposed to touch.
function snapshotAllKeyNames(): readonly string[] {
  const out: string[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const k = window.localStorage.key(i);
    if (k !== null) out.push(k);
  }
  out.sort();
  return out;
}

function restoreSnapshot(snap: Record<string, string | null>): void {
  for (const key of STORAGE_KEYS) {
    const prev = snap[key];
    if (prev === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, prev);
    }
  }
  reloadAllStores();
}

function runProbe(): void {
  const original = snapshotKeys();
  // Capture the full key universe BEFORE any seed run so we can
  // detect a seeder-introduced stray key on either run.
  const keysBefore = new Set(snapshotAllKeyNames());
  const allowedSeededKeys = new Set<string>(STORAGE_KEYS);
  try {
    // First run from a clean slate (the seeder clears these keys
    // first as part of its preflight, so even if `original` had
    // values they are wiped before the run).
    const summaryA = seedAll();
    if (summaryA.refusalsObserved !== 0) {
      throw new Error(
        `seedAll determinism probe (run 1) observed ` +
          `${summaryA.refusalsObserved} validator refusal(s)` +
          (summaryA.firstRefusalReason !== null
            ? ` — first reason: ${summaryA.firstRefusalReason}`
            : "") +
          ". Public-store-API contract violated.",
      );
    }
    assertExpectedCounts("run 1", summaryA);
    const snapA = snapshotKeys();
    const allKeysAfterA = snapshotAllKeyNames();
    for (const k of allKeysAfterA) {
      if (!keysBefore.has(k) && !allowedSeededKeys.has(k)) {
        throw new Error(
          `seedAll wrote to a stray localStorage key not in STORAGE_KEYS: "${k}". ` +
            `Either add it to STORAGE_KEYS (and to the preflight clear) or stop writing to it.`,
        );
      }
    }

    // Second run — same inputs, same starting state (the seeder
    // re-clears as part of its preflight). Output must match.
    const summaryB = seedAll();
    if (summaryB.refusalsObserved !== 0) {
      throw new Error(
        `seedAll determinism probe (run 2) observed ` +
          `${summaryB.refusalsObserved} validator refusal(s)` +
          (summaryB.firstRefusalReason !== null
            ? ` — first reason: ${summaryB.firstRefusalReason}`
            : "") +
          ". Public-store-API contract violated.",
      );
    }
    assertExpectedCounts("run 2", summaryB);
    const snapB = snapshotKeys();
    const allKeysAfterB = snapshotAllKeyNames();
    for (const k of allKeysAfterB) {
      if (!keysBefore.has(k) && !allowedSeededKeys.has(k)) {
        throw new Error(
          `seedAll wrote to a stray localStorage key not in STORAGE_KEYS: "${k}". ` +
            `Either add it to STORAGE_KEYS (and to the preflight clear) or stop writing to it.`,
        );
      }
    }

    for (const key of STORAGE_KEYS) {
      const a = snapA[key];
      const b = snapB[key];
      if (a !== b) {
        const aPreview = a === null ? "<absent>" : a.slice(0, 240);
        const bPreview = b === null ? "<absent>" : b.slice(0, 240);
        throw new Error(
          `seedAll determinism violation on key "${key}":\n` +
            `  run-1 (${a === null ? 0 : a.length} bytes): ${aPreview}\n` +
            `  run-2 (${b === null ? 0 : b.length} bytes): ${bPreview}`,
        );
      }
    }
  } finally {
    restoreSnapshot(original);
  }
}

// Probe at module load — runs once per dev page load, before the
// user clicks anything. Gated to browser + dev so the SSR /
// production paths pay nothing.
const isBrowser = typeof window !== "undefined" && !!window.localStorage;
const isDev =
  typeof import.meta !== "undefined" &&
  typeof import.meta.env !== "undefined" &&
  import.meta.env.DEV === true;

if (isBrowser && isDev) {
  const __scopeSnap = __snapshotScope();
  currentScope.set({ orgId: PROBE_ORG_ID, workItemId: PROBE_WI_ID });
  try {
    runProbe();
  } finally {
    __restoreScopeSnapshot(__scopeSnap);
  }
}

export const __seedAllInvariantsInternals = Object.freeze({
  STORAGE_KEYS,
  runProbe,
});
