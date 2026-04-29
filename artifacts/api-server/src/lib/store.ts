// Tenant data store for the API server.
//
// Persists Organisations, Work Items, and arbitrary scoped
// key-value documents to a single JSON file on disk so the data
// survives a server restart. Reads happen from an in-memory
// snapshot for low latency. Writes update the snapshot
// synchronously and then schedule a debounced flush to disk.
//
// This intentionally does NOT validate document shape — the
// browser-side stores own their schema validators and treat the
// server like a dumb key-value backplane. Top-level shape of the
// persisted JSON file IS allow-listed so a hand-edited file with
// junk top-level keys is refused on read.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "./logger";

export interface OrgRow {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly sector: string;
  readonly natureOfBusiness: string;
  readonly logo: string;
  readonly createdAt: string;
}

export interface WorkItemRow {
  readonly id: string;
  readonly orgId: string;
  readonly type: string;
  readonly title: string;
  readonly description: string;
  readonly createdAt: string;
  readonly archived: boolean;
}

interface ScopedDoc {
  readonly value: string;
  readonly updatedAt: string;
}

interface PersistedShape {
  readonly schemaVersion: "tenant-store-1.0";
  readonly orgs: Record<string, OrgRow>;
  readonly workItems: Record<string, WorkItemRow>;
  readonly orgScoped: Record<string, Record<string, ScopedDoc>>;
  readonly workItemScoped: Record<
    string,
    Record<string, Record<string, ScopedDoc>>
  >;
}

const SCHEMA_VERSION = "tenant-store-1.0" as const;

/**
 * Thrown when a write would violate a tenant boundary (e.g. addressing
 * a work item via the wrong org path, or assigning a work item to a
 * non-existent parent org). The route layer catches this and returns
 * a 409 Conflict so the caller can correct the misroute. We deliberately
 * do NOT silently coerce the data — that would orphan scoped docs.
 */
export type TenantIntegrityCode = "ORG_NOT_FOUND" | "ORG_MISMATCH";
export class TenantIntegrityError extends Error {
  readonly code: TenantIntegrityCode;
  constructor(message: string, code: TenantIntegrityCode) {
    super(message);
    this.name = "TenantIntegrityError";
    this.code = code;
  }
}

// Resolve `.data/` from THIS file's location, not from
// `process.cwd()` — the api-server is bundled to
// `artifacts/api-server/dist/index.mjs` and the workflow runs it
// from the artifact's own directory, but other callers (tests, ad-
// hoc scripts) may run it from a different cwd. Walking up from
// the bundle keeps the path stable regardless of cwd.
function resolveDefaultDataDir(): string {
  try {
    // dist/index.mjs → ../.data
    const here = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(here, "..", ".data");
  } catch {
    // Fallback for environments where import.meta.url is unavailable
    // (e.g. CommonJS test harness). Use the artifact-rooted path.
    return path.resolve(process.cwd(), ".data");
  }
}

const DEFAULT_DIR = process.env["TENANT_STORE_DIR"] || resolveDefaultDataDir();
const DEFAULT_FILE = path.join(DEFAULT_DIR, "tenant-store.json");

function emptyShape(): PersistedShape {
  return {
    schemaVersion: SCHEMA_VERSION,
    orgs: {},
    workItems: {},
    orgScoped: {},
    workItemScoped: {},
  };
}

