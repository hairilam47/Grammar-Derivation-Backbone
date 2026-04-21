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
import { deriveACWStructure } from "./track3Derive";
import type { AdcBounds, AcwTrack3Structure } from "./track3Types";

const FIXTURE_BOUNDS: AdcBounds = Object.freeze({
  adsId: "ads-fixture",
  adsVersion: "v1",
  layersPresent: Object.freeze([
    "infrastructure",
    "application",
    "integration",
    "crossCutting",
  ]),
});

// Use string literal types compatible with CtadStateExport
// without importing the CTAD store at runtime — invariants must
// not depend on side-effectful modules. Cast to `any` at the
// call site is unavoidable for the synthetic fixture; the cast
// is local to this file and isolated from production paths.
function makeEmptyState(): unknown {
  return {
    schemaVersion: "ctad-1.0",
    binding: { adsId: "ads-fixture", adsVersion: "v1" },
    infrastructure: {},
    application: {},
    integration: {},
    crossCutting: {},
  };
}

function makePopulatedState(): unknown {
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
  };
}

function makeMutatedState(): unknown {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = deriveACWStructure(state as any, FIXTURE_BOUNDS);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = deriveACWStructure(state as any, FIXTURE_BOUNDS);
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: AcwTrack3Structure = deriveACWStructure(empty as any, FIXTURE_BOUNDS);
  if (result.nodes.length !== 0 || result.edges.length !== 0) {
    throw new Error(
      `ACW Track 3 derivation invariant: empty CTAD_STATE fixture produced ${result.nodes.length} nodes and ${result.edges.length} edges. The derivation must propagate emptiness as visual emptiness, not synthesise defaults.`,
    );
  }
}

function assertSensitiveToInput(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = deriveACWStructure(makePopulatedState() as any, FIXTURE_BOUNDS);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = deriveACWStructure(makeMutatedState() as any, FIXTURE_BOUNDS);
  if (deepEqual(a, b)) {
    throw new Error(
      "ACW Track 3 derivation invariant: derivation produced the same output for two different CTAD_STATE inputs. The derivation is not actually reading the input.",
    );
  }
}

assertDeterministic();
assertEmptyInputEmptyOutput();
assertSensitiveToInput();
