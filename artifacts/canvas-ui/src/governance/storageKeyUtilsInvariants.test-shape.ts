// Storage-key scoping utility — build-time invariants.
//
// Asserts at module load:
//   1. `getScopedKey` composes Org+WorkItem and Org-only keys in
//      the documented shape (`<orgId>:<workItemId>:<baseKey>`,
//      `<orgId>:<baseKey>`).
//   2. Malformed segments throw rather than silently producing a
//      malformed key.
//   3. `currentScope.set` updates the singleton and notifies
//      listeners; setting the same value again is a no-op.
//   4. `resolveActiveKey` returns null when the scope is
//      insufficient and a well-formed scoped key otherwise.

import {
  getScopedKey,
  currentScope,
  resolveActiveKey,
  __snapshotScope,
  __restoreScopeSnapshot,
} from "./storageKeyUtils";

function expectThrow(label: string, fn: () => unknown): void {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  if (!threw) {
    throw new Error(
      `storageKeyUtils invariant: validator failed to reject "${label}".`,
    );
  }
}

function probeShape(): void {
  const orgKey = getScopedKey("adc.module-catalog.v1", "org-abc");
  if (orgKey !== "org-abc:adc.module-catalog.v1") {
    throw new Error(
      `storageKeyUtils invariant: org-only key shape drifted. ` +
        `Expected "org-abc:adc.module-catalog.v1", got "${orgKey}".`,
    );
  }
  const workItemKey = getScopedKey("adc.portfolio.v1", "org-abc", "wi-xyz");
  if (workItemKey !== "org-abc:wi-xyz:adc.portfolio.v1") {
    throw new Error(
      `storageKeyUtils invariant: work-item key shape drifted. ` +
        `Expected "org-abc:wi-xyz:adc.portfolio.v1", got "${workItemKey}".`,
    );
  }
}

function probeRejection(): void {
  expectThrow("empty baseKey", () => getScopedKey("", "org-abc"));
  expectThrow("null orgId", () =>
    getScopedKey("adc.portfolio.v1", null, "wi-xyz"),
  );
  expectThrow("orgId containing scope separator", () =>
    getScopedKey("adc.portfolio.v1", "org:abc", "wi-xyz"),
  );
  expectThrow("workItemId containing scope separator", () =>
    getScopedKey("adc.portfolio.v1", "org-abc", "wi:xyz"),
  );
  expectThrow("empty workItemId string", () =>
    getScopedKey("adc.portfolio.v1", "org-abc", ""),
  );
}

function probeCurrentScope(): void {
  const snap = __snapshotScope();
  try {
    let notified = 0;
    const unsubscribe = currentScope.subscribe(() => {
      notified += 1;
    });
    currentScope.set({ orgId: null, workItemId: null });
    currentScope.set({ orgId: "org-probe1", workItemId: null });
    if (notified === 0) {
      throw new Error(
        "storageKeyUtils invariant: currentScope.set did not notify listeners on change.",
      );
    }
    if (currentScope.get().orgId !== "org-probe1") {
      throw new Error(
        "storageKeyUtils invariant: currentScope.get did not return the value just set.",
      );
    }
    const before = notified;
    currentScope.set({ orgId: "org-probe1", workItemId: null });
    if (notified !== before) {
      throw new Error(
        "storageKeyUtils invariant: currentScope.set notified on a no-op change.",
      );
    }
    currentScope.set({ orgId: "org-probe1", workItemId: "wi-probe1" });
    const orgOnly = resolveActiveKey("acw.workspace.v1", false);
    const workItem = resolveActiveKey("acw.workspace.v1", true);
    if (orgOnly !== "org-probe1:acw.workspace.v1") {
      throw new Error(
        `storageKeyUtils invariant: resolveActiveKey(org-only) drifted ("${orgOnly}").`,
      );
    }
    if (workItem !== "org-probe1:wi-probe1:acw.workspace.v1") {
      throw new Error(
        `storageKeyUtils invariant: resolveActiveKey(work-item) drifted ("${workItem}").`,
      );
    }
    currentScope.set({ orgId: "org-probe1", workItemId: null });
    if (resolveActiveKey("acw.workspace.v1", true) !== null) {
      throw new Error(
        "storageKeyUtils invariant: resolveActiveKey(work-item) must return null when no Work Item is set.",
      );
    }
    currentScope.set({ orgId: null, workItemId: null });
    if (resolveActiveKey("acw.workspace.v1", false) !== null) {
      throw new Error(
        "storageKeyUtils invariant: resolveActiveKey(org-only) must return null when no Org is set.",
      );
    }
    unsubscribe();
  } finally {
    __restoreScopeSnapshot(snap);
  }
}

function run(): void {
  probeShape();
  probeRejection();
  probeCurrentScope();
}

run();
