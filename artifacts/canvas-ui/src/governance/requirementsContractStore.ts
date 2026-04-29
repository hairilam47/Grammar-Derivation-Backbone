// Requirements Contract store — `adc.requirements-contracts.v1`.
//
// Stage A (ADC Wizard Retrofit). Owns a single localStorage document
// holding frozen Requirements Contracts. A contract is a snapshot of
// a set of approved requirements taken at the moment the architect
// chose to "Freeze Requirements". The contract carries:
//   - a stable contract id,
//   - the workItemId the contract belongs to,
//   - a copy of every captured requirement at freeze time,
//   - `frozenAt` (ISO timestamp), `frozenBy` (user id),
//   - a small `summary` block (`{ total, byType, byModule }`).
//
// Architectural constraints:
//   - Top-level allow-list. Persisted document carries exactly
//     `{ schemaVersion, contracts }`. Unknown keys at any level are
//     refused on read.
//   - Schema-version locked at `rc-1.0`.
//   - Frozen requirements are immutable. The contract carries a
//     full deep copy taken at freeze time so future mutation of the
//     requirements store cannot leak back into a contract.
//   - `freezeContract` is idempotent. Re-freezing the SAME set
//     (same requirement ids, same titles, same urgency, same module
//     binding, same hardware) returns the existing contract id and
//     never re-marks a requirement frozen a second time.
//   - The store calls `freezeRequirements` from `requirementsStore`
//     so the source-of-truth status is updated atomically with the
//     contract creation.

import {
  freezeRequirements,
  getRequirement,
  isValidRequirement,
  type Requirement,
} from "./requirementsStore";

const STORAGE_KEY = "adc.requirements-contracts.v1";
export const REQUIREMENTS_CONTRACT_SCHEMA_VERSION = "rc-1.0" as const;

const CONTRACT_ID_RE = /^rc-[0-9a-f]{12}$/;

export interface RequirementsContractSummary {
  readonly total: number;
  readonly byType: Readonly<Record<string, number>>;
  readonly byModule: Readonly<Record<string, number>>;
}

export interface RequirementsContract {
  readonly contractId: string;
  readonly workItemId: string;
  readonly frozenAt: string;
  readonly frozenBy: string;
  readonly requirements: readonly Requirement[];
  readonly summary: RequirementsContractSummary;
}

interface ContractDoc {
  readonly schemaVersion: typeof REQUIREMENTS_CONTRACT_SCHEMA_VERSION;
  readonly contracts: Readonly<Record<string, RequirementsContract>>;
}

const EMPTY_DOC: ContractDoc = Object.freeze({
  schemaVersion: REQUIREMENTS_CONTRACT_SCHEMA_VERSION,
  contracts: Object.freeze({}),
});

const ALLOWED_TOP_LEVEL_KEYS = new Set(["schemaVersion", "contracts"]);
const ALLOWED_CONTRACT_KEYS = new Set([
  "contractId",
  "workItemId",
  "frozenAt",
  "frozenBy",
  "requirements",
  "summary",
]);
const ALLOWED_SUMMARY_KEYS = new Set(["total", "byType", "byModule"]);

function isValidContractId(id: unknown): id is string {
  return typeof id === "string" && CONTRACT_ID_RE.test(id);
}

function isValidSummary(value: unknown): value is RequirementsContractSummary {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  for (const k of Object.keys(v)) {
    if (!ALLOWED_SUMMARY_KEYS.has(k)) return false;
  }
  if (typeof v.total !== "number" || !Number.isFinite(v.total) || v.total < 0) {
    return false;
  }
  if (!v.byType || typeof v.byType !== "object") return false;
  if (!v.byModule || typeof v.byModule !== "object") return false;
  for (const n of Object.values(v.byType as Record<string, unknown>)) {
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return false;
  }
  for (const n of Object.values(v.byModule as Record<string, unknown>)) {
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return false;
  }
  return true;
}

