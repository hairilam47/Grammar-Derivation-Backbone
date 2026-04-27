// EAStudio Path B Phase 2 (LoS framework) — L3 generator behaviour
// invariants.
//
// Module-load assertions that fail the bundle if the L3 generator
// regresses on any of the constitutional guarantees:
//
//   1. Idempotency — calling the generator N times produces a
//      workspace byte-equivalent to calling it once.
//   2. lodRange contract — every minted node carries
//      `lodRange: [3, 3]` so it is visible only at L3.
//   3. L2 parentage — every minted node is parented to an existing
//      L2 ACW node that carried the originating `boundParam`. The
//      generator never invents a parent.
//   4. Stable id contract — every minted node id matches
//      `l3:<architectureId>:<parentNodeId>:<sectionId>:<paramId>`, so re-running
//      after a CTAD value flip produces the same id set (and the
//      collision shortcut keeps the workspace byte-stable).
//   5. No orphan recreate — when an L2 origin is deleted between
//      runs, the generator does NOT re-mint that L2 node's L3
//      child on the next call (the cascading delete in
//      `deleteNode` removes the child, and the next L3 entry must
//      not bring it back, since the originating boundParam is now
//      gone).
//   6. No containment cycle — the generator never creates a
//      parent → child link that would close a containment cycle.
//
// These probes touch the singleton acwStore + the singleton CTAD
// store. They snapshot both keys before each fixture and restore
// them in a `finally`, so probe execution is invisible to the
// running app.
import {
  __acwStoreInternals,
  ACW_SCHEMA_VERSION,
} from "../acwStore";
import { generateL3Nodes, __l3GeneratorInternals } from "./l3Generator";

const PREFIX = "ACW L3 generator invariant violation";
const ACW_STORE_KEY = "acw.workspace.v1";
const CTAD_STORE_KEY = "ctad.state.v1";
const ARCH_ID = "arch-probe-deadbeef";

interface SnapshotPair {
  readonly acw: string | null;
  readonly ctad: string | null;
}

function snapshotStorage(): SnapshotPair {
  if (typeof window === "undefined") return { acw: null, ctad: null };
  return {
    acw: window.localStorage.getItem(ACW_STORE_KEY),
    ctad: window.localStorage.getItem(CTAD_STORE_KEY),
  };
}

function restoreStorage(snap: SnapshotPair): void {
  if (typeof window === "undefined") return;
  if (snap.acw === null) {
    window.localStorage.removeItem(ACW_STORE_KEY);
  } else {
    window.localStorage.setItem(ACW_STORE_KEY, snap.acw);
  }
  if (snap.ctad === null) {
    window.localStorage.removeItem(CTAD_STORE_KEY);
  } else {
    window.localStorage.setItem(CTAD_STORE_KEY, snap.ctad);
  }
  __acwStoreInternals.reloadFromStorageForTest();
  __l3GeneratorInternals.resetMemoForTest();
}

// Build a workspace seeded with:
//   - the four sealed domain containers (so the validator's parent
//     rules are exercised against the same shape the live shell
//     uses),
//   - one Zone parented to `domain-technology` carrying a
//     `boundParam` of (infrastructure, hostingModel) — this is the
//     L2 origin under test,
//   - one Zone parented to `domain-technology` carrying a
//     `boundParam` of (infrastructure, databaseClass) — the
//     second L2 origin.
// The Zones are chosen because the projected child types
// (ComputeNode for hostingModel; Component for databaseClass)
// both accept Zone as a permitted parent (see ACW_CONTAINMENT_RULES
// in acwGrammar.ts), so the validator does not refuse the L3
// child and the probe can assert end-to-end behaviour.
function seedWorkspace(): void {
  const ws = {
    schemaVersion: ACW_SCHEMA_VERSION,
    structureGraph: {
      nodes: [
        {
          id: "domain-business",
          type: "BusinessEntity",
          parentId: null,
          label: "Business",
          x: 200,
          y: 200,
          isDomainContainer: true,
          domainTag: "business",
        },
        {
          id: "domain-data",
          type: "Zone",
          parentId: null,
          label: "Data",
          x: 800,
          y: 200,
          isDomainContainer: true,
          domainTag: "data",
        },
        {
          id: "domain-application",
          type: "Zone",
          parentId: null,
          label: "Application",
          x: 200,
          y: 800,
          isDomainContainer: true,
          domainTag: "application",
        },
        {
          id: "domain-technology",
          type: "Zone",
          parentId: null,
          label: "Technology",
          x: 800,
          y: 800,
          isDomainContainer: true,
          domainTag: "technology",
        },
        {
          id: "l2-host",
          type: "Zone",
          parentId: "domain-technology",
          label: "Host zone",
          x: 850,
          y: 850,
          domainTag: "technology",
          boundParam: {
            sectionId: "infrastructure",
            paramId: "hostingModel",
            optionValue: "kubernetes",
          },
        },
        {
          id: "l2-db",
          type: "Zone",
          parentId: "domain-technology",
          label: "DB zone",
          x: 950,
          y: 850,
          domainTag: "technology",
          boundParam: {
            sectionId: "infrastructure",
            paramId: "databaseClass",
            optionValue: "Relational",
          },
        },
      ],
      edges: [],
    },
  };
  window.localStorage.setItem(ACW_STORE_KEY, JSON.stringify(ws));
  __acwStoreInternals.reloadFromStorageForTest();

  const ctadDoc = {
    schemaVersion: "ctad-1.0",
    bindings: {},
    architectures: {
      [ARCH_ID]: {
        architectureId: ARCH_ID,
        architectureName: "Probe",
        params: {
          hostingModel: "kubernetes",
          databaseClass: "Relational",
        },
        environments: [],
        createdAt: "",
        updatedAt: "",
      },
    },
  };
  window.localStorage.setItem(CTAD_STORE_KEY, JSON.stringify(ctadDoc));
}

