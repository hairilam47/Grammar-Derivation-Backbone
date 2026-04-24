// ACW workspace viewprefs — schema + storage round-trip tests
// (Task #86).
//
// Covers:
//   - schema validator accepts a baseline doc and rejects forbidden
//     top-level / per-lens fields, wrong schemaVersion, missing
//     byLens, and a non-boolean `isFullscreen`,
//   - default lens prefs return `isFullscreen: true` (the new
//     default mirrors Track 3's v1.1 default),
//   - `setLensFullscreen` round-trips through localStorage and
//     fires subscribers,
//   - the cache is cleared between tests so subscriber counts and
//     storage state stay deterministic.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ACW_WORKSPACE_VIEWPREFS_SCHEMA_VERSION,
  __acwWorkspaceViewPrefsInternals,
  clearAllPrefs,
  getDoc,
  getLensPrefs,
  isLensFullscreen,
  setLensFullscreen,
  subscribePrefs,
  toggleLensFullscreen,
} from "../src/acw/acwWorkspaceViewPrefs";

const { assertValidPrefsDoc, STORAGE_KEY, reloadFromStorageForTest } =
  __acwWorkspaceViewPrefsInternals;

beforeEach(() => {
  window.localStorage.clear();
  reloadFromStorageForTest();
});

afterEach(() => {
  clearAllPrefs();
});

describe("acwWorkspaceViewPrefs — schema validator", () => {
  const VALID = {
    schemaVersion: ACW_WORKSPACE_VIEWPREFS_SCHEMA_VERSION,
    byLens: {
      "/workspace/landscape": { isFullscreen: true },
    },
  };

  it("accepts a baseline valid v1.0 document", () => {
    expect(() => assertValidPrefsDoc(VALID)).not.toThrow();
  });

  it("rejects a non-object document", () => {
    expect(() => assertValidPrefsDoc("nope")).toThrow();
    expect(() => assertValidPrefsDoc(null)).toThrow();
  });

  it("rejects a top-level forbidden field (smuggled structural payload)", () => {
    expect(() =>
      assertValidPrefsDoc({ ...VALID, nodes: [{ id: "x" }] }),
    ).toThrow();
  });

  it("rejects a wrong schemaVersion", () => {
    expect(() =>
      assertValidPrefsDoc({
        ...VALID,
        schemaVersion: "acw-workspace-viewprefs-2.0",
      }),
    ).toThrow();
  });

  it("rejects a per-lens forbidden field", () => {
    expect(() =>
      assertValidPrefsDoc({
        schemaVersion: ACW_WORKSPACE_VIEWPREFS_SCHEMA_VERSION,
        byLens: {
          "/workspace/landscape": { isFullscreen: true, foreign: 1 },
        },
      }),
    ).toThrow();
  });

  it("rejects a non-boolean isFullscreen", () => {
    expect(() =>
      assertValidPrefsDoc({
        schemaVersion: ACW_WORKSPACE_VIEWPREFS_SCHEMA_VERSION,
        byLens: {
          "/workspace/landscape": { isFullscreen: "yes" },
        },
      }),
    ).toThrow();
  });

  it("rejects a missing byLens field", () => {
    expect(() =>
      assertValidPrefsDoc({
        schemaVersion: ACW_WORKSPACE_VIEWPREFS_SCHEMA_VERSION,
      }),
    ).toThrow();
  });
});

describe("acwWorkspaceViewPrefs — default + storage round-trip", () => {
  it("getLensPrefs returns isFullscreen: true by default", () => {
    expect(getLensPrefs("/workspace/landscape").isFullscreen).toBe(true);
    expect(isLensFullscreen("/workspace/deployment")).toBe(true);
  });

  it("setLensFullscreen persists to localStorage and reads back", () => {
    setLensFullscreen("/workspace/landscape", false);
    const raw = window.localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.schemaVersion).toBe(
      ACW_WORKSPACE_VIEWPREFS_SCHEMA_VERSION,
    );
    expect(parsed.byLens["/workspace/landscape"].isFullscreen).toBe(false);
    // Independent fresh read picks up the same value.
    reloadFromStorageForTest();
    expect(isLensFullscreen("/workspace/landscape")).toBe(false);
  });

  it("toggleLensFullscreen flips the value", () => {
    expect(isLensFullscreen("/workspace/deployment")).toBe(true);
    toggleLensFullscreen("/workspace/deployment");
    expect(isLensFullscreen("/workspace/deployment")).toBe(false);
    toggleLensFullscreen("/workspace/deployment");
    expect(isLensFullscreen("/workspace/deployment")).toBe(true);
  });

  it("subscribePrefs fires on mutation and unsubscribes cleanly", () => {
    let fires = 0;
    const unsubscribe = subscribePrefs(() => {
      fires += 1;
    });
    setLensFullscreen("/workspace/landscape", false);
    expect(fires).toBe(1);
    setLensFullscreen("/workspace/landscape", true);
    expect(fires).toBe(2);
    unsubscribe();
    setLensFullscreen("/workspace/landscape", false);
    expect(fires).toBe(2);
  });

  it("getDoc reflects the latest mutation", () => {
    setLensFullscreen("/workspace/deployment", false);
    expect(getDoc().byLens["/workspace/deployment"].isFullscreen).toBe(false);
    setLensFullscreen("/workspace/landscape", false);
    expect(getDoc().byLens["/workspace/landscape"].isFullscreen).toBe(false);
    expect(getDoc().byLens["/workspace/deployment"].isFullscreen).toBe(false);
  });

  it("rejects malformed storage payloads on read (drops to empty doc)", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        schemaVersion: "acw-workspace-viewprefs-9.9",
        byLens: {},
      }),
    );
    reloadFromStorageForTest();
    // Default re-emerges; no surface error.
    expect(isLensFullscreen("/workspace/landscape")).toBe(true);
  });
});