function isValidContract(value: unknown): value is RequirementsContract {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  for (const k of Object.keys(v)) {
    if (!ALLOWED_CONTRACT_KEYS.has(k)) return false;
  }
  if (!isValidContractId(v.contractId)) return false;
  if (typeof v.workItemId !== "string" || v.workItemId.length === 0) return false;
  if (typeof v.frozenAt !== "string" || v.frozenAt.length === 0) return false;
  if (typeof v.frozenBy !== "string" || v.frozenBy.length === 0) return false;
  if (!Array.isArray(v.requirements)) return false;
  for (const r of v.requirements) {
    if (!isValidRequirement(r)) return false;
  }
  if (!isValidSummary(v.summary)) return false;
  return true;
}

function readDoc(): ContractDoc {
  if (typeof window === "undefined" || !window.localStorage) return EMPTY_DOC;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_DOC;
    const parsed = JSON.parse(raw) as Partial<ContractDoc> & Record<string, unknown>;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.schemaVersion !== REQUIREMENTS_CONTRACT_SCHEMA_VERSION ||
      typeof parsed.contracts !== "object" ||
      parsed.contracts === null
    ) {
      return EMPTY_DOC;
    }
    for (const k of Object.keys(parsed)) {
      if (!ALLOWED_TOP_LEVEL_KEYS.has(k)) return EMPTY_DOC;
    }
    const cleaned: Record<string, RequirementsContract> = {};
    for (const [key, val] of Object.entries(parsed.contracts)) {
      if (key !== (val as RequirementsContract | undefined)?.contractId) continue;
      if (!isValidContract(val)) continue;
      cleaned[key] = val;
    }
    return {
      schemaVersion: REQUIREMENTS_CONTRACT_SCHEMA_VERSION,
      contracts: cleaned,
    };
  } catch {
    return EMPTY_DOC;
  }
}

function writeDoc(doc: ContractDoc): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
  bumpVersion();
}

let storeVersion = 0;
const listeners = new Set<() => void>();
function bumpVersion(): void {
  storeVersion += 1;
  for (const l of listeners) l();
}
export function getStoreVersion(): number {
  return storeVersion;
}
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function generateContractId(): string {
  const bytes = new Uint8Array(6);
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.getRandomValues === "function"
  ) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let hex = "";
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return `rc-${hex}`;
}

// Determine whether two requirement sets are "the same set" for the
// purposes of idempotent freeze. Equality is keyed on the stable
// fields that define the contract's contents; volatile fields (like
// status — which differs because freezeContract flips approved → frozen
// — are intentionally excluded).
function snapshotKey(r: Requirement): string {
  return JSON.stringify({
    id: r.id,
    title: r.title,
    type: r.type,
    urgency: r.urgency,
    moduleId: r.moduleId,
    hardware: r.hardwareDetails
      ? {
          itemName: r.hardwareDetails.itemName,
          model: r.hardwareDetails.model,
          quantity: r.hardwareDetails.quantity,
          unitCostEstimate: r.hardwareDetails.unitCostEstimate,
        }
      : null,
  });
}

function setKey(rs: readonly Requirement[]): string {
  return rs.map(snapshotKey).slice().sort().join("|");
}

function summarise(reqs: readonly Requirement[]): RequirementsContractSummary {
  const byType: Record<string, number> = {};
  const byModule: Record<string, number> = {};
  for (const r of reqs) {
    byType[r.type] = (byType[r.type] ?? 0) + 1;
    const mk = r.moduleId ?? "(none)";
    byModule[mk] = (byModule[mk] ?? 0) + 1;
  }
  return Object.freeze({
    total: reqs.length,
    byType: Object.freeze({ ...byType }),
    byModule: Object.freeze({ ...byModule }),
  });
}

