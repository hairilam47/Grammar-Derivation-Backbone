// Org / work-item / scoped-document HTTP routes.
//
// The browser's tenant stores treat the server as a dumb
// key-value backplane: the browser owns schema validation, the
// server owns persistence. We DO enforce id-shape regexes and
// `orgId` consistency at the boundary so a malformed call can't
// pollute the store.

import { Router, type IRouter, type Request, type Response } from "express";
import {
  tenantStore,
  TenantIntegrityError,
  type OrgRow,
  type WorkItemRow,
} from "../lib/store";

const router: IRouter = Router();

const ORG_ID_RE = /^org-[a-z0-9]+$/;
const WORK_ITEM_ID_RE = /^wi-[a-z0-9]+$/;
const BASE_KEY_RE = /^[a-z0-9][a-z0-9._-]{0,127}$/;

function badRequest(res: Response, message: string): void {
  res.status(400).json({ error: "bad_request", message });
}

function notFound(res: Response, message: string): void {
  res.status(404).json({ error: "not_found", message });
}

// Maps a tenant-boundary violation thrown from the store layer to
// a 4xx response so misrouted callers learn about the problem
// instead of silently corrupting the store.
//   - ORG_NOT_FOUND → 404 (the addressed parent org doesn't exist)
//   - ORG_MISMATCH  → 409 (the row is owned by a different org)
function handleIntegrityError(res: Response, err: TenantIntegrityError): void {
  if (err.code === "ORG_NOT_FOUND") {
    res.status(404).json({ error: "not_found", message: err.message });
    return;
  }
  res.status(409).json({ error: "conflict", message: err.message });
}

function isOrgId(v: unknown): v is string {
  return typeof v === "string" && ORG_ID_RE.test(v);
}
function isWorkItemId(v: unknown): v is string {
  return typeof v === "string" && WORK_ITEM_ID_RE.test(v);
}
function isBaseKey(v: unknown): v is string {
  return typeof v === "string" && BASE_KEY_RE.test(v);
}

function isOrgRow(v: unknown): v is OrgRow {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    isOrgId(r.id) &&
    typeof r.name === "string" &&
    typeof r.slug === "string" &&
    typeof r.sector === "string" &&
    typeof r.natureOfBusiness === "string" &&
    typeof r.logo === "string" &&
    typeof r.createdAt === "string"
  );
}

function isWorkItemRow(v: unknown): v is WorkItemRow {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    isWorkItemId(r.id) &&
    isOrgId(r.orgId) &&
    typeof r.type === "string" &&
    typeof r.title === "string" &&
    typeof r.description === "string" &&
    typeof r.createdAt === "string" &&
    typeof r.archived === "boolean"
  );
}

// ---- orgs ------------------------------------------------------------------

router.get("/orgs", (_req: Request, res: Response) => {
  res.json({ orgs: tenantStore.listOrgs() });
});

router.get("/orgs/:orgId", (req: Request, res: Response) => {
  const { orgId } = req.params;
  if (!isOrgId(orgId)) return badRequest(res, "invalid orgId");
  const row = tenantStore.getOrg(orgId);
  if (!row) return notFound(res, "org not found");
  res.json({ org: row });
});

router.put("/orgs/:orgId", (req: Request, res: Response) => {
  const { orgId } = req.params;
  if (!isOrgId(orgId)) return badRequest(res, "invalid orgId");
  const body = req.body as { org?: unknown };
  if (!isOrgRow(body?.org)) return badRequest(res, "invalid org row");
  if (body.org.id !== orgId) return badRequest(res, "id mismatch");
  tenantStore.putOrg(body.org);
  res.json({ org: body.org });
});

router.delete("/orgs/:orgId", (req: Request, res: Response) => {
  const { orgId } = req.params;
  if (!isOrgId(orgId)) return badRequest(res, "invalid orgId");
  tenantStore.deleteOrg(orgId);
  res.status(204).end();
});

// ---- work items ------------------------------------------------------------

