// EAStudio Path B Phase 3 — Organisational Unit (OU) registry.
//
// Persists a small, additive registry of named units that nodes
// can be tagged with via `AcwNode.organisationalUnitId`. The unit
// list is *visual metadata* only — the v1 ACW grammar has no
// opinion about it; the optional node field is the single point of
// coupling between the registry and the workspace document.
//
// Constitutional discipline:
//   - Separate localStorage key (`acw.organisational-units.v1`) and
//     a separate schema version (`ou-1.0`). The OU document never
//     mixes with the `acw-1.0` workspace or the `acw-view-1.0`
//     view-state.
//   - Strict allow-list / read-validate / freeze pattern, mirroring
//     `acwStore.ts` and `acwViewState.ts`.
//   - Cascade on removal: when an OU is deleted, every node whose
//     `organisationalUnitId` references it has the field cleared
//     through the validator-gated `updateNodeProperties` mutation.
//     The acwStore call is the only outbound dependency, and it is
//     itself within the `@/acw/*` allowlist boundary so the
//     isolation invariant is unaffected.
import {
  getWorkspace,
  updateNodeProperties,
} from "../acwStore";

export const OU_SCHEMA_VERSION = "ou-1.0" as const;
const STORAGE_KEY = "acw.organisational-units.v1";

export interface OrganisationalUnit {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly parentId?: string;
}

export interface OrganisationalUnitDocument {
  readonly schemaVersion: typeof OU_SCHEMA_VERSION;
  readonly units: readonly OrganisationalUnit[];
}

const ALLOWED_TOP = ["schemaVersion", "units"] as const;
const ALLOWED_UNIT = ["id", "name", "description", "parentId"] as const;

function assertAllowedKeys(
  obj: Record<string, unknown>,
  allowed: readonly string[],
  context: string,
): void {
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) {
      throw new Error(
        `OU document ${context} contains forbidden field "${k}". Permitted fields: ${allowed.join(", ")}.`,
      );
    }
  }
}

function assertValid(raw: unknown): asserts raw is OrganisationalUnitDocument {
  if (raw === null || typeof raw !== "object") {
    throw new Error("OU document must be an object.");
  }
  const r = raw as Record<string, unknown>;
  assertAllowedKeys(r, ALLOWED_TOP, "document");
  if (r.schemaVersion !== OU_SCHEMA_VERSION) {
    throw new Error(
      `OU document schemaVersion must be "${OU_SCHEMA_VERSION}". Got: ${JSON.stringify(r.schemaVersion)}.`,
    );
  }
  if (!Array.isArray(r.units)) {
    throw new Error("OU document units must be an array.");
  }
  const ids = new Set<string>();
  for (const u of r.units) {
    if (u === null || typeof u !== "object") {
      throw new Error("OU unit must be an object.");
    }
    const unit = u as Record<string, unknown>;
    assertAllowedKeys(unit, ALLOWED_UNIT, "unit");
    if (typeof unit.id !== "string" || unit.id.length === 0) {
      throw new Error("OU unit.id must be a non-empty string.");
    }
    if (ids.has(unit.id)) {
      throw new Error(`OU unit.id "${unit.id}" is duplicated.`);
    }
    ids.add(unit.id);
    if (typeof unit.name !== "string" || unit.name.length === 0) {
      throw new Error("OU unit.name must be a non-empty string.");
    }
    if (unit.description !== undefined) {
      if (typeof unit.description !== "string" || unit.description.length === 0) {
        throw new Error(
          "OU unit.description, when present, must be a non-empty string.",
        );
      }
    }
    if (unit.parentId !== undefined) {
      if (typeof unit.parentId !== "string" || unit.parentId.length === 0) {
        throw new Error(
          "OU unit.parentId, when present, must be a non-empty string.",
        );
      }
    }
  }
  for (const u of r.units as readonly OrganisationalUnit[]) {
    if (u.parentId !== undefined && !ids.has(u.parentId)) {
      throw new Error(
        `OU unit "${u.id}" references unknown parentId "${u.parentId}".`,
      );
    }
  }
}

function isValid(raw: unknown): raw is OrganisationalUnitDocument {
  try {
    assertValid(raw);
    return true;
  } catch {
    return false;
  }
}

function emptyDocument(): OrganisationalUnitDocument {
  return Object.freeze({
    schemaVersion: OU_SCHEMA_VERSION,
    units: Object.freeze([] as readonly OrganisationalUnit[]),
  });
}

let cache: OrganisationalUnitDocument | null = null;
const subscribers = new Set<() => void>();

function notify(): void {
  for (const fn of subscribers) {
    try {
      fn();
    } catch {
      // intentional no-op: render-hook subscribers must not escalate.
    }
  }
}

function readFromStorage(): OrganisationalUnitDocument {
  if (typeof window === "undefined") return emptyDocument();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyDocument();
    const parsed = JSON.parse(raw);
    if (!isValid(parsed)) return emptyDocument();
    return parsed;
  } catch {
    return emptyDocument();
  }
}

function writeToStorage(doc: OrganisationalUnitDocument): void {
  assertValid(doc);
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
}

