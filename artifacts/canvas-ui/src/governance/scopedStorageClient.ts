// Sync, cache-backed scoped-storage client.
//
// Phase 3 — every persisted ADC/CTAD/ACW document lives on the
// api-server. The browser stores keep their existing synchronous
// shape via this two-tier cache:
//
//   L1  in-memory `Map<scopedKey, string>`     — sync source of truth
//   L2  `window.localStorage[scopedKey]`        — survives refresh, used as
//                                                fallback bootstrap if the
//                                                server has not been
//                                                contacted yet
//   L3  api-server `/api/orgs/.../scoped/...`  — durable, cross-device
//
// Reads return synchronously from L1 (fall through to L2 on a
// miss). Writes update L1 + L2 immediately so callers see their
// own writes back, then schedule a fire-and-forget API write to
// L3. Scope changes trigger an async `hydrateScope()` pass that
// asks the server for every document under that scope and
// reconciles L1/L2 with the response, then notifies the supplied
// "scope-changed" subscribers so each store's React adapters
// re-render.

import {
  apiDeleteOrgScoped,
  apiDeleteWorkItemScoped,
  apiListOrgScoped,
  apiListWorkItemScoped,
  apiPutOrgScoped,
  apiPutWorkItemScoped,
} from "./serverApi";
import { currentScope, getScopedKey } from "./storageKeyUtils";

// L1 cache. Entries are full scoped keys
// (`<orgId>:<baseKey>` or `<orgId>:<wiId>:<baseKey>`).
const cache = new Map<string, string>();

// Canonical id shapes accepted by the api-server are declared
// further down (`ORG_ID_RE` / `WI_ID_RE`) and shared with the
// `decomposeScopedKey` helper. The `hydrateScope` and fire-and-
// forget write/delete paths reuse them so synthetic ids used by
// the in-process invariant probes (e.g. `__seed-all-...`) don't
// spam 400s while still keeping the L1/L2 cache working.

// Tracks which scopes have been hydrated from the server at least
// once. Until a scope is hydrated, reads use the L2 (localStorage)
// fallback so a hard-refresh deep link still renders prior state.
const hydratedScopes = new Set<string>();

// Subscribers notified after each `hydrateScope()` completes so
// stores can re-read the cache. Keyed callback, called with the
// freshly-hydrated scope key prefix so subscribers can ignore
// scopes they don't care about.
type HydrationListener = (prefix: string) => void;
const hydrationListeners = new Set<HydrationListener>();

/**
 * Subscribe to scope-hydration notifications. Call the returned
 * disposer to unsubscribe.
 */
export function subscribeHydration(listener: HydrationListener): () => void {
  hydrationListeners.add(listener);
  return () => {
    hydrationListeners.delete(listener);
  };
}

/**
 * Subscribe to BOTH active-scope changes (`currentScope.subscribe`)
 * AND hydration completions (`subscribeHydration`). Tenant-scoped
 * stores use this so their cached snapshot is invalidated when
 * either the scope flips OR the server response arrives — without
 * this, a fresh-device boot would render empty state until the
 * user manually toggled scopes.
 *
 * The callback is invoked with no arguments and should drop its
 * cache + notify subscribers, e.g.:
 *
 *   onScopeOrHydrationChange(() => { cache = null; notify(); });
 */
export function onScopeOrHydrationChange(cb: () => void): () => void {
  const u1 = currentScope.subscribe(cb);
  const u2 = subscribeHydration(() => {
    cb();
  });
  return () => {
    u1();
    u2();
  };
}

