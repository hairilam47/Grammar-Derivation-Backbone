// Requirements store — `adc.requirements.v1`.
//
// Stage A (ADC Wizard Retrofit). Owns a single localStorage document
// holding the user's Requirements — each Requirement carries a stable
// id, a title, an optional description, a type tag (functional /
// non-functional / constraint / hardware), an internal `urgency`
// enum (`'low' | 'medium' | 'high' | 'critical'`), an optional link
// to a Module (via `moduleId`), an optional `hardwareDetails` block
// (mandatory when `type === 'hardware'`), and a workflow status
// (`'draft' | 'approved' | 'frozen'`).
//
// Architectural constraints:
//   - Top-level allow-list. Persisted document carries exactly
//     `{ schemaVersion, requirements }`. Unknown keys at any level
//     are refused on read (returned as the empty document).
//   - Schema-version locked at `req-1.0`.
//   - Internal urgency enum stays `'low' | 'medium' | 'high' |
//     'critical'`. The UI displays Urgency labels (Routine /
//     Standard / Elevated / Acute) — never persist the label string.
//   - Missing `moduleId` forces `status = 'draft'` regardless of
//     caller input. The wizard cannot bypass the draft rule.
//   - `freezeRequirements` rejects any requirement whose status is
//     not `'approved'`. Frozen requirements are immutable; further
//     `saveRequirement` / `deleteRequirement` calls on them throw.
//   - `type === 'hardware'` requires a `hardwareDetails` block with
//     `quantity > 0`. Other types must NOT carry hardwareDetails.

const STORAGE_KEY = "adc.requirements.v1";
export const REQUIREMENTS_SCHEMA_VERSION = "req-1.0" as const;

const REQUIREMENT_ID_RE = /^req-[0-9a-f]{12}$/;

export type RequirementType =
  | "functional"
  | "non-functional"
  | "constraint"
  | "hardware";

export type RequirementUrgency = "low" | "medium" | "high" | "critical";

export type RequirementStatus = "draft" | "approved" | "frozen";

export interface HardwareDetails {
  readonly itemName: string;
  readonly model: string;
  readonly quantity: number;
  readonly unitCostEstimate: number;
  readonly notes: string;
}

export interface Requirement {
  readonly id: string;
  readonly workItemId: string;
  readonly title: string;
  readonly description: string;
  readonly type: RequirementType;
  readonly urgency: RequirementUrgency;
  readonly moduleId: string | null;
  readonly hardwareDetails: HardwareDetails | null;
  readonly status: RequirementStatus;
}

interface RequirementsDoc {
  readonly schemaVersion: typeof REQUIREMENTS_SCHEMA_VERSION;
  readonly requirements: Readonly<Record<string, Requirement>>;
}

const EMPTY_DOC: RequirementsDoc = Object.freeze({
  schemaVersion: REQUIREMENTS_SCHEMA_VERSION,
  requirements: Object.freeze({}),
});

const ALLOWED_TOP_LEVEL_KEYS = new Set(["schemaVersion", "requirements"]);
const ALLOWED_REQUIREMENT_KEYS = new Set([
  "id",
  "workItemId",
  "title",
  "description",
  "type",
  "urgency",
  "moduleId",
  "hardwareDetails",
  "status",
]);
const ALLOWED_HARDWARE_KEYS = new Set([
  "itemName",
  "model",
  "quantity",
  "unitCostEstimate",
  "notes",
]);
const REQUIREMENT_TYPES = new Set<RequirementType>([
  "functional",
  "non-functional",
  "constraint",
  "hardware",
]);
const URGENCY_VALUES = new Set<RequirementUrgency>([
  "low",
  "medium",
  "high",
  "critical",
]);
const STATUS_VALUES = new Set<RequirementStatus>([
  "draft",
  "approved",
  "frozen",
]);

function isValidRequirementId(id: unknown): id is string {
  return typeof id === "string" && REQUIREMENT_ID_RE.test(id);
}

function isValidHardwareDetails(value: unknown): value is HardwareDetails {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  for (const k of Object.keys(v)) {
    if (!ALLOWED_HARDWARE_KEYS.has(k)) return false;
  }
  if (typeof v.itemName !== "string" || v.itemName.length === 0) return false;
  if (typeof v.model !== "string") return false;
  if (typeof v.quantity !== "number" || !Number.isFinite(v.quantity) || v.quantity <= 0) {
    return false;
  }
  if (
    typeof v.unitCostEstimate !== "number" ||
    !Number.isFinite(v.unitCostEstimate) ||
    v.unitCostEstimate < 0
  ) {
    return false;
  }
  if (typeof v.notes !== "string") return false;
  return true;
}

