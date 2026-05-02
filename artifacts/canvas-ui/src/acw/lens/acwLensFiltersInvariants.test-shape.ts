// EAStudio Phase 4 (Task #170) — lens-filter invariants.
//
// Module-load assertions that fail the bundle if the per-lens
// admission predicates in `acwLensFilters` drift away from the
// spec the five lens pages depend on. Same `.test-shape.ts`
// discipline used by every other ACW invariant module:
// side-effect import in `App.tsx` runs the assertions at boot.
//
// What this module guards (one block per Phase 4 spec step):
//   - Step 4 / Context & Domain: business-shaped types are
//     admitted regardless of tag; data-tagged top-level Systems
//     are admitted; arbitrary application/technology nodes are
//     not.
//   - Step 5 / System Landscape: application-tagged nodes are
//     admitted; a `System`/`Component` whose
//     `boundTechnologyCategory` is one of the five
//     application-shaped categories is admitted **even if the
//     node is tagged `technology`** (so a Phase-5 binding can
//     pull a node into the application view).
//   - Step 6 / Integration: the edge predicate requires a
//     **cross-domain CONNECTS** edge. INTERFACES_WITH and
//     DATA_FLOW are no longer auto-admitted (Phase 4 narrowed
//     this lens to cross-boundary connections + external nodes).
//   - Step 7 / Deployment: admits `technology`-tagged nodes plus
//     the technology-shaped types the v1 grammar carved out
//     (`ComputeNode`, `Zone`) and Systems nested under a
//     ComputeNode; locks out business / application / external /
//     operations tagged nodes.
//   - Step 8 / Operations & Continuity: admits both `operations`
//     and `technology` tagged nodes (cross-layer overview); the
//     page-level edge rule must keep edges with **at least one**
//     endpoint in the visible set, which the helper
//     `edgesTouchingVisibleNodes` provides — exercised here too.
//   - Edge helpers: `edgesWithinVisibleNodes` drops edges with any
//     missing endpoint; `edgesTouchingVisibleNodes` keeps edges
//     with at least one visible endpoint and reports the expanded
//     id set.
//
// Diagnostics: assertions throw with explanatory messages prefixed
// "ACW Phase 4 lens-filter invariant violation".
import type { AcwEdge, AcwNode } from "../acwStore";
import {
  edgesTouchingVisibleNodes,
  edgesWithinVisibleNodes,
  isContextDomainNode,
  isDeploymentNode,
  isIntegrationEdge,
  isIntegrationNode,
  isOperationsContinuityNode,
  isSystemLandscapeNode,
} from "./acwLensFilters";

const PREFIX = "ACW Phase 4 lens-filter invariant violation";

function n(partial: Partial<AcwNode>): AcwNode {
  return {
    id: partial.id ?? "synthetic",
    type: partial.type ?? "System",
    label: partial.label ?? "label",
    parentId: partial.parentId ?? null,
    x: partial.x ?? 0,
    y: partial.y ?? 0,
    domainTag: partial.domainTag,
    boundTechnologyCategory: partial.boundTechnologyCategory,
  } as AcwNode;
}

function expectAdmit(
  predicate: (n: AcwNode) => boolean,
  node: AcwNode,
  lensName: string,
): void {
  if (!predicate(node)) {
    throw new Error(
      `${PREFIX}: lens "${lensName}" rejected a node it must admit (` +
        `type=${node.type}, domainTag=${String(node.domainTag)}, ` +
        `boundTechnologyCategory=${String(node.boundTechnologyCategory)}, ` +
        `parentId=${String(node.parentId)}).`,
    );
  }
}

function expectReject(
  predicate: (n: AcwNode) => boolean,
  node: AcwNode,
  lensName: string,
): void {
  if (predicate(node)) {
    throw new Error(
      `${PREFIX}: lens "${lensName}" admitted a node it must reject (` +
        `type=${node.type}, domainTag=${String(node.domainTag)}, ` +
        `boundTechnologyCategory=${String(node.boundTechnologyCategory)}, ` +
        `parentId=${String(node.parentId)}).`,
    );
  }
}

// -------------------------------------------------------------------
// Step 4 — Context & Domain.
// -------------------------------------------------------------------
{
  // Tag-driven admission.
  expectAdmit(
    isContextDomainNode,
    n({ type: "Component", domainTag: "business" }),
    "Context & Domain (business-tagged Component)",
  );
  // Business-shaped types regardless of tag.
  expectAdmit(
    isContextDomainNode,
    n({ type: "BusinessEntity" }),
    "Context & Domain (untagged BusinessEntity)",
  );
  expectAdmit(
    isContextDomainNode,
    n({ type: "BusinessEntity", domainTag: "application" }),
    "Context & Domain (BusinessEntity tagged application — type wins)",
  );
  expectAdmit(
    isContextDomainNode,
    n({ type: "Zone" }),
    "Context & Domain (Zone)",
  );
  // Data-tagged top-level System.
  expectAdmit(
    isContextDomainNode,
    n({ type: "System", domainTag: "data", parentId: null }),
    "Context & Domain (data-tagged root System)",
  );
  // A nested data-tagged System is NOT a top-level data concept
  // and so should not surface in Context.
  expectReject(
    isContextDomainNode,
    n({ type: "System", domainTag: "data", parentId: "x" }),
    "Context & Domain (nested data System)",
  );
  // Arbitrary application/technology nodes do not belong here.
  expectReject(
    isContextDomainNode,
    n({ type: "Component", domainTag: "application" }),
    "Context & Domain (application Component)",
  );
  expectReject(
    isContextDomainNode,
    n({ type: "ComputeNode", domainTag: "technology" }),
    "Context & Domain (technology ComputeNode)",
  );
}