function readFromDisk(file: string): PersistedShape {
  try {
    if (!fs.existsSync(file)) return emptyShape();
    const raw = fs.readFileSync(file, "utf-8");
    if (!raw.trim()) return emptyShape();
    const parsed = JSON.parse(raw) as Partial<PersistedShape>;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.schemaVersion !== SCHEMA_VERSION ||
      typeof parsed.orgs !== "object" ||
      parsed.orgs === null ||
      typeof parsed.workItems !== "object" ||
      parsed.workItems === null ||
      typeof parsed.orgScoped !== "object" ||
      parsed.orgScoped === null ||
      typeof parsed.workItemScoped !== "object" ||
      parsed.workItemScoped === null
    ) {
      logger.warn(
        { file },
        "Tenant store: persisted shape malformed — starting fresh.",
      );
      return emptyShape();
    }
    return {
      schemaVersion: SCHEMA_VERSION,
      orgs: parsed.orgs as Record<string, OrgRow>,
      workItems: parsed.workItems as Record<string, WorkItemRow>,
      orgScoped: parsed.orgScoped as Record<
        string,
        Record<string, ScopedDoc>
      >,
      workItemScoped: parsed.workItemScoped as Record<
        string,
        Record<string, Record<string, ScopedDoc>>
      >,
    };
  } catch (err) {
    logger.warn({ err, file }, "Tenant store: read failed — starting fresh.");
    return emptyShape();
  }
}

class TenantStore {
  private readonly file: string;
  private readonly dir: string;
  private state: PersistedShape;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(file: string = DEFAULT_FILE) {
    this.file = file;
    this.dir = path.dirname(file);
    fs.mkdirSync(this.dir, { recursive: true });
    this.state = readFromDisk(file);
  }

  // ---- orgs ----------------------------------------------------------------

  listOrgs(): OrgRow[] {
    return Object.values(this.state.orgs);
  }

  getOrg(id: string): OrgRow | null {
    return this.state.orgs[id] ?? null;
  }

  putOrg(row: OrgRow): void {
    this.state = {
      ...this.state,
      orgs: { ...this.state.orgs, [row.id]: row },
    };
    this.scheduleFlush();
  }

  deleteOrg(id: string): void {
    if (!(id in this.state.orgs)) return;
    const orgs = { ...this.state.orgs };
    delete orgs[id];
    // Cascade: drop work items belonging to the org and all of their scoped data.
    const workItems = { ...this.state.workItems };
    const wiToDrop: string[] = [];
    for (const [wiId, wi] of Object.entries(this.state.workItems)) {
      if (wi.orgId === id) {
        wiToDrop.push(wiId);
        delete workItems[wiId];
      }
    }
    const orgScoped = { ...this.state.orgScoped };
    delete orgScoped[id];
    const workItemScoped = { ...this.state.workItemScoped };
    delete workItemScoped[id];
    this.state = {
      schemaVersion: SCHEMA_VERSION,
      orgs,
      workItems,
      orgScoped,
      workItemScoped,
    };
    this.scheduleFlush();
  }

  // ---- work items ----------------------------------------------------------

  listWorkItemsForOrg(orgId: string): WorkItemRow[] {
    return Object.values(this.state.workItems).filter((w) => w.orgId === orgId);
  }

  getWorkItem(wiId: string): WorkItemRow | null {
    return this.state.workItems[wiId] ?? null;
  }

  putWorkItem(row: WorkItemRow): void {
    // Tenant-boundary: the parent org MUST exist, and we cannot
    // hijack a work-item id that already belongs to a different
    // org. Refuse with a typed error the route layer maps to a
    // 4xx response so the caller learns about the misroute
    // instead of silently corrupting the store.
    if (!(row.orgId in this.state.orgs)) {
      throw new TenantIntegrityError(
        `cannot put work item ${row.id}: parent org ${row.orgId} does not exist`,
        "ORG_NOT_FOUND",
      );
    }
    const existing = this.state.workItems[row.id];
    if (existing && existing.orgId !== row.orgId) {
      throw new TenantIntegrityError(
        `cannot reassign work item ${row.id} from org ${existing.orgId} to ${row.orgId}`,
        "ORG_MISMATCH",
      );
    }
    this.state = {
      ...this.state,
      workItems: { ...this.state.workItems, [row.id]: row },
    };
    this.scheduleFlush();
  }

