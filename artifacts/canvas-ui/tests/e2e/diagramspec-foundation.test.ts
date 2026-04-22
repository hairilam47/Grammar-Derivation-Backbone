// DiagramSpec Foundation — end-to-end tests for Task #75.
//
// Covers: viewType × stratum pairing matrix, validator rejection
// of mixed and unknown views, ELK layout determinism, the empty
// CTAD → empty spec → empty layout pipeline, and the build-time
// isolation invariant for the diagramspec package.

import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  ALLOWED_STRATA_FOR_VIEW,
  DIAGRAMSPEC_SCHEMA_VERSION,
  DIAGRAM_STRATA,
  DIAGRAM_VIEW_TYPES,
  assertNoForbiddenDiagramspecImports,
  compileDiagramSpec,
  isPairingAllowed,
  validateDiagramSpec,
  type CtadStateLike,
  type DiagramRequest,
  type DiagramSpec,
  type DiagramStratum,
  type DiagramViewType,
} from "@workspace/diagramspec";
import { layoutDiagram } from "@workspace/diagram-layout";

const EMPTY_STATE: CtadStateLike = Object.freeze({
  infrastructure: Object.freeze({
    hostingModel: null,
    deploymentTopology: null,
    networkComponents: null,
  }),
  application: Object.freeze({
    applicationStyle: null,
    runtimeCategory: null,
    backendFrameworkClass: null,
  }),
  integration: Object.freeze({
    integrationPattern: null,
    boundaryScope: null,
  }),
  crossCutting: Object.freeze({
    resiliencePosture: null,
  }),
  ops: Object.freeze({
    containerOrchestration: null,
  }),
});

const FIXTURE_STATE: CtadStateLike = Object.freeze({
  infrastructure: Object.freeze({
    hostingModel: "Hybrid",
    deploymentTopology: "Distributed",
    networkComponents: Object.freeze(["Router", "Firewall"]),
  }),
  application: Object.freeze({
    applicationStyle: "Microservices",
    runtimeCategory: "Managed",
    backendFrameworkClass: "Node",
  }),
  integration: Object.freeze({
    integrationPattern: "Event",
    boundaryScope: "External",
  }),
  crossCutting: Object.freeze({
    resiliencePosture: "Multi-region",
  }),
  ops: Object.freeze({
    containerOrchestration: "Kubernetes",
  }),
});

describe("compileDiagramSpec — pairing matrix", () => {
  for (const viewType of DIAGRAM_VIEW_TYPES) {
    for (const stratum of DIAGRAM_STRATA) {
      const allowed = isPairingAllowed(viewType, stratum);
      const label = `${viewType}/${stratum} (${allowed ? "allowed" : "rejected"})`;
      it(label, () => {
        const req: DiagramRequest = { viewType, stratum };
        const spec = compileDiagramSpec(FIXTURE_STATE, req);
        expect(spec.schemaVersion).toBe(DIAGRAMSPEC_SCHEMA_VERSION);
        expect(spec.viewType).toBe(viewType);
        expect(spec.stratum).toBe(stratum);
        const result = validateDiagramSpec(spec);
        if (allowed) {
          if (!result.ok) {
            throw new Error(
              `expected valid spec for ${label}; got errors: ${result.errors.join(", ")}`,
            );
          }
          expect(result.ok).toBe(true);
        } else {
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.errors.some((e) => e.includes("pairing:"))).toBe(true);
          }
        }
      });
    }
  }
});

describe("compileDiagramSpec — determinism", () => {
  it("same input → same output (byte-equivalent JSON)", () => {
    for (const viewType of DIAGRAM_VIEW_TYPES) {
      for (const stratum of ALLOWED_STRATA_FOR_VIEW[viewType]) {
        const req: DiagramRequest = { viewType, stratum };
        const a = compileDiagramSpec(FIXTURE_STATE, req);
        const b = compileDiagramSpec(FIXTURE_STATE, req);
        expect(JSON.stringify(b)).toBe(JSON.stringify(a));
      }
    }
  });

  it("does not mutate input state", () => {
    const before = JSON.stringify(FIXTURE_STATE);
    for (const viewType of DIAGRAM_VIEW_TYPES) {
      for (const stratum of ALLOWED_STRATA_FOR_VIEW[viewType]) {
        compileDiagramSpec(FIXTURE_STATE, { viewType, stratum });
      }
    }
    expect(JSON.stringify(FIXTURE_STATE)).toBe(before);
  });
});

describe("compileDiagramSpec — empty in / empty out", () => {
  it("empty CTAD_STATE produces empty spec for every allowed pairing", () => {
    for (const viewType of DIAGRAM_VIEW_TYPES) {
      for (const stratum of ALLOWED_STRATA_FOR_VIEW[viewType]) {
        const spec = compileDiagramSpec(EMPTY_STATE, { viewType, stratum });
        expect(spec.nodes).toEqual([]);
        expect(spec.edges).toEqual([]);
        const result = validateDiagramSpec(spec);
        expect(result.ok).toBe(true);
      }
    }
  });
});

