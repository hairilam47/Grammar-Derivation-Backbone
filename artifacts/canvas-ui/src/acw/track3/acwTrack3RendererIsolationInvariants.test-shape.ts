// ACW Track 3 — renderer-isolation invariant.
//
// The Track 3 renderer (everything under
// `src/components/acw/track3/`) MUST consume only:
//   - the diagram pipeline output (`@workspace/diagramspec` types
//     and `@workspace/diagram-layout` positioned diagrams),
//   - the shared visibility helper from `@/acw/acwLensStructure`,
//   - the local diagram-adapter (`@/acw/track3/...`) and language
//     guard,
//   - and standard React / R3F / drei runtime.
//
// It MUST NOT reach into the CTAD store, the CNCF catalog, the
// portfolio store, or any product-vendor surface. This invariant
// is the constitutional firewall between the rendering layer and
// every domain store: a renderer that depends on a domain store
// would re-introduce the coupling the DiagramSpec migration was
// designed to break.
//
// Implementation mirrors the established pattern: Vite's
// `import.meta.glob` with `?raw` loads every renderer source file
// as a string at bundle time; we scan each for forbidden import
// specifiers. A match throws at module load, failing the bundle.

const RENDERER_SOURCES = import.meta.glob<string>(
  ["/src/components/acw/track3/**/*.{ts,tsx}"],
  { eager: true, query: "?raw", import: "default" },
);

// Forbidden import-path prefixes. A module path starting with any
// of these literals fails the invariant.
const FORBIDDEN_PREFIXES: readonly string[] = Object.freeze([
  "@/ctad",
  "@/cncf",
  "@workspace/cncf-catalog",
  "@/governance/portfolioStore",
]);

const SELF_FILENAMES: readonly string[] = [
  "acwTrack3RendererIsolationInvariants.test-shape.ts",
];

function importsOf(source: string): string[] {
  const out: string[] = [];
  const re =
    /(?:import\s+[^"';]*?from\s*|import\s*\(\s*|export\s+[^"';]*?from\s*)["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) out.push(m[1]);
  return out;
}

export function assertRendererIsolation(
  sources: Record<string, string>,
): void {
  for (const [path, contents] of Object.entries(sources)) {
    if (SELF_FILENAMES.some((s) => path.endsWith(s))) continue;
    for (const spec of importsOf(contents)) {
      for (const banned of FORBIDDEN_PREFIXES) {
        if (spec === banned || spec.startsWith(`${banned}/`)) {
          throw new Error(
            `ACW Track 3 renderer-isolation invariant: file "${path}" imports forbidden module "${spec}". Renderer must consume only DiagramSpec / diagram-layout output plus the shared visibility helper.`,
          );
        }
      }
    }
  }
}

// In-module self-test: every forbidden import shape is exercised.
function selfTest(): void {
  const bad: ReadonlyArray<{ readonly label: string; readonly src: string }> = [
    { label: "ctad store", src: `import { x } from "@/ctad/ctadStore";` },
    { label: "cncf catalog", src: `import { y } from "@/cncf/cncfCatalog";` },
    {
      label: "workspace cncf-catalog",
      src: `import { z } from "@workspace/cncf-catalog";`,
    },
    {
      label: "portfolio store",
      src: `import { listEntries } from "@/governance/portfolioStore";`,
    },
    {
      label: "ctad dynamic import",
      src: `const m = await import("@/ctad/ctadStore");`,
    },
  ];
  for (const { label, src } of bad) {
    let threw = false;
    try {
      assertRendererIsolation({
        "/src/components/acw/track3/__synthetic__.tsx": src,
      });
    } catch {
      threw = true;
    }
    if (!threw) {
      throw new Error(
        `ACW Track 3 renderer-isolation invariant self-test: scan failed to reject "${label}".`,
      );
    }
  }
  // Positive control — approved imports must NOT throw.
  const ok = `import { useFrame } from "@react-three/fiber";
import { enumerateLensVisibility } from "@/acw/acwLensStructure";
import type { PositionedDiagram } from "@workspace/diagram-layout";`;
  try {
    assertRendererIsolation({
      "/src/components/acw/track3/__synthetic__.tsx": ok,
    });
  } catch (e) {
    throw new Error(
      `ACW Track 3 renderer-isolation invariant self-test: scan rejected approved import shape: ${(e as Error).message}`,
    );
  }
}
selfTest();

assertRendererIsolation(RENDERER_SOURCES);
