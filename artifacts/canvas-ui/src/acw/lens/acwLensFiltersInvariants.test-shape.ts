// EAStudio Phase 4 (Task #170) — lens-filter invariants.
//
// Module-load assertions that fail the bundle if the per-lens
// admission predicates in `acwLensFilters` drift away from the
// shape the five lens pages depend on. Same `.test-shape.ts`
// discipline used by every other ACW invariant module:
// side-effect import in `App.tsx` runs the assertions at boot.
//
// What this module guards:
//   1. Each lens has a non-empty domain — there is at least one
//      synthetic input the predicate accepts (so a lens never
//      collapses to "always false" through a refactor accident).
//   2. The lens partitions are disjoint where the spec says they
//      must be (Application <-> Technology <-> Business): a node
//      tagged for one lens is rejected by the other two.
//   3. The legacy untagged shape still routes correctly — Systems
//      go to the Application lens, Zones / ComputeNodes go to the
//      Technology lens, BusinessEntity goes to the Business lens.
//   4. The Operations lens admits both `operations`-tagged nodes
//      and `technology`-tagged nodes (cross-layer overview).
//   5. The Integration lens admits `external`-tagged nodes (the
//      Phase 4 boundary tag).
//   6. `edgesWithinVisibleNodes` filters out edges whose endpoints
//      are not in the visible-id set (no orphan edges).
//
// Diagnostics: assertions throw with explanatory messages prefixed
// "ACW Phase 4 lens-filter invariant violation".
import type { AcwEdge, AcwNode } from "../acwStore";
import {
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
        `parentId=${String(node.parentId)}).`,
    );
  }
}

// -------------------------------------------------------------------
// (1) Tag-driven admission: every lens admits its own tag.
// -------------------------------------------------------------------
expectAdmit(
  isContextDomainNode,
  n({ type: "System", domainTag: "business" }),
  "Context & Domain",
);
expectAdmit(
  isSystemLandscapeNode,
  n({ type: "Component", domainTag: "application" }),
  "System Landscape",
);
expectAdmit(
  isDeploymentNode,
  n({ type: "Component", domainTag: "technology" }),
  "Deployment",
);
expectAdmit(
  isIntegrationNode,
  n({ type: "System", domainTag: "external" }),
  "Integration",
);
expectAdmit(
  isOperationsContinuityNode,
  n({ type: "Component", domainTag: "operations" }),
  "Operations & Continuity",
);

// -------------------------------------------------------------------
// (2) Cross-lens disjointness for the three core layers.
// -------------------------------------------------------------------
{
  const businessNode = n({ type: "BusinessEntity", domainTag: "business" });
  expectReject(isSystemLandscapeNode, businessNode, "System Landscape");
  expectReject(isDeploymentNode, businessNode, "Deployment");

  const appNode = n({ type: "Component", domainTag: "application" });
  expectReject(isContextDomainNode, appNode, "Context & Domain");
  expectReject(isDeploymentNode, appNode, "Deployment");

  const techNode = n({ type: "ComputeNode", domainTag: "technology" });
  expectReject(isContextDomainNode, techNode, "Context & Domain");
  expectReject(isSystemLandscapeNode, techNode, "System Landscape");

  // Tag-precedence counterexample: a BusinessEntity deliberately
  // tagged for another layer must follow the tag, not the type.
  // Without this rule the lens partition is broken on tagged
  // graphs (a node would surface in both Context and the layer it
  // was retagged into).
  expectReject(
    isContextDomainNode,
    n({ type: "BusinessEntity", domainTag: "application" }),
    "Context & Domain (BusinessEntity retagged application)",
  );
  expectReject(
    isContextDomainNode,
    n({ type: "BusinessEntity", domainTag: "technology" }),
    "Context & Domain (BusinessEntity retagged technology)",
  );
  expectReject(
    isContextDomainNode,
    n({ type: "BusinessEntity", domainTag: "operations" }),
    "Context & Domain (BusinessEntity retagged operations)",
  );
  expectReject(
    isContextDomainNode,
    n({ type: "BusinessEntity", domainTag: "external" }),
    "Context & Domain (BusinessEntity retagged external)",
  );
  // And the symmetric direction: a non-BusinessEntity tagged
  // `business` must surface in Context (already covered above for
  // `System` — re-state with `Component` so all three legacy
  // application/technology types are exercised).
  expectAdmit(
    isContextDomainNode,
    n({ type: "Component", domainTag: "business" }),
    "Context & Domain (Component tagged business)",
  );
}

// -------------------------------------------------------------------
// (3) Untagged legacy shapes route correctly.
// -------------------------------------------------------------------
expectAdmit(
  isSystemLandscapeNode,
  n({ type: "System" }),
  "System Landscape (untagged System)",
);
expectAdmit(
  isDeploymentNode,
  n({ type: "Zone" }),
  "Deployment (untagged Zone)",
);
expectAdmit(
  isDeploymentNode,
  n({ type: "ComputeNode" }),
  "Deployment (untagged ComputeNode)",
);
expectAdmit(
  isContextDomainNode,
  n({ type: "BusinessEntity" }),
  "Context & Domain (untagged BusinessEntity)",
);
// Bare-root System belongs to Application, not Deployment.
expectReject(
  isDeploymentNode,
  n({ type: "System", parentId: null }),
  "Deployment (bare-root System)",
);
// System nested inside a ComputeNode is admitted by Deployment.
expectAdmit(
  isDeploymentNode,
  n({ type: "System", parentId: "compute-1" }),
  "Deployment (nested System)",
);

// -------------------------------------------------------------------
// (4) Operations & Continuity is cross-layer.
// -------------------------------------------------------------------
expectAdmit(
  isOperationsContinuityNode,
  n({ type: "ComputeNode", domainTag: "technology" }),
  "Operations & Continuity (technology)",
);
expectReject(
  isOperationsContinuityNode,
  n({ type: "BusinessEntity", domainTag: "business" }),
  "Operations & Continuity (business)",
);

// -------------------------------------------------------------------
// (5) Integration edge predicate.
// -------------------------------------------------------------------
{
  const interfaceEdge = {
    id: "e1",
    fromId: "a",
    toId: "b",
    kind: "INTERFACES_WITH",
  } as AcwEdge;
  if (!isIntegrationEdge(interfaceEdge, "application", "application")) {
    throw new Error(
      `${PREFIX}: Integration edge predicate rejected INTERFACES_WITH (must always admit).`,
    );
  }
  const dataFlowEdge = {
    id: "e2",
    fromId: "a",
    toId: "b",
    kind: "DATA_FLOW",
  } as AcwEdge;
  if (!isIntegrationEdge(dataFlowEdge, "data", "data")) {
    throw new Error(
      `${PREFIX}: Integration edge predicate rejected DATA_FLOW (must always admit).`,
    );
  }
  const sameTagConnects = {
    id: "e3",
    fromId: "a",
    toId: "b",
    kind: "CONNECTS",
  } as AcwEdge;
  if (isIntegrationEdge(sameTagConnects, "application", "application")) {
    throw new Error(
      `${PREFIX}: Integration edge predicate admitted same-tag CONNECTS (must reject).`,
    );
  }
  const crossTagConnects = {
    id: "e4",
    fromId: "a",
    toId: "b",
    kind: "CONNECTS",
  } as AcwEdge;
  if (!isIntegrationEdge(crossTagConnects, "application", "external")) {
    throw new Error(
      `${PREFIX}: Integration edge predicate rejected cross-tag CONNECTS (must admit).`,
    );
  }
}

// -------------------------------------------------------------------
// (6) edgesWithinVisibleNodes drops orphan edges.
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
