// ACW Track 3 — view-prefs schema invariant.
//
// Module-load self-test for `track3ViewPrefs` proving that the
// schema validator rejects every shape that would let a future
// edit smuggle structural / authoritative data into a surface
// that is, by constitutional contract, ONLY allowed to persist
// inert per-binding view preferences.
//
// The invariant exercises `assertValidPrefsDoc` directly so the
// gate is enforced at bundle load — a regression in the
// validator (e.g. someone removes the allowed-keys check on a
// per-binding entry, or accepts a foreign top-level field)
// fails the application bundle synchronously, not lazily on
// first read/write.
//
// Phase 4 (Task #81) bumped the schema to v1.1 with a new
// per-entry `isFullscreen: boolean` field; the invariant adds
// rejection probes for missing / non-boolean isFullscreen and a
// positive control for the deterministic v1.0 → v1.1 migration.
import {
  TRACK3_VIEWPREFS_SCHEMA_VERSION,
  assertValidPrefsDoc,
  __track3ViewPrefsInternals,
} from "./track3ViewPrefs";

function assertRejects(label: string, raw: unknown): void {
  let threw = false;
  try {
    assertValidPrefsDoc(raw);
  } catch {
    threw = true;
  }
  if (!threw) {
    throw new Error(
      `ACW Track 3 view-prefs invariant: validator failed to reject ${label}.`,
    );
  }
}

function assertAccepts(label: string, raw: unknown): void {
  try {
    assertValidPrefsDoc(raw);
  } catch (err) {
    throw new Error(
      `ACW Track 3 view-prefs invariant: validator unexpectedly rejected ${label}: ${(err as Error).message}`,
    );
  }
}

const VALID_DOC = {
  schemaVersion: TRACK3_VIEWPREFS_SCHEMA_VERSION,
  byBinding: {
    "ads:demo|v1": {
      viewMode: "2d",
      perspective: "all",
      hiddenLayers: [],
      cameraX: 0,
      cameraY: 0,
      cameraZoom: 1,
      isFullscreen: true,
    },
  },
};

assertAccepts("a baseline valid v1.1 document", VALID_DOC);

assertRejects("a non-object document", "not-an-object");
assertRejects("a null document", null);

assertRejects(
  "a top-level forbidden field (e.g. structural payload)",
  {
    ...VALID_DOC,
    nodes: [{ id: "x" }],
  },
);

assertRejects(
  "a wrong schemaVersion",
  { ...VALID_DOC, schemaVersion: "acw-track3-viewprefs-2.0" },
);

// v1.0 must be rejected by the strict validator (the read path
// migrates v1.0 docs separately before validating).
assertRejects(
  "a legacy v1.0 schemaVersion (must be migrated, not accepted)",
  {
    schemaVersion: "acw-track3-viewprefs-1.0",
    byBinding: {
      "ads:demo|v1": {
        viewMode: "2d",
        perspective: "all",
        hiddenLayers: [],
        cameraX: 0,
        cameraY: 0,
        cameraZoom: 1,
      },
    },
  },
);

assertRejects(
  "a per-binding entry with a forbidden field (e.g. derived edges)",
  {
    schemaVersion: TRACK3_VIEWPREFS_SCHEMA_VERSION,
    byBinding: {
      "ads:demo|v1": {
        viewMode: "2d",
        perspective: "all",
        hiddenLayers: [],
        cameraX: 0,
        cameraY: 0,
        cameraZoom: 1,
        isFullscreen: true,
        edges: [{ from: "a", to: "b" }],
      },
    },
  },
);

assertRejects(
  "an out-of-range viewMode",
  {
    schemaVersion: TRACK3_VIEWPREFS_SCHEMA_VERSION,
    byBinding: {
      "ads:demo|v1": {
        viewMode: "isometric",
        perspective: "all",
        hiddenLayers: [],
        cameraX: 0,
        cameraY: 0,
        cameraZoom: 1,
        isFullscreen: true,
      },
    },
  },
);

assertRejects(
  "a non-finite camera number",
  {
    schemaVersion: TRACK3_VIEWPREFS_SCHEMA_VERSION,
    byBinding: {
      "ads:demo|v1": {
        viewMode: "2d",
        perspective: "all",
        hiddenLayers: [],
        cameraX: Number.NaN,
        cameraY: 0,
        cameraZoom: 1,
        isFullscreen: true,
      },
    },
  },
);

assertRejects(
  "a missing isFullscreen field (v1.1 requires it)",
  {
    schemaVersion: TRACK3_VIEWPREFS_SCHEMA_VERSION,
    byBinding: {
      "ads:demo|v1": {
        viewMode: "2d",
        perspective: "all",
        hiddenLayers: [],
        cameraX: 0,
        cameraY: 0,
        cameraZoom: 1,
      },
    },
  },
);

assertRejects(
  "a non-boolean isFullscreen field",
  {
    schemaVersion: TRACK3_VIEWPREFS_SCHEMA_VERSION,
    byBinding: {
      "ads:demo|v1": {
        viewMode: "2d",
        perspective: "all",
        hiddenLayers: [],
        cameraX: 0,
        cameraY: 0,
        cameraZoom: 1,
        isFullscreen: "yes",
      },
    },
  },
);

// Deterministic v1.0 → v1.1 migration positive control.
const v10Doc = {
  schemaVersion: "acw-track3-viewprefs-1.0",
  byBinding: {
    "ads:demo|v1": {
      viewMode: "2d",
      perspective: "all",
      hiddenLayers: [],
      cameraX: 0,
      cameraY: 0,
      cameraZoom: 1,
    },
  },
  byArchitecture: {
    "demo-12345678": {
      viewMode: "3d",
      perspective: "infraCentric",
      hiddenLayers: ["application"],
      cameraX: 5,
      cameraY: -2,
      cameraZoom: 1.25,
    },
  },
};
const upgraded = __track3ViewPrefsInternals.migrateV10ToV11(v10Doc);
if (upgraded === null) {
  throw new Error(
    "ACW Track 3 view-prefs invariant: v1.0 → v1.1 migration unexpectedly returned null for a well-formed v1.0 document.",
  );
}
if (upgraded.schemaVersion !== TRACK3_VIEWPREFS_SCHEMA_VERSION) {
  throw new Error(
    "ACW Track 3 view-prefs invariant: v1.0 → v1.1 migration produced the wrong schemaVersion.",
  );
}
if (upgraded.byBinding["ads:demo|v1"].isFullscreen !== true) {
  throw new Error(
    "ACW Track 3 view-prefs invariant: v1.0 → v1.1 migration must default isFullscreen to true on byBinding entries.",
  );
}
if (upgraded.byArchitecture["demo-12345678"].isFullscreen !== true) {
  throw new Error(
    "ACW Track 3 view-prefs invariant: v1.0 → v1.1 migration must default isFullscreen to true on byArchitecture entries.",
  );
}
assertAccepts("the v1.0 → v1.1 migration output", upgraded);
