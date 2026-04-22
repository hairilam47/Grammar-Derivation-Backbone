// Vitest configuration for the canvas-ui artifact.
//
// This config exists to host the executable end-to-end test for
// task #74 (CTAD x CNCF reference catalog) — see
// `tests/e2e/ctad-cncf.e2e.test.ts` and the prose plan in
// `tests/e2e/ctad-cncf.e2e.md`. It mirrors the Vite alias map so
// imports like `@/ctad/...` resolve identically to the dev build.

import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
    globals: false,
  },
});
