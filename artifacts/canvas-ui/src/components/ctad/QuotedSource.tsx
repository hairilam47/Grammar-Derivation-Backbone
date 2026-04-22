// QuotedSource — third-party text boundary.
//
// Renders attributable text (e.g. CNCF Cloud Native Landscape
// project descriptions and maturity labels) as italicised quoted
// material with a visible source attribution. Text rendered
// through this component is EXEMPT from the CTAD vocabulary
// guard: the boundary makes it unambiguous that the words are
// quoted from an external source, not authored by CTAD.
//
// The component performs no vocabulary check on its children
// because that is the entire point. Authored CTAD copy must
// continue to flow through `assertAllCtadLanguage`; quoted
// third-party copy must come through here.
//
// Attribution is ALWAYS visible: in block mode it renders as a
// trailing dash-prefixed em-line ("— CNCF Cloud Native
// Landscape"); in inline mode it renders as a parenthetical
// suffix ("(CNCF Cloud Native Landscape)"). Per task #74 the
// attribution must be visible at every CNCF surface, so the
// inline mode no longer suppresses it.
//
// The `data-quoted-source` attribute is the marker that the
// CtadShell-level invariant scans for: any direct rendering of
// CNCF card text outside this component is rejected.

import type { ReactNode } from "react";

export interface QuotedSourceProps {
  readonly source: string;
  readonly children: ReactNode;
  readonly testId?: string;
  readonly inline?: boolean;
}

export function QuotedSource({
  source,
  children,
  testId,
  inline = false,
}: QuotedSourceProps) {
  return (
    <span
      data-quoted-source={source}
      data-testid={testId}
      className="italic text-muted-foreground"
    >
      <span aria-hidden="true">&ldquo;</span>
      {children}
      <span aria-hidden="true">&rdquo;</span>
      {inline ? (
        <span className="not-italic ml-1 text-[10px] text-muted-foreground/70">
          ({source})
        </span>
      ) : (
        <span className="not-italic ml-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">
          — {source}
        </span>
      )}
    </span>
  );
}

export default QuotedSource;
