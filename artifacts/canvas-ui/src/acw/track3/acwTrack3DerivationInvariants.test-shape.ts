// ACW Track 3 — derivation-purity invariant.
//
// Constitutional contract: `deriveACWStructure(ctadState, bounds)`
// is a pure, total mapping. Same input → same output, no
// `Date.now`, no `Math.random`, no closure over mutable global
// state. Asserted at module load by:
//
//   (a) running the derivation twice on a representative fixture
//       and deep-comparing the result.
//   (b) running it on an all-null CTAD_STATE and asserting the
//       result is exactly empty (no fabricated defaults).
//   (c) re-running it after a small mutation to the input and
//       asserting the result changes deterministically.
//   (d) running it with a restricted `bounds.layersPresent` set
//       and asserting that out-of-bounds CTAD selections are
//       silently dropped (i.e. `bounds` materially affects the
//       derivation).
//
// The CTAD_STATE type is imported as type-only so this invariant
// has no runtime dependency on the CTAD store module.
import { deriveACWStructure } from "./track3Derive";
import type { AcwTrack3Structure, AdcBounds, Track3Layer } from "./track3Types";
import type { CtadStateExport } from "@/ctad/ctadStore";

const FIXTURE_BOUNDS_FULL: AdcBounds = Object.freeze({
  adsId: "ads-fixture",
  adsVersion: "v1",
  layersPresent: Object.freeze<Track3Layer[]>([
    "infrastructure",
    "application",
    "integration",
    "crossCutting",
    "ops",
  ]),
});

const FIXTURE_BOUNDS_INFRA_ONLY: AdcBounds = Object.freeze({
  adsId: "ads-fixture",
  adsVersion: "v1",
  layersPresent: Object.freeze<Track3Layer[]>(["infrastructure"]),
});

function makeEmptyState(): CtadStateExport {
  return {
    schemaVersion: "ctad-1.0",
    binding: { adsId: "ads-fixture", adsVersion: "v1" },
    infrastructure: {},
    application: {},
    integration: {},
    crossCutting: {},
    ops: {},
  };
}

function makePopulatedState(): CtadStateExport {
  return {
    schemaVersion: "ctad-1.0",
    binding: { adsId: "ads-fixture", adsVersion: "v1" },
    infrastructure: {
      hostingModel: "Public",
      databaseClass: "Relational",
      osClass: "Linux",
    },
    application: {
      applicationStyle: "Microservices",
      runtimeCategory: "Managed",
    },
    integration: {
      integrationPattern: "API",
    },
    crossCutting: {
      configurationManagement: "Centralised",
    },
    ops: {
      containerOrchestration: "Kubernetes",
      observabilityStack: "Metrics + Logs",
    },
  };
}

function makeMutatedState(): CtadStateExport {
  return {
    schemaVersion: "ctad-1.0",
    binding: { adsId: "ads-fixture", adsVersion: "v1" },
    infrastructure: {
      hostingModel: "Private",
      databaseClass: "Document",
    },
    application: {},
    integration: {},
    crossCutting: {},
    ops: {},
  };
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (typeof a === "object" && typeof b === "object") {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const ak = Object.keys(ao).sort();
    const bk = Object.keys(bo).sort();
    if (ak.length !== bk.length) return false;
    for (let i = 0; i < ak.length; i++) {
      if (ak[i] !== bk[i]) return false;
      if (!deepEqual(ao[ak[i]], bo[bk[i]])) return false;
    }
    return true;
  }
  return false;
}

function assertDeterministic(): void {
  const state = makePopulatedState();
  const a = deriveACWStructure(state, FIXTURE_BOUNDS_FULL);
  const b = deriveACWStructure(state, FIXTURE_BOUNDS_FULL);
  if (!deepEqual(a, b)) {
    throw new Error(
      "ACW Track 3 derivation invariant: deriveACWStructure produced different output for the same input. The function is not pure (most likely cause: Date.now / Math.random / mutable closure).",
    );
  }
  if (a.nodes.length === 0 || a.edges.length === 0) {
    throw new Error(
      "ACW Track 3 derivation invariant: populated CTAD_STATE fixture produced no nodes or no edges. The derivation is silently dropping content.",
    );
  }
}

function assertEmptyInputEmptyOutput(): void {
  const empty = makeEmptyState();
  const result: AcwTrack3Structure = deriveACWStructure(
    empty,
    FIXTURE_BOUNDS_FULL,
  );
  if (result.nodes.length !== 0 || result.edges.length !== 0) {
    throw new Error(
      `ACW Track 3 derivation invariant: empty CTAD_STATE fixture produced ${result.nodes.length} nodes and ${result.edges.length} edges. The derivation must propagate emptiness as visual emptiness, not synthesise defaults.`,
    );
  }
}

function assertSensitiveToInput(): void {
  const a = deriveACWStructure(makePopulatedState(), FIXTURE_BOUNDS_FULL);
  const b = deriveACWStructure(makeMutatedState(), FIXTURE_BOUNDS_FULL);
  if (deepEqual(a, b)) {
    throw new Error(
      "ACW Track 3 derivation invariant: derivation produced the same output for two different CTAD_STATE inputs. The derivation is not actually reading the input.",
    );
  }
}

function assertBoundsMaterial(): void {
  const state = makePopulatedState();
  const full = deriveACWStructure(state, FIXTURE_BOUNDS_FULL);
  const restricted = deriveACWStructure(state, FIXTURE_BOUNDS_INFRA_ONLY);
  if (deepEqual(full, restricted)) {
    throw new Error(
      "ACW Track 3 derivation invariant: derivation produced the same output for two different `bounds.layersPresent` sets. ADC bounds must materially constrain the derivation; out-of-bounds CTAD selections must be dropped.",
    );
  }
  // The restricted result must contain ONLY infrastructure-layer
  // nodes (the layer root plus its children) and no application,
  // integration, or cross-cutting nodes.
  for (const n of restricted.nodes) {
    const ok =
      n.id === "node:layer:infrastructure" ||
      n.id.startsWith("node:param:infrastructure:");
    if (!ok) {
      throw new Error(
        `ACW Track 3 derivation invariant: restricted bounds (infrastructure-only) produced an out-of-bounds node "${n.id}". Out-of-bounds layers must be entirely dropped from the derivation.`,
      );
    }
  }
}

assertDeterministic();
assertEmptyInputEmptyOutput();
assertSensitiveToInput();
assertBoundsMaterial();
