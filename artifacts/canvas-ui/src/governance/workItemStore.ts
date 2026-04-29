// Work-Item registry.
//
// Phase 2 (SaaS Onboarding) replaces the hard-coded
// `workItemPlaceholder` with a real, multi-tenant Work-Item
// registry. Every Work Item belongs to exactly one Organisation
// and carries a small enum-typed `type` describing the kind of
// architectural work the Work Item represents.
//
// Architectural constraints:
//   - Top-level allow-list. Persisted document carries exactly
//     `{ schemaVersion, workItems }`. Unknown keys at any level
//     are refused on read.
//   - Schema-version locked at `wi-1.0`.
//   - `id` matches `^wi-[a-z0-9]+$` (12 hex chars by default).
//   - `orgId` matches `^org-[a-z0-9]+$` (mirrors the orgStore id
//     format). The registry validates the id shape on read so a
//     malformed payload is refused, AND on `createWorkItem` it
//     verifies that the referenced Organisation actually exists
//     in `orgStore` — a defensive belt-and-suspenders against
//     orphan rows under tampered localStorage. (The on-read pass
//     intentionally stays shape-only so a temporarily-missing org
//     document does not silently nuke its Work Items.)
//   - `type ∈ { "ea-blueprint", "project", "enhancement",
//     "change-request" }`.
//   - At most one `ea-blueprint` Work Item per organisation
//     (enforced at create time).
//   - Enhancement / Change-Request Work Items can only be created
//     when an `ea-blueprint` Work Item already exists in the same
//     organisation.

import { getOrganisation } from "./orgStore";

const STORAGE_KEY = "app.work-items.v1";
export const WORK_ITEM_SCHEMA_VERSION = "wi-1.0" as const;

const WORK_ITEM_ID_RE = /^wi-[a-z0-9]+$/;
const ORG_ID_RE = /^org-[a-z0-9]+$/;

export const WORK_ITEM_TYPES = [
  "ea-blueprint",
  "project",
  "enhancement",
  "change-request",
] as const;
export type WorkItemType = (typeof WORK_ITEM_TYPES)[number];

const WORK_ITEM_TYPE_SET: ReadonlySet<string> = new Set(WORK_ITEM_TYPES);

export interface WorkItem {
  readonly id: string;
  readonly orgId: string;
  readonly type: WorkItemType;
  readonly title: string;
  readonly description: string;
  readonly createdAt: string;
  // Optional. `false` for every Work Item created before the
  // archive feature shipped — read-side normalisation treats a
  // missing `archived` field as `false` so old persisted documents
  // continue to validate without a schema-version bump.
  readonly archived: boolean;
}

interface WorkItemDoc {
  readonly schemaVersion: typeof WORK_ITEM_SCHEMA_VERSION;
  readonly workItems: Readonly<Record<string, WorkItem>>;
}

const EMPTY_DOC: WorkItemDoc = Object.freeze({
  schemaVersion: WORK_ITEM_SCHEMA_VERSION,
  workItems: Object.freeze({}),
});

const ALLOWED_TOP_LEVEL_KEYS = new Set(["schemaVersion", "workItems"]);
const ALLOWED_WORK_ITEM_KEYS = new Set([
  "id",
  "orgId",
  "type",
  "title",
  "description",
  "createdAt",
  "archived",
]);

function isValidWorkItemId(id: unknown): id is string {
  return typeof id === "string" && WORK_ITEM_ID_RE.test(id);
}

function isValidOrgId(id: unknown): id is string {
  return typeof id === "string" && ORG_ID_RE.test(id);
}

function isValidWorkItem(value: unknown): value is WorkItem {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  for (const k of Object.keys(v)) {
    if (!ALLOWED_WORK_ITEM_KEYS.has(k)) return false;
  }
  if (!isValidWorkItemId(v.id)) return false;
  if (!isValidOrgId(v.orgId)) return false;
  if (typeof v.type !== "string" || !WORK_ITEM_TYPE_SET.has(v.type)) return false;
  if (typeof v.title !== "string" || v.title.length === 0) return false;
  if (typeof v.description !== "string") return false;
  if (typeof v.createdAt !== "string" || v.createdAt.length === 0) return false;
  // `archived` is optional on the wire (pre-archive Work Items
  // were persisted without the field). When present it must be a
  // boolean — anything else means the document was tampered with.
  if (v.archived !== undefined && typeof v.archived !== "boolean") return false;
  return true;
}