function deepFreezeRequirementCopy(r: Requirement): Requirement {
  return Object.freeze({
    id: r.id,
    workItemId: r.workItemId,
    title: r.title,
    description: r.description,
    type: r.type,
    urgency: r.urgency,
    moduleId: r.moduleId,
    hardwareDetails: r.hardwareDetails
      ? Object.freeze({ ...r.hardwareDetails })
      : null,
    status: r.status,
  });
}

// Freeze a contract.
//
// Inputs: the live (approved) requirements the architect wants to
// commit, plus the user id capturing the action.
// Behaviour:
//   1. Reject empty input — a contract requires at least one
//      approved requirement.
//   2. Reject any non-approved requirement (the requirements-store
//      `freezeRequirements` call enforces this too, but we double-
//      check up front for a clearer error).
//   3. If the SAME stable set was already frozen as a contract, return
//      that existing contract id and DO NOT call `freezeRequirements`
//      again — idempotent.
//   4. Otherwise, mark each requirement frozen via the requirements
//      store (atomic with the write below) and persist the contract.
export function freezeContract(
  workItemId: string,
  requirements: readonly Requirement[],
  frozenBy: string,
): RequirementsContract {
  if (typeof workItemId !== "string" || workItemId.length === 0) {
    throw new Error(
      "requirementsContractStore: workItemId must be a non-empty string.",
    );
  }
  if (typeof frozenBy !== "string" || frozenBy.length === 0) {
    throw new Error(
      "requirementsContractStore: frozenBy must be a non-empty string.",
    );
  }
  if (!Array.isArray(requirements) || requirements.length === 0) {
    throw new Error(
      "requirementsContractStore: a contract requires at least one approved requirement.",
    );
  }
  for (const r of requirements) {
    if (r.workItemId !== workItemId) {
      throw new Error(
        `requirementsContractStore: requirement "${r.id}" belongs to a different work item.`,
      );
    }
    if (r.status !== "approved" && r.status !== "frozen") {
      throw new Error(
        `requirementsContractStore: requirement "${r.id}" is not approved (status=${r.status}).`,
      );
    }
  }

  const doc = readDoc();
  const incomingKey = setKey(requirements);
  for (const c of Object.values(doc.contracts)) {
    if (c.workItemId !== workItemId) continue;
    if (setKey(c.requirements) === incomingKey) {
      return c;
    }
  }

  // Mark approved requirements frozen via the requirements store (no-op
  // for those already frozen). This is the single point that flips
  // approved → frozen so the source-of-truth stays consistent.
  const idsToFreeze = requirements
    .filter((r) => r.status === "approved")
    .map((r) => r.id);
  if (idsToFreeze.length > 0) {
    freezeRequirements(idsToFreeze);
  }

  // Re-read the requirements after the freeze flip so the snapshot
  // we persist carries the post-freeze status.
  const snapshot = requirements.map((r) => {
    const live = getRequirement(r.id);
    return deepFreezeRequirementCopy(live ?? r);
  });

  const contract: RequirementsContract = Object.freeze({
    contractId: generateContractId(),
    workItemId,
    frozenAt: new Date().toISOString(),
    frozenBy,
    requirements: Object.freeze(snapshot),
    summary: summarise(snapshot),
  });

  writeDoc({
    schemaVersion: REQUIREMENTS_CONTRACT_SCHEMA_VERSION,
    contracts: { ...doc.contracts, [contract.contractId]: contract },
  });
  return contract;
}

export function getContract(contractId: string): RequirementsContract | null {
  if (!isValidContractId(contractId)) return null;
  const doc = readDoc();
  return doc.contracts[contractId] ?? null;
}

export function listContracts(workItemId?: string): readonly RequirementsContract[] {
  const doc = readDoc();
  let values = Object.values(doc.contracts);
  if (workItemId !== undefined) {
    values = values.filter((c) => c.workItemId === workItemId);
  }
  return values.sort((a, b) =>
    a.frozenAt < b.frozenAt ? -1 : a.frozenAt > b.frozenAt ? 1 : 0,
  );
}