function notifyHydration(prefix: string): void {
  for (const l of hydrationListeners) {
    try {
      l(prefix);
    } catch {
      // listener errors must not break the cache
    }
  }
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function localStorageGet(key: string): string | null {
  if (!isBrowser()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function localStorageSet(key: string, value: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // quota exceeded etc — non-fatal, the API write is the
    // source of truth.
  }
}

function localStorageRemove(key: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // non-fatal
  }
}

/**
 * Synchronously read the value at a scoped key. Returns `null`
 * when the key is missing or when no scope is active.
 */
export function readScoped(scopedKey: string | null): string | null {
  if (scopedKey === null) return null;
  if (cache.has(scopedKey)) return cache.get(scopedKey) ?? null;
  // L2 fallback: use whatever localStorage already holds. This
  // keeps the very first render after a hard refresh non-blank
  // even before the server has been contacted.
  const ls = localStorageGet(scopedKey);
  if (ls !== null) cache.set(scopedKey, ls);
  return ls;
}

/**
 * Synchronously write a value to a scoped key. Updates the
 * in-memory cache and the legacy localStorage cache, then fires
 * off an async API write so the value is durable cross-device.
 *
 * No-op when `scopedKey` is null (no active scope).
 */
export function writeScoped(scopedKey: string | null, value: string): void {
  if (scopedKey === null) return;
  cache.set(scopedKey, value);
  localStorageSet(scopedKey, value);
  void writeScopedToServer(scopedKey, value).catch((err) => {
    // eslint-disable-next-line no-console
    console.warn(
      `[scopedStorage] failed to PUT scoped doc ${scopedKey}:`,
      err,
    );
  });
}

/**
 * Synchronously remove a scoped document from cache + L2 +
 * (asynchronously) the server. No-op when `scopedKey` is null.
 */
export function removeScoped(scopedKey: string | null): void {
  if (scopedKey === null) return;
  cache.delete(scopedKey);
  localStorageRemove(scopedKey);
  void removeScopedOnServer(scopedKey).catch((err) => {
    // eslint-disable-next-line no-console
    console.warn(
      `[scopedStorage] failed to DELETE scoped doc ${scopedKey}:`,
      err,
    );
  });
}

// Decompose a scoped key back into (orgId, [wiId,] baseKey) so
// the right server endpoint can be addressed. We can't infer
// "scoping arity" from the key alone — `<orgId>:<baseKey>` and
// `<orgId>:<wiId>:<baseKey>` look structurally identical when the
// middle segment also matches the `wi-…` regex. We therefore
// inspect the segment shape: a `wi-…` middle segment routes to
// the work-item endpoint, anything else is treated as an
// org-scoped baseKey-with-colons (which we forbid elsewhere via
// the storageKeyUtils `:`-rejection).

const WI_ID_RE = /^wi-[a-z0-9]+$/;
const ORG_ID_RE = /^org-[a-z0-9]+$/;

function decomposeScopedKey(scopedKey: string): {
  orgId: string;
  workItemId: string | null;
  baseKey: string;
} | null {
  const parts = scopedKey.split(":");
  if (parts.length < 2) return null;
  const orgId = parts[0]!;
  if (!ORG_ID_RE.test(orgId)) return null;
  if (parts.length === 2) {
    return { orgId, workItemId: null, baseKey: parts[1]! };
  }
  // 3+ segments: middle is wi if shaped like `wi-…`.
  const second = parts[1]!;
  if (WI_ID_RE.test(second)) {
    const baseKey = parts.slice(2).join(":");
    return { orgId, workItemId: second, baseKey };
  }
  // Fall back to org-scope with ":" preserved in baseKey. Should
  // not happen given storageKeyUtils' validation but defensive.
  const baseKey = parts.slice(1).join(":");
  return { orgId, workItemId: null, baseKey };
}

async function writeScopedToServer(
  scopedKey: string,
  value: string,
): Promise<void> {
  const decomp = decomposeScopedKey(scopedKey);
  if (!decomp) return;
  if (!ORG_ID_RE.test(decomp.orgId)) return;
  if (decomp.workItemId === null) {
    await apiPutOrgScoped(decomp.orgId, decomp.baseKey, value);
  } else {
    if (!WI_ID_RE.test(decomp.workItemId)) return;
    await apiPutWorkItemScoped(
      decomp.orgId,
      decomp.workItemId,
      decomp.baseKey,
      value,
    );
  }
}

async function removeScopedOnServer(scopedKey: string): Promise<void> {
  const decomp = decomposeScopedKey(scopedKey);
  if (!decomp) return;
  if (!ORG_ID_RE.test(decomp.orgId)) return;
  if (decomp.workItemId === null) {
    await apiDeleteOrgScoped(decomp.orgId, decomp.baseKey);
  } else {
    if (!WI_ID_RE.test(decomp.workItemId)) return;
    await apiDeleteWorkItemScoped(
      decomp.orgId,
      decomp.workItemId,
      decomp.baseKey,
    );
  }
}

/**
 * Asks the server for every document under the supplied scope
 * and reconciles the cache (L1) and L2 fallback with the result.
 * Subscribers receive a notification keyed on the scope prefix
 * so they can re-render.
 */
export async function hydrateScope(
  orgId: string,
  workItemId?: string | null,
): Promise<void> {
  if (!orgId) return;
  if (!ORG_ID_RE.test(orgId)) return;
  if (workItemId !== undefined && workItemId !== null) {
    if (!WI_ID_RE.test(workItemId)) return;
    const docs = await apiListWorkItemScoped(orgId, workItemId);
    const prefix = `${orgId}:${workItemId}:`;
    const expected = new Set<string>();
    for (const [baseKey, value] of Object.entries(docs)) {
      const k = getScopedKey(baseKey, orgId, workItemId);
      expected.add(k);
      cache.set(k, value);
      localStorageSet(k, value);
    }
    // Remove any L1/L2 keys under this scope that the server did
    // not return. Without this, a doc deleted on another device
    // would resurrect from the local cache after hydration.
    // The wi-scope prefix is `<org>:<wi>:` — we must NOT touch
    // org-scope keys (`<org>:<baseKey>` with no wi segment), so
    // we filter on the second segment matching `wi-…`.
    pruneLocalKeysOutsideExpected(prefix, expected, /* wiScope */ true);
    hydratedScopes.add(prefix);
    notifyHydration(prefix);
  } else {
    const docs = await apiListOrgScoped(orgId);
    const prefix = `${orgId}:`;
    const expected = new Set<string>();
    for (const [baseKey, value] of Object.entries(docs)) {
      const k = getScopedKey(baseKey, orgId);
      expected.add(k);
      cache.set(k, value);
      localStorageSet(k, value);
    }
    // Org-scope reconcile: the prefix `<org>:` matches every
    // `<org>:<baseKey>` AND every `<org>:<wi>:<baseKey>`. We must
    // only prune org-scope keys (no wi segment), otherwise we
    // would wipe wi-scope state every time the org-bag refreshes.
    pruneLocalKeysOutsideExpected(prefix, expected, /* wiScope */ false);
    hydratedScopes.add(prefix);
    notifyHydration(prefix);
  }
}

// Removes every L1+L2 entry under `prefix` that is not present in
// `expected`. `wiScope === true` means only purge keys with a
// `wi-…` second segment; `wiScope === false` means only purge keys
// with NO wi segment. Used by `hydrateScope` to keep the local
// cache in lock-step with the server response.
function pruneLocalKeysOutsideExpected(
  prefix: string,
  expected: ReadonlySet<string>,
  wiScope: boolean,
): void {
  const matchesScope = (key: string): boolean => {
    if (!key.startsWith(prefix)) return false;
    if (wiScope) {
      // For wi-scope, `prefix` is already `<orgId>:<wiId>:`, so any key
      // starting with it is unambiguously a wi-scoped doc for this
      // work item. No further segment filtering needed.
      return true;
    }
    // For org-scope, `prefix` is `<orgId>:`. We must NOT touch keys
    // whose first tail segment is a wi-id (those belong to wi-scope
    // and have their own hydration pass).
    const tail = key.slice(prefix.length);
    const firstSeg = tail.split(":")[0] ?? "";
    return !WI_ID_RE.test(firstSeg);
  };
  // L1 cache.
  for (const k of Array.from(cache.keys())) {
    if (matchesScope(k) && !expected.has(k)) {
      cache.delete(k);
    }
  }
  // L2 localStorage.
  if (isBrowser()) {
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k !== null && matchesScope(k) && !expected.has(k)) {
        toRemove.push(k);
      }
    }
    for (const k of toRemove) localStorageRemove(k);
  }
}

