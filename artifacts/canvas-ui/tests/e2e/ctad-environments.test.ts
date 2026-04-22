// CTAD Environments — first-class concept (Task #77).
//
// Pins:
//   1. Registry: schema bumped to "ctad-1.1"; environment kind &
//      hosting-model option vocabularies are non-empty and frozen.
//   2. Store: deterministic v1.0 → v1.1 migration (persisted v1.0
//      doc round-trips as v1.1 with `environments: []`); env CRUD
//      enforces id, kind, hosting-model and uniqueness.
//   3. Compiler: deployment-view env-major fan-out with declared
//      environments produces one container per env and a host
//      node per (env, selection) pair. Empty env list falls into
//      a flat-deployment branch (parentId=null, no env nodes).
//   4. Synthesis removal: the compiler does not import
//      `synthesizeEnvironments` and never emits `env:default`.

import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  CTAD_SCHEMA_VERSION,
  CTAD_PRIOR_SCHEMA_VERSIONS,
  ENVIRONMENT_HOSTING_MODEL_OPTIONS,
  ENVIRONMENT_KIND_OPTIONS,
  isValidEnvironmentHostingModel,
  isValidEnvironmentId,
  isValidEnvironmentKind,
  type CtadEnvironmentDef,
} from "@/ctad/ctadRegistry";
import {
  __ctadStoreInternals,
  addEnvironment,
  exportCtadState,
  getEnvironments,
  removeEnvironment,
  setCtadParam,
  updateEnvironment,
  type CtadBinding,
} from "@/ctad/ctadStore";
import { compileDiagramSpec, type CtadStateLike } from "@workspace/diagramspec";

// Per-test isolation: the store is backed by window.localStorage
// in jsdom; clear it before every test so binding writes do not
// leak between cases.
beforeEach(() => {
  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.clear();
  }
});

const TEST_BINDING: CtadBinding = {
  adsId: "__env_test__",
  adsVersion: "1",
};

// ---- Registry --------------------------------------------------

describe("CTAD registry — environments first-class shape", () => {
  it("schema version is ctad-1.1 and lists ctad-1.0 as a prior version", () => {
    expect(CTAD_SCHEMA_VERSION).toBe("ctad-1.1");
    expect(CTAD_PRIOR_SCHEMA_VERSIONS).toContain("ctad-1.0");
  });

  it("environment kind options are non-empty, frozen, and unique", () => {
    expect(Object.isFrozen(ENVIRONMENT_KIND_OPTIONS)).toBe(true);
    expect(ENVIRONMENT_KIND_OPTIONS.length).toBeGreaterThan(0);
    expect(new Set(ENVIRONMENT_KIND_OPTIONS).size).toBe(
      ENVIRONMENT_KIND_OPTIONS.length,
    );
  });

  it("environment hosting-model options are non-empty, frozen, and unique", () => {
    expect(Object.isFrozen(ENVIRONMENT_HOSTING_MODEL_OPTIONS)).toBe(true);
    expect(ENVIRONMENT_HOSTING_MODEL_OPTIONS.length).toBeGreaterThan(0);
    expect(new Set(ENVIRONMENT_HOSTING_MODEL_OPTIONS).size).toBe(
      ENVIRONMENT_HOSTING_MODEL_OPTIONS.length,
    );
  });

  it("validators reject malformed identifiers and unknown vocabularies", () => {
    expect(isValidEnvironmentId("production")).toBe(true);
    expect(isValidEnvironmentId("dev-1")).toBe(true);
    expect(isValidEnvironmentId("Prod")).toBe(false);
    expect(isValidEnvironmentId("1prod")).toBe(false);
    expect(isValidEnvironmentId("with space")).toBe(false);
    expect(isValidEnvironmentKind("Production")).toBe(true);
    expect(isValidEnvironmentKind("Made Up")).toBe(false);
    expect(isValidEnvironmentHostingModel(null)).toBe(true);
    expect(isValidEnvironmentHostingModel("Public")).toBe(true);
    expect(isValidEnvironmentHostingModel("Made Up")).toBe(false);
  });
});

// ---- Store: migration + CRUD -----------------------------------