if (typeof window !== "undefined") {
  const snap = snapshotStorage();
  try {
    // ------------------------------------------------------------
    // Fixture A — empty workspace, no L2 origins. Generator must
    // no-op; nothing is minted.
    // ------------------------------------------------------------
    window.localStorage.removeItem(ACW_STORE_KEY);
    window.localStorage.removeItem(CTAD_STORE_KEY);
    __acwStoreInternals.reloadFromStorageForTest();
    __l3GeneratorInternals.resetMemoForTest();
    const emptyWs = {
      schemaVersion: ACW_SCHEMA_VERSION,
      structureGraph: { nodes: [], edges: [] },
    };
    window.localStorage.setItem(ACW_STORE_KEY, JSON.stringify(emptyWs));
    __acwStoreInternals.reloadFromStorageForTest();
    const ctadDoc = {
      schemaVersion: "ctad-1.0",
      bindings: {},
      architectures: {
        [ARCH_ID]: {
          architectureId: ARCH_ID,
          architectureName: "Probe",
          params: {
            hostingModel: "kubernetes",
            databaseClass: "Relational",
          },
          environments: [],
          createdAt: "",
          updatedAt: "",
        },
      },
    };
    window.localStorage.setItem(CTAD_STORE_KEY, JSON.stringify(ctadDoc));
    const beforeA = __acwStoreInternals.serializeForTest();
    const consideredA = generateL3Nodes(ARCH_ID);
    const afterA = __acwStoreInternals.serializeForTest();
    if (beforeA !== afterA) {
      throw new Error(
        `${PREFIX}: generator mutated the workspace despite no L2 origins (no boundParam-carrying nodes).`,
      );
    }
    if (consideredA.length !== 0) {
      throw new Error(
        `${PREFIX}: generator returned ids despite no L2 origins (got ${consideredA.length}).`,
      );
    }

    // ------------------------------------------------------------
    // Fixture B — seeded workspace with two L2 origins. Generator
    // must mint exactly two children, each parented to its own L2
    // origin, each carrying [3, 3], each with the deterministic
    // id format. Subsequent runs are byte-identical no-ops.
    // ------------------------------------------------------------
    seedWorkspace();
    __l3GeneratorInternals.resetMemoForTest();
    const beforeFirst = __acwStoreInternals.serializeForTest();
    const considered1 = generateL3Nodes(ARCH_ID);
    const afterFirst = __acwStoreInternals.serializeForTest();
    if (beforeFirst === afterFirst) {
      throw new Error(
        `${PREFIX}: generator wrote nothing despite two valid L2 origins.`,
      );
    }
    if (considered1.length !== 2) {
      throw new Error(
        `${PREFIX}: generator considered ${considered1.length} ids; expected 2 (host + db).`,
      );
    }
    interface NodeShape {
      readonly id: string;
      readonly parentId: string | null;
      readonly type: string;
      readonly label: string;
      readonly lodRange?: readonly [number, number];
    }
    const parsed = JSON.parse(afterFirst) as {
      structureGraph: { nodes: ReadonlyArray<NodeShape> };
    };
    const byId = new Map(
      parsed.structureGraph.nodes.map((n) => [n.id, n] as const),
    );
    // Stable id contract per spec.
    const expectedHostId = `l3:${ARCH_ID}:l2-host:infrastructure:hostingModel`;
    const expectedDbId = `l3:${ARCH_ID}:l2-db:infrastructure:databaseClass`;
    if (!byId.has(expectedHostId)) {
      throw new Error(
        `${PREFIX}: missing host L3 node at id "${expectedHostId}".`,
      );
    }
    if (!byId.has(expectedDbId)) {
      throw new Error(`${PREFIX}: missing db L3 node at id "${expectedDbId}".`);
    }
    // Closed mapping table — element type and label.
    //   * (infrastructure, hostingModel="kubernetes") → ComputeNode
    //     "Kubernetes cluster". Any other value emits nothing.
    //   * (infrastructure, databaseClass) → Component labelled with
    //     the chosen option value VERBATIM.
    const hostNode = byId.get(expectedHostId)!;
    if (hostNode.type !== "ComputeNode") {
      throw new Error(
        `${PREFIX}: host L3 node has wrong type "${hostNode.type}" (expected "ComputeNode").`,
      );
    }
    if (hostNode.label !== "Kubernetes cluster") {
      throw new Error(
        `${PREFIX}: host L3 node has wrong label "${hostNode.label}" (expected "Kubernetes cluster" for hostingModel="kubernetes").`,
      );
    }
    const dbNode = byId.get(expectedDbId)!;
    if (dbNode.type !== "Component") {
      throw new Error(
        `${PREFIX}: db L3 node has wrong type "${dbNode.type}" (expected "Component").`,
      );
    }
    if (dbNode.label !== "Relational") {
      throw new Error(
        `${PREFIX}: db L3 node label "${dbNode.label}" must equal the chosen databaseClass option verbatim ("Relational"); no suffix or transformation is permitted.`,
      );
    }
    // L2 parentage + lodRange contract.
    for (const id of considered1) {
      const n = byId.get(id);
      if (n === undefined) {
        throw new Error(
          `${PREFIX}: minted id "${id}" did not land in the workspace.`,
        );
      }
      const parent = n.parentId === null ? undefined : byId.get(n.parentId);
      if (parent === undefined) {
        throw new Error(
          `${PREFIX}: minted id "${id}" has no parent in the workspace (parentId="${String(n.parentId)}").`,
        );
      }
      if (n.parentId !== "l2-host" && n.parentId !== "l2-db") {
        throw new Error(
          `${PREFIX}: minted id "${id}" is not parented to its originating L2 node (got "${String(n.parentId)}").`,
        );
      }
      if (
        !Array.isArray(n.lodRange) ||
        n.lodRange.length !== 2 ||
        n.lodRange[0] !== 3 ||
        n.lodRange[1] !== 3
      ) {
        throw new Error(
          `${PREFIX}: minted id "${id}" did not carry lodRange [3, 3] (got ${JSON.stringify(n.lodRange)}).`,
        );
      }
    }
    // Idempotency: rerun produces the same workspace bytes and id set.
    __l3GeneratorInternals.resetMemoForTest();
    const considered2 = generateL3Nodes(ARCH_ID);
    const afterSecond = __acwStoreInternals.serializeForTest();
    if (afterFirst !== afterSecond) {
      throw new Error(
        `${PREFIX}: a second generator run mutated the workspace (idempotency broken).`,
      );
    }
    if (considered2.length !== considered1.length) {
      throw new Error(
        `${PREFIX}: a second generator run returned a different id count (${considered2.length} vs ${considered1.length}).`,
      );
    }

    // ------------------------------------------------------------
    // Fixture C — no containment cycle. The generator's child id
    // must never coincide with any ancestor id (would create a
    // self-cycle), and its parent chain must terminate at a root.
    // ------------------------------------------------------------
    for (const id of considered1) {
      const n = byId.get(id);
      if (n === undefined) continue;
      let cursor: string | null = n.parentId;
      let guard = 0;
      const seen = new Set<string>([id]);
      while (cursor !== null && guard < 64) {
        if (seen.has(cursor)) {
          throw new Error(
            `${PREFIX}: minted id "${id}" closes a containment cycle through "${cursor}".`,
          );
        }
        seen.add(cursor);
        const ancestor = byId.get(cursor);
        if (ancestor === undefined) break;
        cursor = ancestor.parentId;
        guard += 1;
      }
    }

    // ------------------------------------------------------------
    // Fixture D — no orphan recreate. Re-seed the workspace
    // WITHOUT the `l2-host` L2 origin AND without the previously
    // minted host L3 child (i.e. simulate a user having
    // structurally removed the boundParam origin and its child).
    // The next generator run must NOT re-mint the host L3 child,
    // because the originating boundParam is now gone.
    // ------------------------------------------------------------
    const wsAfterPrune = JSON.parse(afterFirst) as {
      schemaVersion: typeof ACW_SCHEMA_VERSION;
      structureGraph: {
        nodes: ReadonlyArray<NodeShape>;
        edges: ReadonlyArray<unknown>;
      };
    };
    const prunedNodes = wsAfterPrune.structureGraph.nodes.filter(
      (n) => n.id !== "l2-host" && n.id !== expectedHostId,
    );
    const prunedWs = {
      schemaVersion: wsAfterPrune.schemaVersion,
      structureGraph: {
        nodes: prunedNodes,
        edges: wsAfterPrune.structureGraph.edges,
      },
    };
    window.localStorage.setItem(ACW_STORE_KEY, JSON.stringify(prunedWs));
    __acwStoreInternals.reloadFromStorageForTest();
    __l3GeneratorInternals.resetMemoForTest();
    const considered3 = generateL3Nodes(ARCH_ID);
    const afterDelete = __acwStoreInternals.serializeForTest();
    const parsedAfterDelete = JSON.parse(afterDelete) as {
      structureGraph: { nodes: ReadonlyArray<NodeShape> };
    };
    const byIdAfterDelete = new Map(
      parsedAfterDelete.structureGraph.nodes.map((n) => [n.id, n] as const),
    );
    if (byIdAfterDelete.has(expectedHostId)) {
      throw new Error(
        `${PREFIX}: orphan recreate — host L3 child reappeared after its L2 origin was removed.`,
      );
    }
    for (const id of considered3) {
      if (id === expectedHostId) {
        throw new Error(
          `${PREFIX}: orphan recreate — generator returned the now-orphaned host id in its considered set.`,
        );
      }
    }
    // The db L3 child (whose origin still exists) MUST still be
    // present and continue to be considered on this run.
    if (!byIdAfterDelete.has(expectedDbId)) {
      throw new Error(
        `${PREFIX}: db L3 child disappeared after pruning a different L2 origin.`,
      );
    }

    // ------------------------------------------------------------
    // Fixture E — closed-mapping skip. Re-seed with a hostingModel
    // value OUTSIDE the closed set ("On-prem", a registered option
    // but not "kubernetes"). The host L2 origin still carries a
    // boundParam, but the mapping table refuses to mint anything
    // for it, so no host L3 child must appear in the workspace
    // and the considered set must NOT include the host id.
    // ------------------------------------------------------------
    window.localStorage.removeItem(ACW_STORE_KEY);
    window.localStorage.removeItem(CTAD_STORE_KEY);
    __acwStoreInternals.reloadFromStorageForTest();
    seedWorkspace();
    const ctadDocSkip = {
      schemaVersion: "ctad-1.0",
      bindings: {},
      architectures: {
        [ARCH_ID]: {
          architectureId: ARCH_ID,
          architectureName: "Probe",
          params: {
            hostingModel: "On-prem",
            databaseClass: "Document",
          },
          environments: [],
          createdAt: "",
          updatedAt: "",
        },
      },
    };
    window.localStorage.setItem(CTAD_STORE_KEY, JSON.stringify(ctadDocSkip));
    __l3GeneratorInternals.resetMemoForTest();
    const consideredSkip = generateL3Nodes(ARCH_ID);
    const afterSkip = __acwStoreInternals.serializeForTest();
    const parsedSkip = JSON.parse(afterSkip) as {
      structureGraph: { nodes: ReadonlyArray<NodeShape> };
    };
    const byIdSkip = new Map(
      parsedSkip.structureGraph.nodes.map((n) => [n.id, n] as const),
    );
    if (byIdSkip.has(expectedHostId)) {
      throw new Error(
        `${PREFIX}: closed-mapping skip — host L3 child was minted despite hostingModel="On-prem" (only "kubernetes" is in the closed set).`,
      );
    }
    if (consideredSkip.includes(expectedHostId)) {
      throw new Error(
        `${PREFIX}: closed-mapping skip — generator returned the host id even though the mapping refused to label it.`,
      );
    }
    // The db mapping projects ANY databaseClass option verbatim,
    // so "Document" must mint a Component labelled "Document".
    const dbSkip = byIdSkip.get(expectedDbId);
    if (dbSkip === undefined) {
      throw new Error(
        `${PREFIX}: closed-mapping skip — db L3 child missing for databaseClass="Document".`,
      );
    }
    if (dbSkip.label !== "Document") {
      throw new Error(
        `${PREFIX}: closed-mapping skip — db L3 child label "${dbSkip.label}" must equal "Document" verbatim.`,
      );
    }
  } finally {
    restoreStorage(snap);
  }
}
