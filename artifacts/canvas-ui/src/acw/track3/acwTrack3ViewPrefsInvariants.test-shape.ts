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
import {
  TRACK3_VIEWPREFS_SCHEMA_VERSION,
  assertValidPrefsDoc,
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
    },
  },
};

assertAccepts("a baseline valid document", VALID_DOC);

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
      },
    },
  },
);
