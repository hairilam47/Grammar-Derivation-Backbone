// React provider for the active Organisation + Work-Item scope.
//
// Phase 2 (SaaS Onboarding) — single source of truth for the
// active Organisation id and (optional) Work-Item id. The provider
// hydrates from `localStorage` on mount, mirrors every change into
// `storageKeyUtils.currentScope` (which the plain-TS stores read
// inside their `getStorageKey()` accessor), persists the selection
// back to `localStorage`, and runs the one-shot legacy-migration
// handshake the first time both ids are set.
//
// The provider is mounted ABOVE the wouter router in `App.tsx` so
// every route — including the onboarding flow itself — can read
// the current scope.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  currentScope as storageKeyCurrentScope,
  getScopedKey,
  type CurrentScope,
} from "./storageKeyUtils";
import { migrateLegacyFlatKeysIfNeeded } from "./legacyMigration";

const ORG_LS_KEY = "app:currentOrgId";
const WORK_ITEM_LS_KEY = "app:currentWorkItemId";

export interface CurrentScopeContextValue {
  readonly orgId: string | null;
  readonly workItemId: string | null;
  setOrgId(orgId: string | null): void;
  setWorkItemId(workItemId: string | null): void;
  clear(): void;
}

const Ctx = createContext<CurrentScopeContextValue | null>(null);

function readPersistedScope(): CurrentScope {
  if (typeof window === "undefined" || !window.localStorage) {
    return { orgId: null, workItemId: null };
  }
  const orgId = window.localStorage.getItem(ORG_LS_KEY);
  const workItemId = window.localStorage.getItem(WORK_ITEM_LS_KEY);
  return {
    orgId: orgId && orgId.length > 0 ? orgId : null,
    workItemId: workItemId && workItemId.length > 0 ? workItemId : null,
  };
}

function writePersistedScope(scope: CurrentScope): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  if (scope.orgId === null) window.localStorage.removeItem(ORG_LS_KEY);
  else window.localStorage.setItem(ORG_LS_KEY, scope.orgId);
  if (scope.workItemId === null) window.localStorage.removeItem(WORK_ITEM_LS_KEY);
  else window.localStorage.setItem(WORK_ITEM_LS_KEY, scope.workItemId);
}

export function CurrentOrgWorkItemProvider({ children }: { children: ReactNode }) {
  const initial = useRef<CurrentScope | null>(null);
  if (initial.current === null) initial.current = readPersistedScope();
  const [orgId, setOrgIdState] = useState<string | null>(initial.current.orgId);
  const [workItemId, setWorkItemIdState] = useState<string | null>(
    initial.current.workItemId,
  );

  // Mirror into the storage-key utility on EVERY change (including
  // the initial mount) so plain-TS stores observe the active scope
  // without needing to subscribe to React state. The mirror also
  // notifies the store-level `currentScope.subscribe` hooks so
  // every store re-reads its document under the new scope.
  useEffect(() => {
    storageKeyCurrentScope.set({ orgId, workItemId });
    writePersistedScope({ orgId, workItemId });
  }, [orgId, workItemId]);

  // Legacy migration — runs once, the first time both ids are
  // resolved, guarded by an internal sentinel inside the migration
  // module itself.
  useEffect(() => {
    if (orgId !== null && workItemId !== null) {
      try {
        migrateLegacyFlatKeysIfNeeded(orgId, workItemId);
      } catch (e) {
        // Migration failures are non-fatal at runtime — the legacy
        // sentinel is left unset so a later resolve attempt can
        // retry. The error surfaces in the console for diagnosis.
        // eslint-disable-next-line no-console
        console.error("[scope] legacy migration failed:", e);
      }
    }
  }, [orgId, workItemId]);

  const setOrgId = useCallback((next: string | null) => {
    setOrgIdState((prev) => {
      if (prev === next) return prev;
      // Clearing or switching the org also clears the active
      // Work-Item — a Work Item belongs to exactly one Organisation
      // and the previous Work-Item id is meaningless under a new
      // org id.
      setWorkItemIdState(null);
      return next;
    });
  }, []);

  const setWorkItemId = useCallback((next: string | null) => {
    setWorkItemIdState((prev) => (prev === next ? prev : next));
  }, []);

  const clear = useCallback(() => {
    setOrgIdState(null);
    setWorkItemIdState(null);
  }, []);

  const value = useMemo<CurrentScopeContextValue>(
    () => ({ orgId, workItemId, setOrgId, setWorkItemId, clear }),
    [orgId, workItemId, setOrgId, setWorkItemId, clear],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCurrentScope(): CurrentScopeContextValue {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error(
      "useCurrentScope must be called inside <CurrentOrgWorkItemProvider>.",
    );
  }
  return v;
}

/**
 * Resolve the active scoped key for a base key. Returns `null`
 * when the active scope is not sufficient (Work-Item-scoped store
 * with no active Work Item, etc). Components must treat `null` as
 * "no active document yet" and render an onboarding-redirect or
 * empty state rather than reading from localStorage by hand.
 */
export function useScopedStorageKey(
  baseKey: string,
  needsWorkItem: boolean,
): string | null {
  const { orgId, workItemId } = useCurrentScope();
  if (!orgId) return null;
  if (needsWorkItem) {
    if (!workItemId) return null;
    return getScopedKey(baseKey, orgId, workItemId);
  }
  return getScopedKey(baseKey, orgId);
}