  deleteWorkItem(orgId: string, wiId: string): void {
    const existing = this.state.workItems[wiId];
    // Idempotent: deleting an already-absent row is a no-op success.
    if (!existing) return;
    // Tenant-boundary: refuse to delete a row from the wrong org.
    // This guards against a caller addressing the row via the
    // wrong org path and accidentally orphaning scoped docs under
    // the row's real org bucket.
    if (existing.orgId !== orgId) {
      throw new TenantIntegrityError(
        `work item ${wiId} belongs to org ${existing.orgId}, not ${orgId}`,
        "ORG_MISMATCH",
      );
    }
    const workItems = { ...this.state.workItems };
    delete workItems[wiId];
    const wiScopedForOrg = { ...(this.state.workItemScoped[orgId] ?? {}) };
    delete wiScopedForOrg[wiId];
    const workItemScoped = {
      ...this.state.workItemScoped,
      [orgId]: wiScopedForOrg,
    };
    this.state = {
      ...this.state,
      workItems,
      workItemScoped,
    };
    this.scheduleFlush();
  }

  // ---- scoped key-value ----------------------------------------------------

  listOrgScoped(orgId: string): Record<string, string> {
    const bucket = this.state.orgScoped[orgId] ?? {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(bucket)) out[k] = v.value;
    return out;
  }

  getOrgScoped(orgId: string, baseKey: string): string | null {
    const bucket = this.state.orgScoped[orgId];
    if (!bucket) return null;
    return bucket[baseKey]?.value ?? null;
  }

  putOrgScoped(orgId: string, baseKey: string, value: string): void {
    // Tenant-boundary: refuse to land an org-scoped doc under an
    // org that doesn't exist. Mirrors the protection on
    // putWorkItem / putWorkItemScoped so a misrouted scoped write
    // surfaces as a 4xx instead of stranding orphan rows.
    if (!(orgId in this.state.orgs)) {
      throw new TenantIntegrityError(
        `cannot put scoped doc under org ${orgId}: org does not exist`,
        "ORG_NOT_FOUND",
      );
    }
    const bucket = { ...(this.state.orgScoped[orgId] ?? {}) };
    bucket[baseKey] = { value, updatedAt: new Date().toISOString() };
    this.state = {
      ...this.state,
      orgScoped: { ...this.state.orgScoped, [orgId]: bucket },
    };
    this.scheduleFlush();
  }

  deleteOrgScoped(orgId: string, baseKey: string): void {
    // Idempotent: deleting under an absent org or absent key is a
    // no-op success — no need to reject, since there's nothing to
    // corrupt.
    const bucket = this.state.orgScoped[orgId];
    if (!bucket || !(baseKey in bucket)) return;
    const next = { ...bucket };
    delete next[baseKey];
    this.state = {
      ...this.state,
      orgScoped: { ...this.state.orgScoped, [orgId]: next },
    };
    this.scheduleFlush();
  }

  listWorkItemScoped(orgId: string, wiId: string): Record<string, string> {
    const bucket = this.state.workItemScoped[orgId]?.[wiId] ?? {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(bucket)) out[k] = v.value;
    return out;
  }

  getWorkItemScoped(
    orgId: string,
    wiId: string,
    baseKey: string,
  ): string | null {
    const bucket = this.state.workItemScoped[orgId]?.[wiId];
    if (!bucket) return null;
    return bucket[baseKey]?.value ?? null;
  }

  putWorkItemScoped(
    orgId: string,
    wiId: string,
    baseKey: string,
    value: string,
  ): void {
    // Tenant-boundary: refuse to land a wi-scoped doc under the
    // wrong (org, wi) pair. Mirrors the protection in
    // `putWorkItem` so a misrouted scoped write surfaces as a
    // 4xx instead of corrupting the bucket.
    const existing = this.state.workItems[wiId];
    if (!existing) {
      throw new TenantIntegrityError(
        `cannot put scoped doc under wi ${wiId}: work item does not exist`,
        "ORG_NOT_FOUND",
      );
    }
    if (existing.orgId !== orgId) {
      throw new TenantIntegrityError(
        `wi ${wiId} belongs to org ${existing.orgId}, not ${orgId}`,
        "ORG_MISMATCH",
      );
    }
    const orgBucket = { ...(this.state.workItemScoped[orgId] ?? {}) };
    const wiBucket = { ...(orgBucket[wiId] ?? {}) };
    wiBucket[baseKey] = { value, updatedAt: new Date().toISOString() };
    orgBucket[wiId] = wiBucket;
    this.state = {
      ...this.state,
      workItemScoped: { ...this.state.workItemScoped, [orgId]: orgBucket },
    };
    this.scheduleFlush();
  }

