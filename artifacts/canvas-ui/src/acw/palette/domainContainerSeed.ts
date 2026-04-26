// EAStudio Phase 1 — domain container seed routine.
//
// The Studio canvas presents the workspace as four immutable
// quadrants (Business / Data / Application / Technology). Each
// quadrant corresponds to a single root-level node carrying a
// stable id and the `isDomainContainer` marker, so the UI can
// address each quadrant deterministically and the read-validator
// continues to accept documents that pre-date EAStudio.
//
// Constitutional discipline:
//   - The seed routine is idempotent. Stable ids
//     (`domain-business`, `domain-data`, `domain-application`,
//     `domain-technology`) collide on a re-seed and the store
//     short-circuits without producing duplicate state. Re-running
//     `ensureDomainContainers` on every Studio mount is therefore
//     safe.
//   - Every container goes through `createNode` — nothing here
//     bypasses the v1 grammar validator. The validator already
//     accepts `Zone` and `BusinessEntity` at the workspace root;
//     EAStudio Phase 1 widened the grammar to declare both kinds
//     legal there before this seed module was written.
//   - Refusals from the store are routed through the shared
//     refusal channel so the StudioCanvas surface inherits the
//     same banner that AuthoringPanel uses. The seed itself never
//     throws.
//
// The four containers are purely structural — they carry no
// `boundParam`, no semantic meaning, and the grammar makes no
// distinction between a "domain" Zone and any other Zone (the
// `domainTag` / `isDomainContainer` flags are pure UI metadata).
import { createNode, getWorkspace, type AcwNode } from "../acwStore";
import { publishRefusal } from "../acwRefusalChannel";
import type { AcwDomainTag, AcwElementType } from "../acwGrammar";
import { ACW_DOMAIN_LABEL } from "./paletteRegistry";

export interface DomainContainerSpec {
  /** Stable, well-known id — collisions short-circuit on re-seed. */
  readonly id: string;
  /** Domain tag stamped onto every child the palette materialises. */
  readonly domain: AcwDomainTag;
  /** Underlying ACW element type (BusinessEntity or Zone). */
  readonly elementType: AcwElementType;
  /** Grid position in the StudioCanvas 2x2 quadrant layout. */
  readonly column: 0 | 1;
  readonly row: 0 | 1;
}

// Grid order — top-left clockwise: Business (0,0), Data (1,0),
// Application (0,1), Technology (1,1). The geometry is referenced
// by `DomainGrid.tsx`; nothing here knows what a quadrant looks
// like, only where the four containers sit relative to one another.
export const ACW_DOMAIN_CONTAINERS: readonly DomainContainerSpec[] = Object.freeze(
  [
    Object.freeze({
      id: "domain-business",
      domain: "business",
      elementType: "BusinessEntity",
      column: 0,
      row: 0,
    }),
    Object.freeze({
      id: "domain-data",
      domain: "data",
      elementType: "Zone",
      column: 1,
      row: 0,
    }),
    Object.freeze({
      id: "domain-application",
      domain: "application",
      elementType: "Zone",
      column: 0,
      row: 1,
    }),
    Object.freeze({
      id: "domain-technology",
      domain: "technology",
      elementType: "Zone",
      column: 1,
      row: 1,
    }),
  ] as const,
);

export function findDomainContainer(domain: AcwDomainTag): AcwNode | undefined {
  const ws = getWorkspace();
  for (const n of ws.structureGraph.nodes) {
    if (n.isDomainContainer === true && n.domainTag === domain) return n;
  }
  return undefined;
}

export function findDomainContainerById(
  id: string,
): AcwNode | undefined {
  const ws = getWorkspace();
  for (const n of ws.structureGraph.nodes) {
    if (n.id === id) return n;
  }
  return undefined;
}

// Idempotent: returns true if every domain container is present
// after the call (whether it was already there or just created).
// Refused creations route through the refusal channel and the
// function returns false so callers can surface a fallback hint.
export function ensureDomainContainers(): boolean {
  let allOk = true;
  for (const spec of ACW_DOMAIN_CONTAINERS) {
    const r = createNode({
      id: spec.id,
      type: spec.elementType,
      parentId: null,
      label: ACW_DOMAIN_LABEL[spec.domain],
      // Position carries no semantics; we still write a deterministic
      // (column, row) coordinate so the four quadrant headers line up
      // when a future renderer chooses to read x/y for layout.
      x: spec.column * 1000,
      y: spec.row * 1000,
      isDomainContainer: true,
      domainTag: spec.domain,
    });
    if (!r.ok) {
      allOk = false;
      publishRefusal(r.reason);
    }
  }
  return allOk;
}