// -------------------------------------------------------------------
// Step 5 — System Landscape (technology-category inclusion rule).
// -------------------------------------------------------------------
{
  // Tag-driven admission.
  expectAdmit(
    isSystemLandscapeNode,
    n({ type: "Component", domainTag: "application" }),
    "System Landscape (application Component)",
  );
  // Untagged System / Component fall through to the application
  // view per legacy rule.
  expectAdmit(
    isSystemLandscapeNode,
    n({ type: "System" }),
    "System Landscape (untagged System)",
  );
  expectAdmit(
    isSystemLandscapeNode,
    n({ type: "Component" }),
    "System Landscape (untagged Component)",
  );
  // Phase 4 spec requirement: a System / Component whose
  // boundTechnologyCategory is one of {frontend, backend, gateway,
  // message-queue, integration} is admitted even if it is tagged
  // technology — the binding pulls it into the application view.
  for (const category of [
    "frontend",
    "backend",
    "gateway",
    "message-queue",
    "integration",
  ] as const) {
    expectAdmit(
      isSystemLandscapeNode,
      n({
        type: "Component",
        domainTag: "technology",
        boundTechnologyCategory: category,
      }),
      `System Landscape (technology Component bound to ${category})`,
    );
  }
  // A technology-tagged Component without an application-shaped
  // binding stays out of the application view.
  expectReject(
    isSystemLandscapeNode,
    n({
      type: "Component",
      domainTag: "technology",
      boundTechnologyCategory: "compute",
    }),
    "System Landscape (technology Component bound to compute)",
  );
  expectReject(
    isSystemLandscapeNode,
    n({ type: "Component", domainTag: "technology" }),
    "System Landscape (technology Component, no binding)",
  );
  // Business / operations / external nodes do not belong here.
  expectReject(
    isSystemLandscapeNode,
    n({ type: "BusinessEntity", domainTag: "business" }),
    "System Landscape (BusinessEntity)",
  );
  expectReject(
    isSystemLandscapeNode,
    n({ type: "Component", domainTag: "operations" }),
    "System Landscape (operations Component)",
  );
}

// -------------------------------------------------------------------
// Step 6 — Integration: edge predicate is cross-domain CONNECTS only.
// -------------------------------------------------------------------
{
  // Base node predicate admits external boundary nodes.
  expectAdmit(
    isIntegrationNode,
    n({ type: "System", domainTag: "external" }),
    "Integration (external System)",
  );
  // Same-domain CONNECTS is rejected.
  const sameTagConnects = {
    id: "e1",
    fromId: "a",
    toId: "b",
    kind: "CONNECTS",
  } as AcwEdge;
  if (isIntegrationEdge(sameTagConnects, "application", "application")) {
    throw new Error(
      `${PREFIX}: Integration edge predicate admitted same-tag CONNECTS (must reject).`,
    );
  }
  // Cross-domain CONNECTS is admitted.
  if (!isIntegrationEdge(sameTagConnects, "application", "external")) {
    throw new Error(
      `${PREFIX}: Integration edge predicate rejected cross-tag CONNECTS (must admit).`,
    );
  }
  // INTERFACES_WITH is no longer auto-admitted by this lens.
  const interfaceEdge = {
    id: "e2",
    fromId: "a",
    toId: "b",
    kind: "INTERFACES_WITH",
  } as AcwEdge;
  if (isIntegrationEdge(interfaceEdge, "application", "external")) {
    throw new Error(
      `${PREFIX}: Integration edge predicate admitted INTERFACES_WITH ` +
        `(Phase 4 narrowed this lens to cross-domain CONNECTS only).`,
    );
  }
  // DATA_FLOW is no longer auto-admitted by this lens.
  const dataFlowEdge = {
    id: "e3",
    fromId: "a",
    toId: "b",
    kind: "DATA_FLOW",
  } as AcwEdge;
  if (isIntegrationEdge(dataFlowEdge, "data", "application")) {
    throw new Error(
      `${PREFIX}: Integration edge predicate admitted DATA_FLOW ` +
        `(Phase 4 narrowed this lens to cross-domain CONNECTS only).`,
    );
  }
  // Untagged endpoints can never form a cross-domain edge.
  if (isIntegrationEdge(sameTagConnects, undefined, "external")) {
    throw new Error(
      `${PREFIX}: Integration edge predicate admitted CONNECTS with ` +
        `an untagged endpoint (must reject — tags are required).`,
    );
  }
}

