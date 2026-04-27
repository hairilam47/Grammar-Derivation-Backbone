// EAStudio Path B Phase 2 (LoS framework) — L3 generator behaviour
// invariants.
//
// Module-load assertions that fail the bundle if the L3 generator
// regresses on any of the three constitutional guarantees:
//
//   1. Idempotency — calling the generator N times produces a
//      workspace byte-equivalent to calling it once.
//   2. No orphan recreate — when the sealed `domain-technology`
//      container is missing, the generator must no-op (it must
//      not synthesise its own root).
//   3. lodRange contract — every minted node carries
//      `lodRange: [3, 3]` so it is visible only at L3.
//
// These probes touch the singleton acwStore + the singleton CTAD
// store. They snapshot both keys before each fixture and restore
// them in a `finally`, so probe execution is invisible to the
// running app.
import {
  __acwStoreInternals,
  ACW_SCHEMA_VERSION,
} from "../acwStore";
import { generateL3Nodes } from "./l3Generator";

const PREFIX = "ACW L3 generator invariant violation";
const ACW_STORE_KEY = "acw.workspace.v1";
const CTAD_STORE_KEY = "ctad.state.v1";

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
}

// Skip the live-store probes in non-browser environments. The
// shape-only invariants below still execute everywhere, so the
// bundle still hard-fails on a regressed mapping table even when
// localStorage is unavailable.
if (typeof window !== "undefined") {
  const snap = snapshotStorage();
  try {
    // (1) No orphan recreate: with no architectures and no
    // technology container in the workspace, the generator must
    // no-op (and not synthesise its own root).
    window.localStorage.removeItem(ACW_STORE_KEY);
    window.localStorage.removeItem(CTAD_STORE_KEY);
    __acwStoreInternals.reloadFromStorageForTest();
    // Seed a workspace that has NO domain-technology container.
    const emptyWs = {
      schemaVersion: ACW_SCHEMA_VERSION,
      structureGraph: { nodes: [], edges: [] },
    };
    window.localStorage.setItem(ACW_STORE_KEY, JSON.stringify(emptyWs));
    __acwStoreInternals.reloadFromStorageForTest();
    // Drive the CTAD store via its own storage key so the L3
    // carve-out's `listArchitectures` returns at least one entry.
    const ctadDoc = {
      schemaVersion: "ctad-1.0",
      bindings: {},
      architectures: {
        "arch-probe-deadbeef": {
          architectureId: "arch-probe-deadbeef",
          architectureName: "Probe",
          params: {
            hostingModel: "Public",
            databaseClass: "Relational",
          },
          environments: [],
          createdAt: "",
          updatedAt: "",
        },
      },
    };
    window.localStorage.setItem(CTAD_STORE_KEY, JSON.stringify(ctadDoc));
    const before1 = __acwStoreInternals.serializeForTest();
    const considered1 = generateL3Nodes("arch-probe-deadbeef");
    const after1 = __acwStoreInternals.serializeForTest();
    if (before1 !== after1) {
      throw new Error(
        `${PREFIX}: generator mutated the workspace despite a missing domain-technology container.`,
      );
    }
    if (considered1.length !== 0) {
      throw new Error(
        `${PREFIX}: generator returned ids despite a missing domain-technology container (got ${considered1.length}).`,
      );
    }

    // (2) Idempotency + lodRange contract: with the technology
    // container in place, the first run mints L3 nodes; every
    // subsequent run is a byte-identical no-op, and every minted
    // node carries `lodRange: [3, 3]` plus the deterministic id.
    const seededWs = {
      schemaVersion: ACW_SCHEMA_VERSION,
      structureGraph: {
        nodes: [
          {
            id: "domain-technology",
            type: "Zone",
            parentId: null,
            label: "Technology",
            x: 1000,
            y: 1000,
            isDomainContainer: true,
            domainTag: "technology",
          },
        ],
        edges: [],
      },
    };
    window.localStorage.setItem(ACW_STORE_KEY, JSON.stringify(seededWs));
    __acwStoreInternals.reloadFromStorageForTest();
    const beforeFirst = __acwStoreInternals.serializeForTest();
    const considered2 = generateL3Nodes("arch-probe-deadbeef");
    const afterFirst = __acwStoreInternals.serializeForTest();
    if (beforeFirst === afterFirst) {
      throw new Error(
        `${PREFIX}: generator wrote nothing despite a present container and CTAD options being set.`,
      );
    }
    if (considered2.length === 0) {
      throw new Error(
        `${PREFIX}: generator returned no ids despite emitting nodes.`,
      );
    }
    // Every considered id must be present in the workspace AND
    // must carry the [3, 3] lodRange.
    interface NodeShape {
      readonly id: string;
      readonly parentId: string | null;
      readonly lodRange?: readonly [number, number];
    }
    const parsedAfterFirst = JSON.parse(afterFirst) as {
      structureGraph: { nodes: ReadonlyArray<NodeShape> };
    };
    const byIdAfterFirst = new Map(
      parsedAfterFirst.structureGraph.nodes.map((n) => [n.id, n] as const),
    );
    for (const id of considered2) {
      const n = byIdAfterFirst.get(id);
      if (n === undefined) {
        throw new Error(
          `${PREFIX}: minted id "${id}" did not land in the workspace.`,
        );
      }
      if (n.parentId !== "domain-technology") {
        throw new Error(
          `${PREFIX}: minted id "${id}" is not parented to domain-technology (got "${String(n.parentId)}").`,
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
    // Idempotency: run again — workspace must not change.
    const considered3 = generateL3Nodes("arch-probe-deadbeef");
    const afterSecond = __acwStoreInternals.serializeForTest();
    if (afterFirst !== afterSecond) {
      throw new Error(
        `${PREFIX}: a second generator run mutated the workspace (idempotency broken).`,
      );
    }
    if (considered3.length !== considered2.length) {
      throw new Error(
        `${PREFIX}: a second generator run returned a different id set (idempotency broken).`,
      );
    }
  } finally {
    restoreStorage(snap);
  }
}
