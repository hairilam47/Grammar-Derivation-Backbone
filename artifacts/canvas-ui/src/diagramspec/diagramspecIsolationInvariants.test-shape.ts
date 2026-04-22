// DiagramSpec — canvas-ui-side App-boot invariant.
//
// Mirrors the cncf invariant pattern: harvests every source file
// under `lib/diagramspec/src` via Vite's `import.meta.glob` and
// runs the package-internal scanner against them. App.tsx imports
// this file for side effects so the assertion runs at boot time
// alongside the existing CTAD / CNCF / ACW invariants.
//
// Glob path is RELATIVE (`../../../../lib/diagramspec/src/**/*.ts`)
// because the diagramspec sources live OUTSIDE the canvas-ui Vite
// root. A root-relative `/lib/...` glob would silently match zero
// files under the canvas-ui root and turn the invariant into a
// no-op. The non-empty assertion below catches that regression.

import { assertNoForbiddenDiagramspecImports } from "@workspace/diagramspec";

const DIAGRAMSPEC_SOURCES = import.meta.glob<string>(
  ["../../../../lib/diagramspec/src/**/*.ts"],
  { eager: true, query: "?raw", import: "default" },
);

if (Object.keys(DIAGRAMSPEC_SOURCES).length === 0) {
  throw new Error(
    "DiagramSpec invariant wiring violation: the App-boot glob matched zero files under lib/diagramspec/src. The relative path or the Vite glob configuration changed and the isolation scan would silently no-op. Re-verify the relative path and the Vite fs.allow setting.",
  );
}

assertNoForbiddenDiagramspecImports(DIAGRAMSPEC_SOURCES);