describe("compileDiagramSpec — deployment fallback when env synthesis is empty", () => {
  it("preserves technology selections even when topology+hosting are both null", () => {
    const stateNoEnvInputs: CtadStateLike = {
      ...EMPTY_STATE,
      infrastructure: {
        hostingModel: null,
        deploymentTopology: null,
        // intentionally include another infra param so the
        // technology-stratum selection set is non-empty.
        networkComponents: ["Firewall"] as readonly string[],
      },
      ops: { containerOrchestration: "Kubernetes" },
      crossCutting: { resiliencePosture: "Multi-region" },
    };
    const spec = compileDiagramSpec(stateNoEnvInputs, {
      viewType: "deployment",
      stratum: "technology",
    });
    const envs = spec.nodes.filter((n) => n.kind === "environment");
    const hosts = spec.nodes.filter((n) => n.kind === "node");
    expect(envs.length).toBeGreaterThan(0);
    expect(hosts.length).toBeGreaterThan(0);
    // Every host node must have an env parent (no orphans).
    for (const h of hosts) {
      expect(envs.some((e) => e.id === h.parentId)).toBe(true);
    }
    // The synthesized fallback env id is stable.
    expect(envs.some((e) => e.id === "env:default")).toBe(true);
    // Validator passes the resulting spec.
    const result = validateDiagramSpec(spec);
    expect(result.ok).toBe(true);
  });
});

describe("validateDiagramSpec — schema-driven phase", () => {
  it("publishes a JSON Schema artifact", async () => {
    const { DIAGRAMSPEC_JSON_SCHEMA } = await import("@workspace/diagramspec");
    expect(DIAGRAMSPEC_JSON_SCHEMA.$schema).toBe(
      "https://json-schema.org/draft/2020-12/schema",
    );
    expect(DIAGRAMSPEC_JSON_SCHEMA.title).toBe("DiagramSpec");
    expect(DIAGRAMSPEC_JSON_SCHEMA.required).toEqual([
      "schemaVersion",
      "viewType",
      "stratum",
      "nodes",
      "edges",
    ]);
  });

  it("rejects an additional property at the spec root", () => {
    const r = validateDiagramSpec({
      schemaVersion: DIAGRAMSPEC_SCHEMA_VERSION,
      viewType: "context",
      stratum: "organization",
      nodes: [],
      edges: [],
      sneaky: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes("additional property"))).toBe(true);
    }
  });

  it("rejects an empty-string node id via minLength", () => {
    const r = validateDiagramSpec({
      schemaVersion: DIAGRAMSPEC_SCHEMA_VERSION,
      viewType: "context",
      stratum: "organization",
      nodes: [
        {
          id: "",
          kind: "system",
          label: "X",
          parentId: null,
          ctadRef: { section: "application", paramId: null, option: null },
        },
      ],
      edges: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes("minLength"))).toBe(true);
    }
  });
});