describe("CTAD store — v1.0 → v1.1 deterministic migration", () => {
  it("reads a persisted ctad-1.0 doc and exposes empty environments", () => {
    // Hand-craft a legacy persisted document, simulating an
    // installation upgraded from before Task #77. The store
    // accepts it via the migration and surfaces an empty env
    // list per binding.
    const legacy = {
      schemaVersion: "ctad-1.0",
      bindings: {
        "legacy-app@7": {
          adsId: "legacy-app",
          adsVersion: "7",
          params: { hostingModel: "Public" },
          updatedAt: "2026-04-01T00:00:00.000Z",
        },
      },
    };
    window.localStorage.setItem(
      __ctadStoreInternals.STORAGE_KEY,
      JSON.stringify(legacy),
    );
    const exported = exportCtadState({
      adsId: "legacy-app",
      adsVersion: "7",
    });
    expect(exported.schemaVersion).toBe("ctad-1.1");
    expect(exported.environments).toEqual([]);
    // Pre-existing param value survives the migration.
    expect(exported.infrastructure.hostingModel).toBe("Public");
  });

  it("ignores docs whose schemaVersion is neither current nor a known prior version", () => {
    window.localStorage.setItem(
      __ctadStoreInternals.STORAGE_KEY,
      JSON.stringify({ schemaVersion: "ctad-9.9", bindings: {} }),
    );
    const exported = exportCtadState(TEST_BINDING);
    // Falls back to the EMPTY_DOC path → no leaked bindings.
    expect(exported.environments).toEqual([]);
  });
});

describe("CTAD store — environment CRUD", () => {
  it("addEnvironment persists a frozen environment record", () => {
    const env: CtadEnvironmentDef = {
      id: "production",
      name: "Production",
      kind: "Production",
      hostingModel: "Public",
    };
    addEnvironment(TEST_BINDING, env);
    const got = getEnvironments(TEST_BINDING);
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject(env);
    expect(Object.isFrozen(got[0])).toBe(true);
  });

  it("rejects duplicate environment ids", () => {
    addEnvironment(TEST_BINDING, {
      id: "production",
      name: "Production",
      kind: "Production",
      hostingModel: null,
    });
    expect(() =>
      addEnvironment(TEST_BINDING, {
        id: "production",
        name: "Other",
        kind: "Staging",
        hostingModel: null,
      }),
    ).toThrow(/already exists/);
  });

  it("rejects unknown environment kinds and hosting-model options", () => {
    expect(() =>
      addEnvironment(TEST_BINDING, {
        id: "x",
        name: "X",
        kind: "Made Up",
        hostingModel: null,
      }),
    ).toThrow(/kind/);
    expect(() =>
      addEnvironment(TEST_BINDING, {
        id: "y",
        name: "Y",
        kind: "Production",
        hostingModel: "Made Up",
      }),
    ).toThrow(/hosting/);
  });

  it("updateEnvironment replaces the record in place; removeEnvironment drops it", () => {
    addEnvironment(TEST_BINDING, {
      id: "staging",
      name: "Staging",
      kind: "Staging",
      hostingModel: null,
    });
    updateEnvironment(TEST_BINDING, {
      id: "staging",
      name: "Staging (renamed)",
      kind: "Staging",
      hostingModel: "Private",
    });
    expect(getEnvironments(TEST_BINDING)[0].name).toBe("Staging (renamed)");
    expect(getEnvironments(TEST_BINDING)[0].hostingModel).toBe("Private");
    removeEnvironment(TEST_BINDING, "staging");
    expect(getEnvironments(TEST_BINDING)).toHaveLength(0);
  });

  it("env writes coexist with param writes on the same binding", () => {
    setCtadParam(TEST_BINDING, "hostingModel", "Public");
    addEnvironment(TEST_BINDING, {
      id: "prod",
      name: "Prod",
      kind: "Production",
      hostingModel: "Public",
    });
    const exported = exportCtadState(TEST_BINDING);
    expect(exported.infrastructure.hostingModel).toBe("Public");
    expect(exported.environments).toHaveLength(1);
    expect(exported.environments[0].id).toBe("prod");
  });

  it("removing the last env on a param-free binding clears the binding entirely", () => {
    addEnvironment(TEST_BINDING, {
      id: "only",
      name: "Only",
      kind: "Production",
      hostingModel: null,
    });
    removeEnvironment(TEST_BINDING, "only");
    const doc = __ctadStoreInternals.readDoc();
    expect(
      doc.bindings[`${TEST_BINDING.adsId}@${TEST_BINDING.adsVersion}`],
    ).toBeUndefined();
  });
});

