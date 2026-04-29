// Multi-tenant storage-key scoping utility.
//
// Phase 2 (SaaS Onboarding) introduces Organisation + Work-Item
// scoping above every persisted ADC/CTAD/ACW store. Every store
// that previously wrote to a flat localStorage key (e.g.
// `adc.portfolio.v1`, `ctad.state.v1`, `acw.workspace.v1`) now
// resolves its effective key through this module:
//
//   - Org + Work-Item scope: `<orgId>:<workItemId>:<baseKey>`
//   - Org-only scope:        `<orgId>:<baseKey>`
//
// Two access shapes are provided so React and plain-TS modules
// share a single source of truth:
//
//   1. `getScopedKey(baseKey, orgId, workItemId?)` — pure helper.
//      Used by invariants and by code paths that already have the
//      ids in hand.
//
//   2. `currentScope.{orgId, workItemId}` getter/setter — mutable
//      module-level state mirrored from the React
//      `CurrentOrgWorkItemContext` provider. Plain-TS stores read
//      it inside their `getKey()` accessor at every call so they
//      never need to import a React hook to know the active scope.
//      The provider writes through to localStorage so the same
//      values survive a hard refresh.
//
// `getScopedKey` is the only blessed shape — composing the key by
// hand from outside this module is forbidden and would break the
// migration / invariants.

const SCOPE_SEPARATOR = ":" as const;

export interface CurrentScope {
  readonly orgId: string | null;
  readonly workItemId: string | null;
}

let _currentScope: CurrentScope = Object.freeze({
  orgId: null,
  workItemId: null,
});

const scopeListeners = new Set<() => void>();
let scopeVersion = 0;

export const currentScope = {
  get(): CurrentScope {
    return _currentScope;
  },
  set(next: { orgId: string | null; workItemId: string | null }): void {
    const orgId = typeof next.orgId === "string" && next.orgId.length > 0
      ? next.orgId
      : null;
    const workItemId =
      typeof next.workItemId === "string" && next.workItemId.length > 0
        ? next.workItemId
        : null;
    if (orgId === _currentScope.orgId && workItemId === _currentScope.workItemId) {
      return;
    }
    _currentScope = Object.freeze({ orgId, workItemId });
    scopeVersion += 1;
    for (const l of scopeListeners) l();
  },
  subscribe(listener: () => void): () => void {
    scopeListeners.add(listener);
    return () => scopeListeners.delete(listener);
  },
  version(): number {
    return scopeVersion;
  },
};

function isValidIdSegment(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !value.includes(SCOPE_SEPARATOR)
  );
}

/**
 * Compose a scoped storage key. Throws on a missing or malformed
 * segment so that a store can never silently fall back to writing
 * under a flat key when the active scope is not yet set.
 *
 *   getScopedKey("adc.portfolio.v1", "org-abc", "wi-xyz")
 *     => "org-abc:wi-xyz:adc.portfolio.v1"
 *
 *   getScopedKey("adc.module-catalog.v1", "org-abc")
 *     => "org-abc:adc.module-catalog.v1"
 */
export function getScopedKey(
  baseKey: string,
  orgId: string | null,
  workItemId?: string | null,
): string {
  if (typeof baseKey !== "string" || baseKey.length === 0) {
    throw new Error(
      `storageKeyUtils.getScopedKey: baseKey must be a non-empty string (got "${String(baseKey)}").`,
    );
  }
  if (!isValidIdSegment(orgId)) {
    throw new Error(
      `storageKeyUtils.getScopedKey: orgId must be a non-empty string with no "${SCOPE_SEPARATOR}" character (got "${String(orgId)}").`,
    );
  }
  if (workItemId === undefined || workItemId === null) {
    return `${orgId}${SCOPE_SEPARATOR}${baseKey}`;
  }
  if (!isValidIdSegment(workItemId)) {
    throw new Error(
      `storageKeyUtils.getScopedKey: workItemId must be a non-empty string with no "${SCOPE_SEPARATOR}" character (got "${String(workItemId)}").`,
    );
  }
  return `${orgId}${SCOPE_SEPARATOR}${workItemId}${SCOPE_SEPARATOR}${baseKey}`;
}

/**
 * Resolve the active scoped key for a base key. Returns `null` when
 * the active scope is not sufficient (e.g. a Work-Item-scoped store
 * is asked for its key while only an Org is set). Stores must
 * gracefully treat a `null` return as "no active document yet" and
 * return their empty representation rather than reading or writing
 * to localStorage.
 */
export function resolveActiveKey(
  baseKey: string,
  needsWorkItem: boolean,
): string | null {
  const { orgId, workItemId } = _currentScope;
  if (!orgId) return null;
  if (needsWorkItem) {
    if (!workItemId) return null;
    return getScopedKey(baseKey, orgId, workItemId);
  }
  return getScopedKey(baseKey, orgId);
}

// Exposed for invariants only. Does NOT notify listeners. Tests
// must restore the original snapshot via `__restoreScopeSnapshot`.
export function __snapshotScope(): CurrentScope {
  return _currentScope;
}

export function __restoreScopeSnapshot(snap: CurrentScope): void {
  _currentScope = Object.freeze({
    orgId: snap.orgId ?? null,
    workItemId: snap.workItemId ?? null,
  });
  scopeVersion += 1;
  for (const l of scopeListeners) l();
}
