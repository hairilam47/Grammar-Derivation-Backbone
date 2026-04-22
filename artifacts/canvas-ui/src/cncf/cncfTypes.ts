// Re-exports from the workspace package `@workspace/cncf-catalog`.
//
// The catalog data and its type contracts now live in the workspace
// package `lib/cncf-catalog` per task #74 step 1. This file is kept
// as a re-export shim so that existing imports of `./cncfTypes` from
// inside the canvas-ui artifact continue to resolve unchanged.

export type {
  BindingHint,
  CncfCard,
  CncfCategory,
  CncfMaturity,
} from "@workspace/cncf-catalog";
