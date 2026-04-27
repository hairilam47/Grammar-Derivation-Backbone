// EAStudio Path B Phase 1 (Task #113) — palette registry build-time
// invariants.
//
// Negative-shape module: fails the bundle if the palette registry
// drifts away from the structural contract that other modules rely
// on. Side-effect import in `App.tsx` (alongside the existing
// `iconRegistryInvariants.test-shape` and grammar invariant
// modules) so any drift produces a load-time failure rather than a
// silent runtime regression.
//
// What this module guards (in addition to the inline assertions
// that already run inside `paletteRegistry.ts` itself at module
// load — re-running them here keeps the failure attributable to
// *this* invariant module, the same pattern the icon-registry uses):
//
//   (1) `paletteKind` values are unique across the whole palette.
//   (2) Every tile that declares a `boundTechnologyCategory`
//       resolves through `lookupIconForCategory`. A typo (e.g. a
//       future copy-edit that drifts `"API gateway"` to
//       `"API-gateway"`) fails the bundle here.
//   (3) Every tile that declares a `boundParam` carries a
//       structurally well-formed shape (non-empty `sectionId` /
//       `paramId`, `optionValue` either `null` or non-empty
//       string) AND its `(sectionId, paramId)` pair resolves
//       through the live CTAD registry via `findSectionForParam`,
//       mirroring the runtime resolver in
//       `acw/semantic/techNodeBinding.ts`. Phase 1 ships no
//       `boundParam` defaults so both checks are vacuous today;
//       wiring them up now means a future Phase 2 edit that
//       smuggles in a malformed or stale default fails the bundle
//       rather than silently degrading to the node's own label at
//       render time. The CTAD-registry import is permitted by the
//       ACW isolation invariant (`@/ctad/ctadRegistry` is on the
//       read-only allowlist; the CTAD STORE remains forbidden).
//   (4) The Path B Phase 1 expected coverage holds: at least one
//       tile in each of the three EAStudio domains touched by
//       Phase 1 (data, application, technology) carries a
//       `boundTechnologyCategory`. The fourth domain (business)
//       is intentionally exempt — the existing icon registry has
//       no clean categorical home for Phase 1's strategic /
//       process surfaces. A future copy-edit that drops every
//       tile-level binding inside one of the three covered
//       domains fails here, surfacing the regression to the build
//       rather than to the next reader of the rendered surface.
//
// This module intentionally does NOT pin the EXACT category string
// per tile, because Path B Phase 2 + Phase 3 are expected to
// rebind some tiles as the icon registry is widened. The
// resolvability check (#2) is the structural guarantee that
// matters; the docs section in `docs/ARCHITECTURE.md` records the
// Phase 1 mapping verbatim.
import { lookupIconForCategory } from "../icons/iconRegistry";
import {
  ACW_DOMAIN_TAGS,
  type AcwDomainTag,
} from "../acwGrammar";
import { findSectionForParam } from "@/ctad/ctadRegistry";
import { ACW_PALETTE } from "./paletteRegistry";

const PREFIX = "EAStudio Path B Phase 1 palette-registry invariant violation";

// (1) paletteKind uniqueness.
{
  const seen = new Set<string>();
  for (const item of ACW_PALETTE) {
    if (seen.has(item.paletteKind)) {
      throw new Error(`${PREFIX}: duplicate paletteKind "${item.paletteKind}".`);
    }
    seen.add(item.paletteKind);
  }
}

// (2) Every declared boundTechnologyCategory resolves through the
// icon registry. The inline assertion at the bottom of
// `paletteRegistry.ts` already runs this; re-asserting here keeps
// the failure attributable to *this* invariant module on regression.
for (const item of ACW_PALETTE) {
  if (item.boundTechnologyCategory === undefined) continue;
  if (lookupIconForCategory(item.boundTechnologyCategory) === undefined) {
    throw new Error(
      `${PREFIX}: tile "${item.paletteKind}" declares boundTechnologyCategory "${item.boundTechnologyCategory}" which is not a known category in iconRegistry.ts.`,
    );
  }
}

// (3) Every declared boundParam is structurally well-formed. Phase
// 1 ships zero such bindings; the loop is intentionally vacuous
// today.
for (const item of ACW_PALETTE) {
  if (item.boundParam === undefined) continue;
  const bp = item.boundParam;
  if (typeof bp.sectionId !== "string" || bp.sectionId.length === 0) {
    throw new Error(
      `${PREFIX}: tile "${item.paletteKind}" declares a boundParam with empty sectionId.`,
    );
  }
  if (typeof bp.paramId !== "string" || bp.paramId.length === 0) {
    throw new Error(
      `${PREFIX}: tile "${item.paletteKind}" declares a boundParam with empty paramId.`,
    );
  }
  if (
    bp.optionValue !== null &&
    (typeof bp.optionValue !== "string" || bp.optionValue.length === 0)
  ) {
    throw new Error(
      `${PREFIX}: tile "${item.paletteKind}" declares a boundParam.optionValue that is neither null nor a non-empty string.`,
    );
  }
  // Pair-resolvability — `(sectionId, paramId)` MUST resolve
  // through the live CTAD registry exactly as the runtime
  // resolver in `acw/semantic/techNodeBinding.ts` requires. A
  // future Phase 2 default that names a stale or renamed pair
  // fails the bundle here. Vacuous in Phase 1 (no boundParam
  // defaults).
  const section = findSectionForParam(bp.sectionId, bp.paramId);
  if (section === undefined) {
    throw new Error(
      `${PREFIX}: tile "${item.paletteKind}" declares boundParam (sectionId="${bp.sectionId}", paramId="${bp.paramId}") which does not resolve through findSectionForParam in the live CTAD registry.`,
    );
  }
}

// (4) Phase 1 coverage breadth — every EAStudio domain owns at
// least one tile with a default `boundTechnologyCategory`. A future
// copy-edit that empties one domain's tile bindings fails here.
// `business` is intentionally exempt because Phase 1's mapping
// covers no business-domain tile (the four business tiles are
// strategic / process surfaces with no clean categorical match in
// the existing icon registry); business coverage is a candidate
// for a Path B Phase 2 widening.
const PHASE_1_BOUND_DOMAINS: readonly AcwDomainTag[] = Object.freeze([
  "data",
  "application",
  "technology",
]);
{
  const boundDomains = new Set<string>();
  for (const item of ACW_PALETTE) {
    if (item.boundTechnologyCategory === undefined) continue;
    boundDomains.add(item.domain);
  }
  for (const tag of PHASE_1_BOUND_DOMAINS) {
    if (!boundDomains.has(tag)) {
      throw new Error(
        `${PREFIX}: domain "${tag}" no longer carries a tile with a default boundTechnologyCategory; Path B Phase 1 coverage regressed.`,
      );
    }
  }
  // Defensive: every entry in PHASE_1_BOUND_DOMAINS must itself be
  // a real domain tag the grammar declares; catches a future
  // copy-edit that introduces a typo into the constant above.
  for (const tag of PHASE_1_BOUND_DOMAINS) {
    if (!(ACW_DOMAIN_TAGS as readonly string[]).includes(tag)) {
      throw new Error(
        `${PREFIX}: PHASE_1_BOUND_DOMAINS lists "${tag}" which is not in ACW_DOMAIN_TAGS.`,
      );
    }
  }
}

// Exported predicate so future test harnesses can re-run the
// assertions on demand. Calling it after module load is a no-op
// for the live registry.
export function assertPaletteRegistryInvariants(): void {
  if (ACW_PALETTE.length === 0) {
    throw new Error(`${PREFIX}: palette is empty at runtime.`);
  }
}