  deleteWorkItemScoped(orgId: string, wiId: string, baseKey: string): void {
    // Tenant-boundary: refuse a delete addressed to the wrong
    // org for this wi. We DO allow the no-op case where the wi
    // simply doesn't exist (idempotent delete) — but if the wi
    // exists under a different org, that's a misroute we want to
    // surface.
    const existing = this.state.workItems[wiId];
    if (existing && existing.orgId !== orgId) {
      throw new TenantIntegrityError(
        `wi ${wiId} belongs to org ${existing.orgId}, not ${orgId}`,
        "ORG_MISMATCH",
      );
    }
    const wiBucket = this.state.workItemScoped[orgId]?.[wiId];
    if (!wiBucket || !(baseKey in wiBucket)) return;
    const orgBucket = { ...(this.state.workItemScoped[orgId] ?? {}) };
    const next = { ...wiBucket };
    delete next[baseKey];
    orgBucket[wiId] = next;
    this.state = {
      ...this.state,
      workItemScoped: { ...this.state.workItemScoped, [orgId]: orgBucket },
    };
    this.scheduleFlush();
  }

  // ---- bulk legacy upload --------------------------------------------------
  //
  // Insert-only, never overwrite. Returns the number of new rows
  // accepted so the caller can confirm what was imported.

  legacyUpload(payload: {
    orgs?: OrgRow[];
    workItems?: WorkItemRow[];
    orgScoped?: { orgId: string; baseKey: string; value: string }[];
    workItemScoped?: {
      orgId: string;
      workItemId: string;
      baseKey: string;
      value: string;
    }[];
  }): {
    orgs: number;
    workItems: number;
    orgScoped: number;
    workItemScoped: number;
  } {
    let orgs = 0;
    let workItems = 0;
    let orgScopedCount = 0;
    let workItemScopedCount = 0;

    for (const row of payload.orgs ?? []) {
      if (!row.id || row.id in this.state.orgs) continue;
      this.putOrg(row);
      orgs += 1;
    }
    for (const row of payload.workItems ?? []) {
      if (!row.id || row.id in this.state.workItems) continue;
      // Defensive: skip if its parent org row is not present.
      if (!(row.orgId in this.state.orgs)) continue;
      this.putWorkItem(row);
      workItems += 1;
    }
    for (const entry of payload.orgScoped ?? []) {
      if (!(entry.orgId in this.state.orgs)) continue;
      const existing = this.getOrgScoped(entry.orgId, entry.baseKey);
      if (existing !== null) continue;
      this.putOrgScoped(entry.orgId, entry.baseKey, entry.value);
      orgScopedCount += 1;
    }
    for (const entry of payload.workItemScoped ?? []) {
      if (!(entry.orgId in this.state.orgs)) continue;
      if (!(entry.workItemId in this.state.workItems)) continue;
      const existing = this.getWorkItemScoped(
        entry.orgId,
        entry.workItemId,
        entry.baseKey,
      );
      if (existing !== null) continue;
      this.putWorkItemScoped(
        entry.orgId,
        entry.workItemId,
        entry.baseKey,
        entry.value,
      );
      workItemScopedCount += 1;
    }
    return {
      orgs,
      workItems,
      orgScoped: orgScopedCount,
      workItemScoped: workItemScopedCount,
    };
  }

  // ---- persistence ---------------------------------------------------------

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushNow();
    }, 50);
  }

  private flushNow(): void {
    try {
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.state), "utf-8");
      fs.renameSync(tmp, this.file);
    } catch (err) {
      logger.error({ err, file: this.file }, "Tenant store: flush failed.");
    }
  }
}

export const tenantStore: TenantStore = new TenantStore();