function readDoc(): WorkItemDoc {
  if (typeof window === "undefined" || !window.localStorage) return EMPTY_DOC;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_DOC;
    const parsed = JSON.parse(raw) as Partial<WorkItemDoc> & Record<string, unknown>;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.schemaVersion !== WORK_ITEM_SCHEMA_VERSION ||
      typeof parsed.workItems !== "object" ||
      parsed.workItems === null
    ) {
      return EMPTY_DOC;
    }
    for (const k of Object.keys(parsed)) {
      if (!ALLOWED_TOP_LEVEL_KEYS.has(k)) return EMPTY_DOC;
    }
    const cleaned: Record<string, WorkItem> = {};
    for (const [key, val] of Object.entries(parsed.workItems)) {
      if (key !== (val as WorkItem | undefined)?.id) continue;
      if (!isValidWorkItem(val)) continue;
      // Normalise pre-archive documents (no `archived` field) to
      // an explicit `archived: false` so every in-memory WorkItem
      // carries the field. The persisted document is left as-is —
      // we only normalise the read shape so callers can rely on
      // `wi.archived` being a boolean without optional-chaining.
      const v = val as unknown as Record<string, unknown>;
      const archived =
        typeof v.archived === "boolean" ? (v.archived as boolean) : false;
      cleaned[key] = Object.freeze({
        id: v.id as string,
        orgId: v.orgId as string,
        type: v.type as WorkItemType,
        title: v.title as string,
        description: v.description as string,
        createdAt: v.createdAt as string,
        archived,
      });
    }
    return {
      schemaVersion: WORK_ITEM_SCHEMA_VERSION,
      workItems: cleaned,
    };
  } catch {
    return EMPTY_DOC;
  }
}

