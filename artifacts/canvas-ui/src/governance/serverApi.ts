// Thin fetch wrapper around the api-server's tenant-data routes.
//
// Phase 3 — every persisted ADC/CTAD/ACW document originates on
// the api-server. The browser stores keep their existing
// synchronous shape via an in-memory cache (see
// `scopedStorageClient.ts`), but mutations are mirrored to these
// endpoints over HTTP so the data survives a "Clear Site Data"
// or a fresh browser.
//
// This module is intentionally tiny: no Zod schemas, no React,
// no abstractions over fetch. The browser-side validators
// continue to own document shape; the server treats every value
// as an opaque string.

const API_BASE = "/api";

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

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status} ${res.statusText}: ${text}`);
  }
  return (await res.json()) as T;
}

// Strict success check: any non-2xx is an error. Use this for
// PUT / POST / etc., where a 404 should NOT be silently swallowed
// (a 404 on PUT means a misrouted endpoint, not an idempotent
// no-op).
async function ok(res: Response): Promise<void> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status} ${res.statusText}: ${text}`);
  }
}

// DELETE-specific success check: tolerates 404 because an
// idempotent delete of an already-absent resource is a success
// from the caller's perspective.
async function okDelete(res: Response): Promise<void> {
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status} ${res.statusText}: ${text}`);
  }
}

// ---- orgs ------------------------------------------------------------------

export async function apiListOrgs(): Promise<readonly OrgRow[]> {
  const res = await fetch(`${API_BASE}/orgs`, { credentials: "include" });
  const body = await asJson<{ orgs: OrgRow[] }>(res);
  return body.orgs;
}

export async function apiPutOrg(org: OrgRow): Promise<void> {
  const res = await fetch(`${API_BASE}/orgs/${encodeURIComponent(org.id)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ org }),
    credentials: "include",
  });
  await ok(res);
}

export async function apiDeleteOrg(orgId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/orgs/${encodeURIComponent(orgId)}`, {
    method: "DELETE",
    credentials: "include",
  });
  await okDelete(res);
}

// ---- work items ------------------------------------------------------------

export async function apiListWorkItems(
  orgId: string,
): Promise<readonly WorkItemRow[]> {
  const res = await fetch(
    `${API_BASE}/orgs/${encodeURIComponent(orgId)}/work-items`,
    { credentials: "include" },
  );
  const body = await asJson<{ workItems: WorkItemRow[] }>(res);
  return body.workItems;
}

export async function apiPutWorkItem(wi: WorkItemRow): Promise<void> {
  const res = await fetch(
    `${API_BASE}/orgs/${encodeURIComponent(wi.orgId)}/work-items/${encodeURIComponent(wi.id)}`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workItem: wi }),
      credentials: "include",
    },
  );
  await ok(res);
}

export async function apiDeleteWorkItem(
  orgId: string,
  wiId: string,
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/orgs/${encodeURIComponent(orgId)}/work-items/${encodeURIComponent(wiId)}`,
    { method: "DELETE", credentials: "include" },
  );
  await okDelete(res);
}

// ---- scoped key-value ------------------------------------------------------

export async function apiListOrgScoped(
  orgId: string,
): Promise<Record<string, string>> {
  const res = await fetch(
    `${API_BASE}/orgs/${encodeURIComponent(orgId)}/scoped`,
    { credentials: "include" },
  );
  const body = await asJson<{ scoped: Record<string, string> }>(res);
  return body.scoped;
}

export async function apiPutOrgScoped(
  orgId: string,
  baseKey: string,
  value: string,
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/orgs/${encodeURIComponent(orgId)}/scoped/${encodeURIComponent(baseKey)}`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value }),
      credentials: "include",
    },
  );
  await ok(res);
}

export async function apiDeleteOrgScoped(
  orgId: string,
  baseKey: string,
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/orgs/${encodeURIComponent(orgId)}/scoped/${encodeURIComponent(baseKey)}`,
    { method: "DELETE", credentials: "include" },
  );
  await okDelete(res);
}

export async function apiListWorkItemScoped(
  orgId: string,
  wiId: string,
): Promise<Record<string, string>> {
  const res = await fetch(
    `${API_BASE}/orgs/${encodeURIComponent(orgId)}/work-items/${encodeURIComponent(wiId)}/scoped`,
    { credentials: "include" },
  );
  const body = await asJson<{ scoped: Record<string, string> }>(res);
  return body.scoped;
}

export async function apiPutWorkItemScoped(
  orgId: string,
  wiId: string,
  baseKey: string,
  value: string,
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/orgs/${encodeURIComponent(orgId)}/work-items/${encodeURIComponent(wiId)}/scoped/${encodeURIComponent(baseKey)}`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value }),
      credentials: "include",
    },
  );
  await ok(res);
}

export async function apiDeleteWorkItemScoped(
  orgId: string,
  wiId: string,
  baseKey: string,
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/orgs/${encodeURIComponent(orgId)}/work-items/${encodeURIComponent(wiId)}/scoped/${encodeURIComponent(baseKey)}`,
    { method: "DELETE", credentials: "include" },
  );
  await okDelete(res);
}

// ---- legacy bulk upload ----------------------------------------------------

export interface LegacyUploadPayload {
  readonly orgs: readonly OrgRow[];
  readonly workItems: readonly WorkItemRow[];
  readonly orgScoped: ReadonlyArray<{
    readonly orgId: string;
    readonly baseKey: string;
    readonly value: string;
  }>;
  readonly workItemScoped: ReadonlyArray<{
    readonly orgId: string;
    readonly workItemId: string;
    readonly baseKey: string;
    readonly value: string;
  }>;
}

export interface LegacyUploadResult {
  readonly orgs: number;
  readonly workItems: number;
  readonly orgScoped: number;
  readonly workItemScoped: number;
}

export async function apiLegacyUpload(
  payload: LegacyUploadPayload,
): Promise<LegacyUploadResult> {
  const res = await fetch(`${API_BASE}/legacy-upload`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include",
  });
  const body = await asJson<{ accepted: LegacyUploadResult }>(res);
  return body.accepted;
}