function freshOuId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `ou-${crypto.randomUUID()}`;
  }
  return `ou-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrganisationalUnits(): readonly OrganisationalUnit[] {
  if (cache === null) cache = readFromStorage();
  return cache.units;
}

export function listOus(): readonly OrganisationalUnit[] {
  return getOrganisationalUnits();
}

export function getOu(id: string): OrganisationalUnit | undefined {
  return getOrganisationalUnits().find((u) => u.id === id);
}

export function subscribeOus(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

export type OuResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly reason: string };

export interface CreateOuRequest {
  readonly name: string;
  readonly description?: string;
  readonly parentId?: string;
  readonly id?: string;
}

export function createOu(req: CreateOuRequest): OuResult {
  if (typeof req.name !== "string" || req.name.length === 0) {
    return { ok: false, reason: "Unit name must be a non-empty string." };
  }
  if (req.description !== undefined) {
    if (typeof req.description !== "string" || req.description.length === 0) {
      return {
        ok: false,
        reason: "Unit description, when supplied, must be a non-empty string.",
      };
    }
  }
  if (cache === null) cache = readFromStorage();
  if (req.parentId !== undefined) {
    if (typeof req.parentId !== "string" || req.parentId.length === 0) {
      return {
        ok: false,
        reason: "Unit parentId, when supplied, must be a non-empty string.",
      };
    }
    if (!cache.units.some((u) => u.id === req.parentId)) {
      return {
        ok: false,
        reason: `Unit parentId "${req.parentId}" is not a known unit.`,
      };
    }
  }
  if (req.id !== undefined) {
    if (typeof req.id !== "string" || req.id.length === 0) {
      return {
        ok: false,
        reason: "Unit id, when supplied, must be a non-empty string.",
      };
    }
    const existing = cache.units.find((u) => u.id === req.id);
    if (existing !== undefined) {
      return { ok: true, id: existing.id };
    }
  }
  const id = req.id ?? freshOuId();
  const unit: OrganisationalUnit = Object.freeze({
    id,
    name: req.name,
    ...(req.description !== undefined ? { description: req.description } : {}),
    ...(req.parentId !== undefined ? { parentId: req.parentId } : {}),
  });
  const next: OrganisationalUnitDocument = Object.freeze({
    schemaVersion: OU_SCHEMA_VERSION,
    units: Object.freeze([...cache.units, unit]),
  });
  writeToStorage(next);
  cache = next;
  notify();
  return { ok: true, id };
}

export type OuMutationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

export function updateOuName(id: string, name: string): OuMutationResult {
  if (typeof name !== "string" || name.length === 0) {
    return { ok: false, reason: "Unit name must be a non-empty string." };
  }
  if (cache === null) cache = readFromStorage();
  const idx = cache.units.findIndex((u) => u.id === id);
  if (idx === -1) {
    return { ok: false, reason: "The unit referenced does not exist." };
  }
  const prev = cache.units[idx];
  if (prev.name === name) return { ok: true };
  const updated: OrganisationalUnit = Object.freeze({ ...prev, name });
  const units = cache.units.slice();
  units[idx] = updated;
  const next: OrganisationalUnitDocument = Object.freeze({
    schemaVersion: OU_SCHEMA_VERSION,
    units: Object.freeze(units),
  });
  writeToStorage(next);
  cache = next;
  notify();
  return { ok: true };
}

// Removes a unit and cascades the clear into every workspace node
// that references it, plus every other unit that listed it as a
// parent. Cascading parentId reassigns to undefined (the removed
// node's children become roots) so the registry never points at a
// missing parent. Node clears go through `updateNodeProperties`,
// which is the validator-gated mutation that already accepts
// `organisationalUnitId: null` to clear the field.
//
// Transactional contract: the cascade runs FIRST. If any node
// clear is refused (the validator-gated `updateNodeProperties`
// returns `{ ok: false }`), the OU document is NOT mutated and
// `removeOu` itself returns `{ ok: false, reason }`, surfacing the
// validator's verbatim refusal. This guarantees we never leave a
// node carrying a dangling OU id pointing at a removed unit.
//
// Sealed domain containers (`isDomainContainer === true`) cannot
// carry an `organisationalUnitId` at all — the ACW read-validator
// refuses that combination at the storage boundary — so the
// cascade does not need a sealed-node branch: any node found
// carrying the target id is provably non-sealed and therefore
// `updateNodeProperties` will accept the clear.
export function removeOu(id: string): OuMutationResult {
  if (cache === null) cache = readFromStorage();
  const idx = cache.units.findIndex((u) => u.id === id);
  if (idx === -1) {
    return { ok: false, reason: "The unit referenced does not exist." };
  }
  // Phase 1: cascade-clear node bindings FIRST. If any clear is
  // refused, abort without touching the OU document so the unit
  // remains, the dangling-binding hazard never materialises, and
  // the caller sees the validator's verbatim refusal reason.
  const ws = getWorkspace();
  for (const node of ws.structureGraph.nodes) {
    if (node.organisationalUnitId !== id) continue;
    const cleared = updateNodeProperties(node.id, {
      organisationalUnitId: null,
    });
    if (!cleared.ok) {
      return {
        ok: false,
        reason: cleared.reason,
      };
    }
  }
  // Phase 2: cascade succeeded — now write the new OU document.
  const remaining = cache.units
    .filter((u) => u.id !== id)
    .map((u) => {
      if (u.parentId === id) {
        const { parentId: _drop, ...rest } = u;
        void _drop;
        return Object.freeze({ ...rest });
      }
      return u;
    });
  const next: OrganisationalUnitDocument = Object.freeze({
    schemaVersion: OU_SCHEMA_VERSION,
    units: Object.freeze(remaining),
  });
  writeToStorage(next);
  cache = next;
  notify();
  return { ok: true };
}

export function clearOus(): void {
  const next = emptyDocument();
  writeToStorage(next);
  cache = next;
  notify();
}

export const __ouStoreInternals = Object.freeze({
  isValid,
  assertValid,
  emptyDocument,
  reloadFromStorageForTest(): void {
    cache = null;
    notify();
  },
});