function writeDoc(doc: WorkItemDoc): void {
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

function generateWorkItemId(): string {
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
  return `wi-${hex}`;
}

export interface CreateWorkItemInput {
  readonly id?: string;
  readonly orgId: string;
  readonly type: WorkItemType;
  readonly title: string;
  readonly description?: string;
}

export function createWorkItem(input: CreateWorkItemInput): WorkItem {
  if (!isValidOrgId(input.orgId)) {
    throw new Error(
      `workItemStore: invalid orgId "${String(input.orgId)}". Expected pattern ${ORG_ID_RE.source}.`,
    );
  }
  // Belt-and-suspenders against orphan rows under tampered
  // localStorage: refuse to mint a Work Item whose orgId is not
  // registered in the orgStore. Read-side queries stay
  // shape-only so a temporarily-missing org document does not
  // silently nuke its existing Work Items.
  if (getOrganisation(input.orgId) === null) {
    throw new Error(
      `workItemStore: cannot create a Work Item under organisation "${input.orgId}" — ` +
        `no such Organisation is registered.`,
    );
  }
  if (typeof input.type !== "string" || !WORK_ITEM_TYPE_SET.has(input.type)) {
    throw new Error(
      `workItemStore: invalid Work Item type "${String(input.type)}". Allowed: ${WORK_ITEM_TYPES.join(", ")}.`,
    );
  }
  if (typeof input.title !== "string" || input.title.trim().length === 0) {
    throw new Error("workItemStore: Work Item title must be a non-empty string.");
  }
  const id = input.id ?? generateWorkItemId();
  if (!isValidWorkItemId(id)) {
    throw new Error(
      `workItemStore: invalid Work Item id "${id}". Expected pattern ${WORK_ITEM_ID_RE.source}.`,
    );
  }
  const description = input.description ?? "";
  const doc = readDoc();
  if (id in doc.workItems) {
    throw new Error(`workItemStore: a Work Item with id "${id}" already exists.`);
  }
  const itemsForOrg = Object.values(doc.workItems).filter(
    (w) => w.orgId === input.orgId,
  );

  if (input.type === "ea-blueprint") {
    if (itemsForOrg.some((w) => w.type === "ea-blueprint")) {
      throw new Error(
        `workItemStore: an EA Blueprint Work Item already exists for organisation "${input.orgId}". ` +
          `Each organisation may carry exactly one EA Blueprint.`,
      );
    }
  }
  if (input.type === "enhancement" || input.type === "change-request") {
    const hasBlueprint = itemsForOrg.some((w) => w.type === "ea-blueprint");
    if (!hasBlueprint) {
      throw new Error(
        `workItemStore: cannot create a "${input.type}" Work Item in organisation "${input.orgId}" — ` +
          `no EA Blueprint Work Item exists in that organisation.`,
      );
    }
  }

  const next: WorkItem = Object.freeze({
    id,
    orgId: input.orgId,
    type: input.type,
    title: input.title.trim(),
    description,
    createdAt: new Date().toISOString(),
    archived: false,
  });
  writeDoc({
    schemaVersion: WORK_ITEM_SCHEMA_VERSION,
    workItems: { ...doc.workItems, [id]: next },
  });
  return next;
}

/**
 * Rename a Work Item. Updates `title` only — `type`, `orgId`,
 * `createdAt`, and `archived` are preserved. Idempotent: a rename
 * to the same trimmed title is a no-op (no write, no version
 * bump). Throws on a malformed id, an unknown id, or an empty /
 * whitespace-only title.
 */
export function renameWorkItem(id: string, newTitle: string): WorkItem {
  if (!isValidWorkItemId(id)) {
    throw new Error(
      `workItemStore: invalid Work Item id "${id}". Expected pattern ${WORK_ITEM_ID_RE.source}.`,
    );
  }
  if (typeof newTitle !== "string" || newTitle.trim().length === 0) {
    throw new Error("workItemStore: Work Item title must be a non-empty string.");
  }
  const trimmed = newTitle.trim();
  const doc = readDoc();
  const existing = doc.workItems[id];
  if (!existing) {
    throw new Error(`workItemStore: no Work Item with id "${id}".`);
  }
  if (existing.title === trimmed) return existing;
  const next: WorkItem = Object.freeze({ ...existing, title: trimmed });
  writeDoc({
    schemaVersion: WORK_ITEM_SCHEMA_VERSION,
    workItems: { ...doc.workItems, [id]: next },
  });
  return next;
}

/**
 * Archive a Work Item. Sets `archived = true` so the dashboard can
 * hide it without dropping the row's scoped data — every
 * `<orgId>:<workItemId>:*` localStorage entry survives the archive
 * so the user can later un-archive without losing context.
 *
 * Idempotent: archiving an already-archived row is a no-op.
 * Throws on a malformed id, an unknown id, or when the row is the
 * organisation's EA Blueprint (every org must keep its blueprint
 * visible — the blueprint anchors the org).
 */
export function archiveWorkItem(id: string): WorkItem {
  return setArchivedFlag(id, true);
}

/** Inverse of `archiveWorkItem`. Idempotent on an already-active row. */
export function unarchiveWorkItem(id: string): WorkItem {
  return setArchivedFlag(id, false);
}

function setArchivedFlag(id: string, archived: boolean): WorkItem {
  if (!isValidWorkItemId(id)) {
    throw new Error(
      `workItemStore: invalid Work Item id "${id}". Expected pattern ${WORK_ITEM_ID_RE.source}.`,
    );
  }
  const doc = readDoc();
  const existing = doc.workItems[id];
  if (!existing) {
    throw new Error(`workItemStore: no Work Item with id "${id}".`);
  }
  if (archived && existing.type === "ea-blueprint") {
    throw new Error(
      `workItemStore: cannot archive the EA Blueprint Work Item for organisation "${existing.orgId}". ` +
        `The EA Blueprint anchors the organisation and must remain visible.`,
    );
  }
  if (existing.archived === archived) return existing;
  const next: WorkItem = Object.freeze({ ...existing, archived });
  writeDoc({
    schemaVersion: WORK_ITEM_SCHEMA_VERSION,
    workItems: { ...doc.workItems, [id]: next },
  });
  return next;
}

export function getWorkItem(id: string): WorkItem | null {
  if (!isValidWorkItemId(id)) return null;
  const doc = readDoc();
  return doc.workItems[id] ?? null;
}

export function listWorkItems(): readonly WorkItem[] {
  const doc = readDoc();
  return Object.values(doc.workItems);
}

export function listWorkItemsForOrg(orgId: string): readonly WorkItem[] {
  if (!isValidOrgId(orgId)) return [];
  const doc = readDoc();
  return Object.values(doc.workItems)
    .filter((w) => w.orgId === orgId)
    .sort((a, b) => {
      // EA Blueprint always first, then by createdAt ascending.
      if (a.type === "ea-blueprint" && b.type !== "ea-blueprint") return -1;
      if (a.type !== "ea-blueprint" && b.type === "ea-blueprint") return 1;
      return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    });
}

export function getEaBlueprintForOrg(orgId: string): WorkItem | null {
  if (!isValidOrgId(orgId)) return null;
  const doc = readDoc();
  return (
    Object.values(doc.workItems).find(
      (w) => w.orgId === orgId && w.type === "ea-blueprint",
    ) ?? null
  );
}

export function removeWorkItem(id: string): void {
  if (!isValidWorkItemId(id)) return;
  const doc = readDoc();
  if (!(id in doc.workItems)) return;
  const next: Record<string, WorkItem> = { ...doc.workItems };
  delete next[id];
  writeDoc({
    schemaVersion: WORK_ITEM_SCHEMA_VERSION,
    workItems: next,
  });
}

export function removeAllWorkItemsForOrg(orgId: string): void {
  if (!isValidOrgId(orgId)) return;
  const doc = readDoc();
  const next: Record<string, WorkItem> = {};
  for (const [k, v] of Object.entries(doc.workItems)) {
    if (v.orgId !== orgId) next[k] = v;
  }
  writeDoc({
    schemaVersion: WORK_ITEM_SCHEMA_VERSION,
    workItems: next,
  });
}