router.get("/orgs/:orgId/work-items", (req: Request, res: Response) => {
  const { orgId } = req.params;
  if (!isOrgId(orgId)) return badRequest(res, "invalid orgId");
  res.json({ workItems: tenantStore.listWorkItemsForOrg(orgId) });
});

router.put(
  "/orgs/:orgId/work-items/:wiId",
  (req: Request, res: Response) => {
    const { orgId, wiId } = req.params;
    if (!isOrgId(orgId)) return badRequest(res, "invalid orgId");
    if (!isWorkItemId(wiId)) return badRequest(res, "invalid wiId");
    const body = req.body as { workItem?: unknown };
    if (!isWorkItemRow(body?.workItem)) {
      return badRequest(res, "invalid work item row");
    }
    if (body.workItem.id !== wiId) {
      return badRequest(res, "wiId mismatch");
    }
    if (body.workItem.orgId !== orgId) {
      return badRequest(res, "orgId mismatch");
    }
    try {
      tenantStore.putWorkItem(body.workItem);
    } catch (err) {
      if (err instanceof TenantIntegrityError) {
        return handleIntegrityError(res, err);
      }
      throw err;
    }
    res.json({ workItem: body.workItem });
  },
);

router.delete(
  "/orgs/:orgId/work-items/:wiId",
  (req: Request, res: Response) => {
    const { orgId, wiId } = req.params;
    if (!isOrgId(orgId)) return badRequest(res, "invalid orgId");
    if (!isWorkItemId(wiId)) return badRequest(res, "invalid wiId");
    try {
      tenantStore.deleteWorkItem(orgId, wiId);
    } catch (err) {
      if (err instanceof TenantIntegrityError) {
        return handleIntegrityError(res, err);
      }
      throw err;
    }
    res.status(204).end();
  },
);

// ---- scoped key-value: org-scoped -----------------------------------------

router.get("/orgs/:orgId/scoped", (req: Request, res: Response) => {
  const { orgId } = req.params;
  if (!isOrgId(orgId)) return badRequest(res, "invalid orgId");
  res.json({ scoped: tenantStore.listOrgScoped(orgId) });
});

router.get(
  "/orgs/:orgId/scoped/:baseKey",
  (req: Request, res: Response) => {
    const { orgId, baseKey } = req.params;
    if (!isOrgId(orgId)) return badRequest(res, "invalid orgId");
    if (!isBaseKey(baseKey)) return badRequest(res, "invalid baseKey");
    const v = tenantStore.getOrgScoped(orgId, baseKey);
    if (v === null) return notFound(res, "no document under that key");
    res.json({ value: v });
  },
);

router.put(
  "/orgs/:orgId/scoped/:baseKey",
  (req: Request, res: Response) => {
    const { orgId, baseKey } = req.params;
    if (!isOrgId(orgId)) return badRequest(res, "invalid orgId");
    if (!isBaseKey(baseKey)) return badRequest(res, "invalid baseKey");
    const body = req.body as { value?: unknown };
    if (typeof body?.value !== "string") {
      return badRequest(res, "value must be a string");
    }
    try {
      tenantStore.putOrgScoped(orgId, baseKey, body.value);
    } catch (err) {
      if (err instanceof TenantIntegrityError) {
        return handleIntegrityError(res, err);
      }
      throw err;
    }
    res.status(204).end();
  },
);

router.delete(
  "/orgs/:orgId/scoped/:baseKey",
  (req: Request, res: Response) => {
    const { orgId, baseKey } = req.params;
    if (!isOrgId(orgId)) return badRequest(res, "invalid orgId");
    if (!isBaseKey(baseKey)) return badRequest(res, "invalid baseKey");
    tenantStore.deleteOrgScoped(orgId, baseKey);
    res.status(204).end();
  },
);

// ---- scoped key-value: work-item-scoped -----------------------------------

router.get(
  "/orgs/:orgId/work-items/:wiId/scoped",
  (req: Request, res: Response) => {
    const { orgId, wiId } = req.params;
    if (!isOrgId(orgId)) return badRequest(res, "invalid orgId");
    if (!isWorkItemId(wiId)) return badRequest(res, "invalid wiId");
    res.json({ scoped: tenantStore.listWorkItemScoped(orgId, wiId) });
  },
);