export function isValidRequirement(value: unknown): value is Requirement {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  for (const k of Object.keys(v)) {
    if (!ALLOWED_REQUIREMENT_KEYS.has(k)) return false;
  }
  if (!isValidRequirementId(v.id)) return false;
  if (typeof v.workItemId !== "string" || v.workItemId.length === 0) return false;
  if (typeof v.title !== "string" || v.title.length === 0) return false;
  if (typeof v.description !== "string") return false;
  if (typeof v.type !== "string" || !REQUIREMENT_TYPES.has(v.type as RequirementType)) {
    return false;
  }
  if (
    typeof v.urgency !== "string" ||
    !URGENCY_VALUES.has(v.urgency as RequirementUrgency)
  ) {
    return false;
  }
  if (v.moduleId !== null && (typeof v.moduleId !== "string" || v.moduleId.length === 0)) {
    return false;
  }
  if (v.hardwareDetails !== null && !isValidHardwareDetails(v.hardwareDetails)) {
    return false;
  }
  if (v.type === "hardware" && v.hardwareDetails === null) return false;
  if (v.type !== "hardware" && v.hardwareDetails !== null) return false;
  if (typeof v.status !== "string" || !STATUS_VALUES.has(v.status as RequirementStatus)) {
    return false;
  }
  if (v.moduleId === null && v.status !== "draft" && v.status !== "frozen") {
    // moduleless requirements may only be draft (or frozen if a contract
    // captured them prior to a future migration). Live writes always
    // force draft via assertSaveable; this read-time check prevents a
    // hand-edited localStorage from re-introducing approved-without-module.
    if (v.status === "approved") return false;
  }
  return true;
}

function readDoc(): RequirementsDoc {
  if (typeof window === "undefined" || !window.localStorage) return EMPTY_DOC;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_DOC;
    const parsed = JSON.parse(raw) as Partial<RequirementsDoc> & Record<string, unknown>;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.schemaVersion !== REQUIREMENTS_SCHEMA_VERSION ||
      typeof parsed.requirements !== "object" ||
      parsed.requirements === null
    ) {
      return EMPTY_DOC;
    }
    for (const k of Object.keys(parsed)) {
      if (!ALLOWED_TOP_LEVEL_KEYS.has(k)) return EMPTY_DOC;
    }
    const cleaned: Record<string, Requirement> = {};
    for (const [key, val] of Object.entries(parsed.requirements)) {
      if (key !== (val as Requirement | undefined)?.id) continue;
      if (!isValidRequirement(val)) continue;
      cleaned[key] = val;
    }
    return {
      schemaVersion: REQUIREMENTS_SCHEMA_VERSION,
      requirements: cleaned,
    };
  } catch {
    return EMPTY_DOC;
  }
}