// ---- Compiler: env-major and flat branches ---------------------

describe("compileDiagramSpec — environments-first deployment view", () => {
  const STATE_WITH_TWO_ENVS: CtadStateLike = {
    infrastructure: {
      hostingModel: null,
      deploymentTopology: null,
      networkComponents: ["Firewall"] as readonly string[],
    },
    application: {},
    integration: {},
    crossCutting: { resiliencePosture: "Multi-region" },
    ops: { containerOrchestration: "Kubernetes" },
    environments: [
      { id: "prod", name: "Production", kind: "Production", hostingModel: "Public" },
      { id: "stg", name: "Staging", kind: "Staging", hostingModel: "Private" },
    ],
  };

  it("emits one environment container per declared env", () => {
    const spec = compileDiagramSpec(STATE_WITH_TWO_ENVS, {
      viewType: "deployment",
      stratum: "technology",
    });
    const envs = spec.nodes.filter((n) => n.kind === "environment");
    expect(envs.map((e) => e.id).sort()).toEqual(["env:prod", "env:stg"]);
    for (const env of envs) {
      expect(env.parentId).toBeNull();
      expect(env.ctadRef.section).toBe("environments");
    }
  });

  it("emits one host node per (env, selection) and parents it correctly", () => {
    const spec = compileDiagramSpec(STATE_WITH_TWO_ENVS, {
      viewType: "deployment",
      stratum: "technology",
    });
    const hosts = spec.nodes.filter((n) => n.kind !== "environment");
    expect(hosts.length).toBeGreaterThan(0);
    for (const h of hosts) {
      expect(["env:prod", "env:stg"]).toContain(h.parentId);
    }
    // Both envs receive the same set of host options.
    const optionsByEnv = new Map<string, Set<string>>();
    for (const h of hosts) {
      const set =
        optionsByEnv.get(h.parentId ?? "") ?? new Set<string>();
      set.add(h.ctadRef.option ?? "");
      optionsByEnv.set(h.parentId ?? "", set);
    }
    expect(optionsByEnv.get("env:prod")).toEqual(optionsByEnv.get("env:stg"));
  });

  it("falls back to a flat host listing when environments is empty", () => {
    const flatState: CtadStateLike = {
      ...STATE_WITH_TWO_ENVS,
      environments: [],
    };
    const spec = compileDiagramSpec(flatState, {
      viewType: "deployment",
      stratum: "technology",
    });
    expect(spec.nodes.filter((n) => n.kind === "environment")).toHaveLength(0);
    const hosts = spec.nodes;
    expect(hosts.length).toBeGreaterThan(0);
    for (const h of hosts) expect(h.parentId).toBeNull();
  });

  it("treats an absent environments field the same as an empty list", () => {
    // CtadStateLike permits `environments?: undefined`. Older
    // upstream call sites may not yet pass the field; the
    // compiler must tolerate this without throwing.
    const stateNoEnvField = {
      infrastructure: {
        hostingModel: null,
        deploymentTopology: null,
        networkComponents: ["Firewall"] as readonly string[],
      },
      application: {},
      integration: {},
      crossCutting: {},
      ops: {},
    } as CtadStateLike;
    const spec = compileDiagramSpec(stateNoEnvField, {
      viewType: "deployment",
      stratum: "technology",
    });
    expect(spec.nodes.filter((n) => n.kind === "environment")).toHaveLength(0);
  });
});

// ---- Synthesis removal regression -------------------------------

describe("compileDiagramSpec — synthesizeEnvironments has been removed", () => {
  const SYNTH_PATH = path.resolve(
    __dirname,
    "../../../../lib/diagramspec/src/synthesizeEnvironments.ts",
  );
  const COMPILE_PATH = path.resolve(
    __dirname,
    "../../../../lib/diagramspec/src/compile.ts",
  );

  it("the synthesizeEnvironments source file is gone", async () => {
    let exists = true;
    try {
      await fs.stat(SYNTH_PATH);
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);
  });

  it("compile.ts no longer references the synthesis module or env:default fallback", async () => {
    const src = await fs.readFile(COMPILE_PATH, "utf8");
    expect(src).not.toMatch(/synthesizeEnvironments/);
    expect(src).not.toMatch(/env:default/);
  });
});
