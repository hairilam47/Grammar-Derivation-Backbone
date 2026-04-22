// DiagramSpec — module-load self-assertion.
//
// This file runs at package import time and applies the
// `assertNoForbiddenDiagramspecImports` scanner to the package's
// OWN source tree. It mirrors the module-load invariant pattern
// used by `lib/cncf-catalog/src/catalog.ts` (which checks card-id
// uniqueness at import time) so that any consumer of
// `@workspace/diagramspec` immediately sees a violation if a
// forbidden import (three / @react-three / elkjs / cncf catalog)
// sneaks into a package source file.
//
// Environment handling:
//   - In Node (vitest, the API server, scripts): we walk sibling
//     `.ts` source files via `node:fs` + `node:url` and run the
//     scanner synchronously enough to surface real violations
//     before any consumer can call into the compiler.
//   - In browser bundles (Vite-built canvas-ui): `node:fs` is not
//     available and the dynamic `import("node:fs")` rejects. The
//     canvas-ui App boot path additionally re-runs the scanner
//     against the source tree using `import.meta.glob`, so the
//     invariant is still enforced in that environment.
//
// We intentionally re-throw only invariant violations and swallow
// environment errors (missing `node:fs`, unsupported runtime) —
// the goal is "fail closed on forbidden imports, never break
// browser builds with environment-detection noise".

import { assertNoForbiddenDiagramspecImports } from "./diagramspecIsolation";

const VIOLATION_PREFIX = "DiagramSpec invariant violation";

async function runOnLoad(): Promise<void> {
  // Node-only path. `process` is undefined in pure browser builds.
  // The optional-chain on `versions?.node` keeps us safe in
  // environments that polyfill `process` without runtime version
  // metadata (e.g. some Vite SSR shims).
  const nodeProcess =
    typeof process !== "undefined" ? (process as NodeJS.Process) : null;
  if (!nodeProcess || !nodeProcess.versions || !nodeProcess.versions.node) {
    return;
  }
  try {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const url = await import("node:url");
    const here = url.fileURLToPath(import.meta.url);
    const root = path.dirname(here);
    const sources: Record<string, string> = {};
    // Recursive walk: future reorganisation into nested
    // subdirectories under `lib/diagramspec/src/` should remain
    // covered by this module-load invariant without code changes.
    const stack: string[] = [root];
    while (stack.length > 0) {
      const dir = stack.pop() as string;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          stack.push(full);
          continue;
        }
        if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
        const rel = path.relative(root, full);
        sources[rel] = fs.readFileSync(full, "utf8");
      }
    }
    assertNoForbiddenDiagramspecImports(sources);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith(VIOLATION_PREFIX)) {
      throw err;
    }
    // Otherwise: environment doesn't support fs — silently skip.
  }
}

// Top-level await: blocks package init until the invariant has
// been applied. This is the whole point of a module-load
// assertion — fail before consumer code runs.
await runOnLoad();