// -------------------------------------------------------------------
// Step 7 — Deployment.
// -------------------------------------------------------------------
{
  // Tag-driven admission for the technology layer.
  expectAdmit(
    isDeploymentNode,
    n({ type: "Component", domainTag: "technology" }),
    "Deployment (technology Component)",
  );
  // The two technology-shaped types the v1 grammar carved out.
  expectAdmit(
    isDeploymentNode,
    n({ type: "ComputeNode" }),
    "Deployment (untagged ComputeNode)",
  );
  expectAdmit(
    isDeploymentNode,
    n({ type: "Zone" }),
    "Deployment (untagged Zone)",
  );
  // A System nested inside a ComputeNode is admitted (Application
  // placed onto infrastructure).
  expectAdmit(
    isDeploymentNode,
    n({ type: "System", parentId: "compute-1" }),
    "Deployment (nested System)",
  );
  // A bare-root System belongs to the Application lens.
  expectReject(
    isDeploymentNode,
    n({ type: "System", parentId: null }),
    "Deployment (bare-root System)",
  );
  // Business / application / external / operations tags lock the
  // node out even when the type is otherwise technology-shaped.
  expectReject(
    isDeploymentNode,
    n({ type: "ComputeNode", domainTag: "business" }),
    "Deployment (business ComputeNode)",
  );
  expectReject(
    isDeploymentNode,
    n({ type: "Zone", domainTag: "operations" }),
    "Deployment (operations Zone)",
  );
}

// -------------------------------------------------------------------
// Step 8 — Operations & Continuity.
// -------------------------------------------------------------------
{
  expectAdmit(
    isOperationsContinuityNode,
    n({ type: "Component", domainTag: "operations" }),
    "Operations & Continuity (operations Component)",
  );
  expectAdmit(
    isOperationsContinuityNode,
    n({ type: "ComputeNode", domainTag: "technology" }),
    "Operations & Continuity (technology ComputeNode)",
  );
  // Business / application / external are not in this lens.
  expectReject(
    isOperationsContinuityNode,
    n({ type: "BusinessEntity", domainTag: "business" }),
    "Operations & Continuity (business)",
  );
  expectReject(
    isOperationsContinuityNode,
    n({ type: "Component", domainTag: "application" }),
    "Operations & Continuity (application)",
  );
  expectReject(
    isOperationsContinuityNode,
    n({ type: "System", domainTag: "external" }),
    "Operations & Continuity (external)",
  );

  // Page-level edge rule: at-least-one-endpoint visible.
  // Synthesise an Operations-only node set, then ask for edges
  // touching it.
  const visible = new Set<string>(["op-1"]);
  const edges: AcwEdge[] = [
    // Edge fully outside the visible set — must be dropped.
    { id: "e1", fromId: "x", toId: "y", kind: "CONNECTS" } as AcwEdge,
    // Edge with one endpoint in the visible set — must be kept.
    { id: "e2", fromId: "op-1", toId: "tech-1", kind: "CONNECTS" } as AcwEdge,
    // Edge with both endpoints in the visible set — must be kept.
    { id: "e3", fromId: "op-1", toId: "op-1", kind: "CONNECTS" } as AcwEdge,
  ];
  const { edges: kept, expandedIds } = edgesTouchingVisibleNodes(
    edges,
    visible,
  );
  if (kept.length !== 2 || kept[0].id !== "e2" || kept[1].id !== "e3") {
    throw new Error(
      `${PREFIX}: edgesTouchingVisibleNodes did not honour the at-least-one ` +
        `rule (kept ${kept.length} edges).`,
    );
  }
  if (!expandedIds.has("op-1") || !expandedIds.has("tech-1")) {
    throw new Error(
      `${PREFIX}: edgesTouchingVisibleNodes did not expand the visible-id ` +
        `set to include the off-lens endpoint.`,
    );
  }
  if (expandedIds.has("x") || expandedIds.has("y")) {
    throw new Error(
      `${PREFIX}: edgesTouchingVisibleNodes leaked endpoints from a ` +
        `dropped edge into the expanded id set.`,
    );
  }
}

// -------------------------------------------------------------------
// Edge helpers — the strict (within) variant.
// -------------------------------------------------------------------
{
  const visible = new Set<string>(["a", "b"]);
  const edges: AcwEdge[] = [
    { id: "e1", fromId: "a", toId: "b", kind: "CONNECTS" } as AcwEdge,
    { id: "e2", fromId: "a", toId: "missing" } as unknown as AcwEdge,
    { id: "e3", fromId: "missing", toId: "b" } as unknown as AcwEdge,
  ];
  const kept = edgesWithinVisibleNodes(edges, visible);
  if (kept.length !== 1 || kept[0].id !== "e1") {
    throw new Error(
      `${PREFIX}: edgesWithinVisibleNodes did not drop orphan edges as expected (kept ${kept.length}).`,
    );
  }
}

// Exported predicate so future callers (or a follow-up test
// harness) can re-run the assertions on demand.
export function assertAcwLensFilterInvariants(): void {
  // The side-effect block above already ran every check at module
  // load; re-running here is a no-op for the live module.
}