/**
 * Has the supplied scope been hydrated from the server in this
 * session?
 */
export function isScopeHydrated(
  orgId: string,
  workItemId?: string | null,
): boolean {
  if (!orgId) return false;
  if (workItemId) return hydratedScopes.has(`${orgId}:${workItemId}:`);
  return hydratedScopes.has(`${orgId}:`);
}

/**
 * Clear every cached entry (both L1 and L2) under a scope. Used
 * when an org or work-item is deleted on the client side so the
 * stores are not haunted by stale cache reads.
 */
export function clearScope(
  orgId: string,
  workItemId?: string | null,
): void {
  if (!orgId) return;
  const prefix =
    workItemId !== undefined && workItemId !== null
      ? `${orgId}:${workItemId}:`
      : `${orgId}:`;
  for (const key of Array.from(cache.keys())) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
  if (isBrowser()) {
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k !== null && k.startsWith(prefix)) toRemove.push(k);
    }
    for (const k of toRemove) localStorageRemove(k);
  }
  if (workItemId === undefined || workItemId === null) {
    hydratedScopes.delete(`${orgId}:`);
    // Drop every wi-prefixed scope under this org as well.
    for (const k of Array.from(hydratedScopes)) {
      if (k.startsWith(`${orgId}:`)) hydratedScopes.delete(k);
    }
  } else {
    hydratedScopes.delete(prefix);
  }
}