describe("validateDiagramSpec — rejection cases", () => {
  function baseSpec(
    viewType: DiagramViewType,
    stratum: DiagramStratum,
  ): DiagramSpec {
    return {
      schemaVersion: DIAGRAMSPEC_SCHEMA_VERSION,
      viewType,
      stratum,
      nodes: [],
      edges: [],
    };
  }

  it("rejects mixed-view (deployment + business)", () => {
    const r = validateDiagramSpec(baseSpec("deployment", "business"));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes("pairing:"))).toBe(true);
    }
  });

  it("rejects unknown viewType", () => {
    const r = validateDiagramSpec({
      ...baseSpec("context", "organization"),
      viewType: "atlas-view",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes("/viewType:"))).toBe(true);
    }
  });

  it("rejects unknown stratum", () => {
    const r = validateDiagramSpec({
      ...baseSpec("context", "organization"),
      stratum: "platform",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes("/stratum:"))).toBe(true);
    }
  });

  it("rejects edges referencing unknown nodes", () => {
    const r = validateDiagramSpec({
      ...baseSpec("context", "organization"),
      edges: [
        { id: "e1", from: "missing-a", to: "missing-b", relation: "depends-on" },
      ],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects unknown relation", () => {
    const r = validateDiagramSpec({
      ...baseSpec("context", "organization"),
      nodes: [
        {
          id: "n1",
          kind: "system",
          label: "A",
          parentId: null,
          ctadRef: { section: "application", paramId: null, option: null },
        },
        {
          id: "n2",
          kind: "system",
          label: "B",
          parentId: null,
          ctadRef: { section: "application", paramId: null, option: null },
        },
      ],
      edges: [{ id: "e1", from: "n1", to: "n2", relation: "owns" }],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects bad schemaVersion", () => {
    const r = validateDiagramSpec({
      ...baseSpec("context", "organization"),
      schemaVersion: "diagramspec-0.9",
    });
    expect(r.ok).toBe(false);
  });
});

describe("layoutDiagram — determinism + empty + hierarchical deployment", () => {
  it("empty spec → empty layout (no ELK call)", async () => {
    const spec = compileDiagramSpec(EMPTY_STATE, {
      viewType: "deployment",
      stratum: "technology",
    });
    const positioned = await layoutDiagram(spec);
    expect(positioned.nodes).toEqual([]);
    expect(positioned.edges).toEqual([]);
  });

  it("same spec → byte-identical positions across runs", async () => {
    const spec = compileDiagramSpec(FIXTURE_STATE, {
      viewType: "container",
      stratum: "application",
    });
    const a = await layoutDiagram(spec);
    const b = await layoutDiagram(spec);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it("deployment view nests host nodes inside env containers", async () => {
    const spec = compileDiagramSpec(FIXTURE_STATE, {
      viewType: "deployment",
      stratum: "technology",
    });
    const positioned = await layoutDiagram(spec);
    const envNodes = positioned.nodes.filter((n) => n.parentId === null);
    const hostNodes = positioned.nodes.filter((n) => n.parentId !== null);
    expect(envNodes.length).toBeGreaterThan(0);
    expect(hostNodes.length).toBeGreaterThan(0);
    for (const h of hostNodes) {
      expect(envNodes.some((e) => e.id === h.parentId)).toBe(true);
    }
    // Stratum index = technology (4) → z = 4 for every node.
    for (const n of positioned.nodes) {
      expect(n.z).toBe(4);
    }
  });
});

describe("diagramspec isolation invariant — Node-side scan of lib sources", () => {
  it("passes the real source tree", async () => {
    const root = path.resolve(__dirname, "../../../../lib/diagramspec/src");
    const sources: Record<string, string> = {};
    async function walk(dir: string): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else if (e.isFile() && full.endsWith(".ts")) {
          sources[full] = await fs.readFile(full, "utf8");
        }
      }
    }
    await walk(root);
    expect(Object.keys(sources).length).toBeGreaterThan(0);
    expect(() => assertNoForbiddenDiagramspecImports(sources)).not.toThrow();
  });

  it("rejects a synthetic file that imports elkjs", () => {
    const sources = {
      "/lib/diagramspec/src/bad.ts": `import ELK from "elkjs/lib/elk.bundled.js";\n`,
    };
    expect(() => assertNoForbiddenDiagramspecImports(sources)).toThrow(
      /forbidden-import/,
    );
  });

  it("rejects a synthetic file that imports three", () => {
    const sources = {
      "/lib/diagramspec/src/bad.ts": `import * as THREE from "three";\n`,
    };
    expect(() => assertNoForbiddenDiagramspecImports(sources)).toThrow(
      /forbidden-import/,
    );
  });

  it("rejects a synthetic file that imports the cncf catalog", () => {
    const sources = {
      "/lib/diagramspec/src/bad.ts": `import { CNCF_CARDS } from "@workspace/cncf-catalog";\n`,
    };
    expect(() => assertNoForbiddenDiagramspecImports(sources)).toThrow(
      /forbidden-import/,
    );
  });

  it("rejects a synthetic file that imports from @/cncf/", () => {
    const sources = {
      "/lib/diagramspec/src/bad.ts": `import { x } from "@/cncf/cncfCatalog";\n`,
    };
    expect(() => assertNoForbiddenDiagramspecImports(sources)).toThrow(
      /forbidden-import/,
    );
  });

  it("rejects a synthetic dynamic import of elkjs", () => {
    const sources = {
      "/lib/diagramspec/src/bad.ts": `const m = await import("elkjs/lib/elk.bundled.js");\n`,
    };
    expect(() => assertNoForbiddenDiagramspecImports(sources)).toThrow(
      /forbidden-dynamic-import/,
    );
  });
});

describe("App-boot isolation invariant — test-shape side-effect import", () => {
  it("loads without throwing (glob matches non-zero diagramspec sources)", async () => {
    // Importing the test-shape module triggers the same glob +
    // assertion the App boots with. A zero-match glob throws the
    // explicit wiring-violation error, surfacing here.
    await expect(
      import("@/diagramspec/diagramspecIsolationInvariants.test-shape"),
    ).resolves.toBeDefined();
  });
});

describe("compileDiagramSpec — deployment env synthesis carries the TODO marker", () => {
  it("synthesis source contains the migration anchor for Task #77", async () => {
    const src = await fs.readFile(
      path.resolve(
        __dirname,
        "../../../../lib/diagramspec/src/synthesizeEnvironments.ts",
      ),
      "utf8",
    );
    expect(src).toMatch(
      /TODO:\s*replace once environments are first-class in CTAD/,
    );
  });
});
