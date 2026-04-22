// DiagramSpec — viewType × stratum pairing rules.
//
// Pairing constraints encode C4 semantics. A `context` view is
// architectural at the highest level (organization, strategy);
// a `container` view sits between business and application; a
// `component` view drills into application internals; a
// `deployment` view is technology-only. Mixed pairings are
// rejected by the validator.

import type { DiagramStratum, DiagramViewType } from "./types";

export const ALLOWED_STRATA_FOR_VIEW: Readonly<
  Record<DiagramViewType, readonly DiagramStratum[]>
> = Object.freeze({
  context: Object.freeze(["organization", "strategy"]),
  container: Object.freeze(["business", "application"]),
  component: Object.freeze(["application"]),
  deployment: Object.freeze(["technology"]),
});

export function isPairingAllowed(
  viewType: DiagramViewType,
  stratum: DiagramStratum,
): boolean {
  const allowed = ALLOWED_STRATA_FOR_VIEW[viewType];
  if (!allowed) return false;
  return allowed.includes(stratum);
}