/**
 * Auto-hydrate whenever the active scope changes. Call this once
 * during app boot. Hydration is best-effort: a network failure
 * keeps the L1/L2 fallback intact and surfaces a console warning.
 */
let autoHydrateInstalled = false;
export function installScopeAutoHydration(): void {
  if (autoHydrateInstalled) return;
  autoHydrateInstalled = true;
  const trigger = () => {
    const { orgId, workItemId } = currentScope.get();
    if (!orgId) return;
    if (workItemId) {
      // Hydrate both org-scope and wi-scope so org-only stores
      // (module catalog, OUs) and wi-scope stores both pick up
      // server state.
      void Promise.all([
        isScopeHydrated(orgId)
          ? Promise.resolve()
          : hydrateScope(orgId).catch((err) => {
              // eslint-disable-next-line no-console
              console.warn(
                `[scopedStorage] org-scope hydration failed for ${orgId}:`,
                err,
              );
            }),
        isScopeHydrated(orgId, workItemId)
          ? Promise.resolve()
          : hydrateScope(orgId, workItemId).catch((err) => {
              // eslint-disable-next-line no-console
              console.warn(
                `[scopedStorage] wi-scope hydration failed for ${orgId}/${workItemId}:`,
                err,
              );
            }),
      ]);
    } else {
      if (isScopeHydrated(orgId)) return;
      void hydrateScope(orgId).catch((err) => {
        // eslint-disable-next-line no-console
        console.warn(
          `[scopedStorage] org-scope hydration failed for ${orgId}:`,
          err,
        );
      });
    }
  };
  currentScope.subscribe(trigger);
  // Fire once for the initial scope (if already set).
  trigger();
}

// ---- test hooks -----------------------------------------------------------

export function __resetScopedStorageForTest(): void {
  cache.clear();
  hydratedScopes.clear();
}