router.get(
  "/orgs/:orgId/work-items/:wiId/scoped/:baseKey",
  (req: Request, res: Response) => {
    const { orgId, wiId, baseKey } = req.params;
    if (!isOrgId(orgId)) return badRequest(res, "invalid orgId");
    if (!isWorkItemId(wiId)) return badRequest(res, "invalid wiId");
    if (!isBaseKey(baseKey)) return badRequest(res, "invalid baseKey");
    const v = tenantStore.getWorkItemScoped(orgId, wiId, baseKey);
    if (v === null) return notFound(res, "no document under that key");
    res.json({ value: v });
  },
);

router.put(
  "/orgs/:orgId/work-items/:wiId/scoped/:baseKey",
  (req: Request, res: Response) => {
    const { orgId, wiId, baseKey } = req.params;
    if (!isOrgId(orgId)) return badRequest(res, "invalid orgId");
    if (!isWorkItemId(wiId)) return badRequest(res, "invalid wiId");
    if (!isBaseKey(baseKey)) return badRequest(res, "invalid baseKey");
    const body = req.body as { value?: unknown };
    if (typeof body?.value !== "string") {
      return badRequest(res, "value must be a string");
    }
    try {
      tenantStore.putWorkItemScoped(orgId, wiId, baseKey, body.value);
    } catch (err) {
      if (err instanceof TenantIntegrityError) {
        return handleIntegrityError(res, err);
      }
      throw err;
    }
    res.status(204).end();
  },
);

router.delete(
  "/orgs/:orgId/work-items/:wiId/scoped/:baseKey",
  (req: Request, res: Response) => {
    const { orgId, wiId, baseKey } = req.params;
    if (!isOrgId(orgId)) return badRequest(res, "invalid orgId");
    if (!isWorkItemId(wiId)) return badRequest(res, "invalid wiId");
    if (!isBaseKey(baseKey)) return badRequest(res, "invalid baseKey");
    try {
      tenantStore.deleteWorkItemScoped(orgId, wiId, baseKey);
    } catch (err) {
      if (err instanceof TenantIntegrityError) {
        return handleIntegrityError(res, err);
      }
      throw err;
    }
    res.status(204).end();
  },
);

// ---- bulk legacy upload ---------------------------------------------------

router.post("/legacy-upload", (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown> | undefined;
  if (!body || typeof body !== "object") {
    return badRequest(res, "expected JSON body");
  }

  const orgs = Array.isArray(body.orgs)
    ? (body.orgs.filter(isOrgRow) as OrgRow[])
    : [];
  const workItems = Array.isArray(body.workItems)
    ? (body.workItems.filter(isWorkItemRow) as WorkItemRow[])
    : [];

  type OrgScopedEntry = { orgId: string; baseKey: string; value: string };
  type WorkItemScopedEntry = OrgScopedEntry & { workItemId: string };

  function isOrgScopedEntry(v: unknown): v is OrgScopedEntry {
    if (!v || typeof v !== "object") return false;
    const r = v as Record<string, unknown>;
    return (
      isOrgId(r.orgId) &&
      isBaseKey(r.baseKey) &&
      typeof r.value === "string"
    );
  }
  function isWorkItemScopedEntry(v: unknown): v is WorkItemScopedEntry {
    if (!isOrgScopedEntry(v)) return false;
    return isWorkItemId((v as Record<string, unknown>).workItemId);
  }

  const orgScoped = Array.isArray(body.orgScoped)
    ? (body.orgScoped.filter(isOrgScopedEntry) as OrgScopedEntry[])
    : [];
  const workItemScoped = Array.isArray(body.workItemScoped)
    ? (body.workItemScoped.filter(
        isWorkItemScopedEntry,
      ) as WorkItemScopedEntry[])
    : [];

  const result = tenantStore.legacyUpload({
    orgs,
    workItems,
    orgScoped,
    workItemScoped,
  });
  res.json({ accepted: result });
});

export default router;