function writeDoc(doc: RequirementsDoc): void {
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

function generateRequirementId(): string {
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
  return `req-${hex}`;
}

export interface SaveRequirementInput {
  readonly id?: string;
  readonly workItemId: string;
  readonly title: string;
  readonly description?: string;
  readonly type: RequirementType;
  readonly urgency: RequirementUrgency;
  readonly moduleId?: string | null;
  readonly hardwareDetails?: HardwareDetails | null;
  readonly status?: RequirementStatus;
}

function freezeHardware(h: HardwareDetails): HardwareDetails {
  return Object.freeze({
    itemName: h.itemName,
    model: h.model,
    quantity: h.quantity,
    unitCostEstimate: h.unitCostEstimate,
    notes: h.notes,
  });
}

// Save (insert or update). Forces draft if no module; rejects
// hardware payloads without a valid hardwareDetails block; rejects
// hardwareDetails on non-hardware requirements; refuses to mutate a
// frozen requirement.
export function saveRequirement(input: SaveRequirementInput): Requirement {
  if (typeof input.workItemId !== "string" || input.workItemId.length === 0) {
    throw new Error("requirementsStore: workItemId must be a non-empty string.");
  }
  if (typeof input.title !== "string" || input.title.trim().length === 0) {
    throw new Error("requirementsStore: title must be a non-empty string.");
  }
  if (!REQUIREMENT_TYPES.has(input.type)) {
    throw new Error(
      `requirementsStore: invalid requirement type "${String(input.type)}".`,
    );
  }
  if (!URGENCY_VALUES.has(input.urgency)) {
    throw new Error(
      `requirementsStore: invalid urgency value "${String(input.urgency)}". ` +
        `Allowed: low | medium | high | critical.`,
    );
  }
  const moduleId = input.moduleId ?? null;
  if (moduleId !== null && (typeof moduleId !== "string" || moduleId.length === 0)) {
    throw new Error(
      `requirementsStore: moduleId must be null or a non-empty string (got "${String(moduleId)}").`,
    );
  }

  let hardwareDetails: HardwareDetails | null = null;
  if (input.type === "hardware") {
    if (!input.hardwareDetails) {
      throw new Error(
        "requirementsStore: hardware requirements must carry a hardwareDetails block.",
      );
    }
    if (!isValidHardwareDetails(input.hardwareDetails)) {
      throw new Error(
        "requirementsStore: hardwareDetails block is malformed (itemName, model, quantity > 0, unitCostEstimate >= 0, notes).",
      );
    }
    hardwareDetails = freezeHardware(input.hardwareDetails);
  } else {
    if (input.hardwareDetails !== undefined && input.hardwareDetails !== null) {
      throw new Error(
        "requirementsStore: hardwareDetails is only permitted on hardware-typed requirements.",
      );
    }
  }

  const id = input.id ?? generateRequirementId();
  if (!isValidRequirementId(id)) {
    throw new Error(
      `requirementsStore: invalid requirement id "${id}". Expected pattern ${REQUIREMENT_ID_RE.source}.`,
    );
  }

  const doc = readDoc();
  const existing = doc.requirements[id] ?? null;
  if (existing && existing.status === "frozen") {
    throw new Error(
      `requirementsStore: requirement "${id}" is frozen and cannot be modified.`,
    );
  }

  // Status rules:
  //   - moduleId === null  → status forced to 'draft' regardless of caller.
  //   - frozen status can only come from freezeRequirements; saveRequirement
  //     callers passing 'frozen' get rejected.
  let status: RequirementStatus = input.status ?? existing?.status ?? "draft";
  if (status === "frozen") {
    throw new Error(
      "requirementsStore: status 'frozen' may only be applied via freezeRequirements.",
    );
  }
  if (moduleId === null) {
    status = "draft";
  }

  const next: Requirement = Object.freeze({
    id,
    workItemId: input.workItemId,
    title: input.title.trim(),
    description: input.description ?? "",
    type: input.type,
    urgency: input.urgency,
    moduleId,
    hardwareDetails,
    status,
  });

  writeDoc({
    schemaVersion: REQUIREMENTS_SCHEMA_VERSION,
    requirements: { ...doc.requirements, [id]: next },
  });
  return next;
}

export function deleteRequirement(id: string): void {
  if (!isValidRequirementId(id)) return;
  const doc = readDoc();
  const existing = doc.requirements[id];
  if (!existing) return;
  if (existing.status === "frozen") {
    throw new Error(
      `requirementsStore: requirement "${id}" is frozen and cannot be deleted.`,
    );
  }
  const next: Record<string, Requirement> = { ...doc.requirements };
  delete next[id];
  writeDoc({
    schemaVersion: REQUIREMENTS_SCHEMA_VERSION,
    requirements: next,
  });
}

export function getRequirement(id: string): Requirement | null {
  if (!isValidRequirementId(id)) return null;
  const doc = readDoc();
  return doc.requirements[id] ?? null;
}

export function listRequirements(workItemId?: string): readonly Requirement[] {
  const doc = readDoc();
  let values = Object.values(doc.requirements);
  if (workItemId !== undefined) {
    values = values.filter((r) => r.workItemId === workItemId);
  }
  return values.sort((a, b) =>
    a.title < b.title ? -1 : a.title > b.title ? 1 : 0,
  );
}

// Approve a requirement. Rejects requirements without a moduleId
// (the draft rule applies forward — you cannot approve a moduleless
// requirement) and refuses to touch frozen requirements.
export function approveRequirement(id: string): Requirement {
  if (!isValidRequirementId(id)) {
    throw new Error(`requirementsStore: invalid requirement id "${id}".`);
  }
  const doc = readDoc();
  const existing = doc.requirements[id];
  if (!existing) {
    throw new Error(`requirementsStore: no requirement found with id "${id}".`);
  }
  if (existing.status === "frozen") {
    throw new Error(
      `requirementsStore: requirement "${id}" is frozen; approval is final.`,
    );
  }
  if (existing.moduleId === null) {
    throw new Error(
      `requirementsStore: requirement "${id}" has no module link and cannot leave draft.`,
    );
  }
  const next: Requirement = Object.freeze({ ...existing, status: "approved" });
  writeDoc({
    schemaVersion: REQUIREMENTS_SCHEMA_VERSION,
    requirements: { ...doc.requirements, [id]: next },
  });
  return next;
}

// Mark each requirement frozen. Rejects any requirement whose
// current status is not `'approved'`. Idempotent against already-
// frozen ids: re-freezing a frozen requirement is a no-op.
export function freezeRequirements(ids: readonly string[]): readonly Requirement[] {
  if (!Array.isArray(ids)) {
    throw new Error("requirementsStore: freezeRequirements expects an array of ids.");
  }
  const doc = readDoc();
  const next: Record<string, Requirement> = { ...doc.requirements };
  const frozen: Requirement[] = [];
  for (const id of ids) {
    if (!isValidRequirementId(id)) {
      throw new Error(`requirementsStore: invalid requirement id "${id}" in freeze set.`);
    }
    const existing = next[id];
    if (!existing) {
      throw new Error(`requirementsStore: requirement "${id}" not found.`);
    }
    if (existing.status === "frozen") {
      frozen.push(existing);
      continue;
    }
    if (existing.status !== "approved") {
      throw new Error(
        `requirementsStore: requirement "${id}" must be approved before it can be frozen ` +
          `(current status: ${existing.status}).`,
      );
    }
    const updated: Requirement = Object.freeze({ ...existing, status: "frozen" });
    next[id] = updated;
    frozen.push(updated);
  }
  writeDoc({
    schemaVersion: REQUIREMENTS_SCHEMA_VERSION,
    requirements: next,
  });
  return frozen;
}
