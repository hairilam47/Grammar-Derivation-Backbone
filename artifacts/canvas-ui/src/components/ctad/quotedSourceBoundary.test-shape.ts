// QuotedSource boundary invariant.
//
// CTAD's vocabulary guard exempts CNCF-attributed text. To prevent
// that exemption from quietly leaking, every render of CNCF prose
// fields (description, maturity, justification rationale, project
// name, category/subcategory) inside a CTAD page or component MUST
// be wrapped in a `<QuotedSource source="...">` element so the
// boundary is visible both to the reader and to this scanner.
//
// This file scans every CTAD page and component source for
// occurrences of the protected JSX expressions, and asserts each
// one is enclosed by a nearest-enclosing `<QuotedSource ...>` /
// `</QuotedSource>` pair within a small lexical window. Any
// violation throws at module load.
//
// To extend coverage to a new prose field, add it to
// PROTECTED_EXPRESSIONS. To exempt a file (e.g. the QuotedSource
// implementation itself, or test shapes), add it to EXEMPT_PATHS.

const SCAN_SOURCES = import.meta.glob<string>(
  ["/src/pages/ctad/**/*.{ts,tsx}", "/src/components/ctad/**/*.{ts,tsx}"],
  { eager: true, query: "?raw", import: "default" },
);

// Protected JSX expressions. Each pattern is matched globally
// against each file's source and every match must lie within a
// `<QuotedSource>...</QuotedSource>` window.
const PROTECTED_EXPRESSIONS: readonly RegExp[] = [
  /\{\s*card\.description\s*\}/g,
  /\{\s*card\.maturity\s*\}/g,
  /\{\s*card\.name\s*\}/g,
  /\{\s*card\.category\s*\}/g,
  /\{\s*card\.subcategory\s*\}/g,
  /\{\s*j\.rationale\s*\}/g,
  /\{\s*e\.rationale\s*\}/g,
  /\{\s*hint\.rationale\s*\}/g,
];

// Anti-bypass: forbid destructuring or aliasing CNCF card prose
// fields outside of QuotedSource. Without this rule, the scanner
// could be evaded by writing `const { name, description } = card;`
// or `const r = j.rationale;` and then rendering the bare
// identifier in JSX. The destructuring / aliasing patterns are
// rejected wholesale across CTAD pages and components — there is
// no reason to capture these fields by alias when the JSX form
// `<QuotedSource>{card.name}</QuotedSource>` is just as terse.
const FORBIDDEN_BINDING_PATTERNS: readonly { pattern: RegExp; reason: string }[] = [
  {
    pattern: /(?:const|let|var)\s*\{[^}]*\b(?:name|description|maturity|category|subcategory)\b[^}]*\}\s*=\s*card\b/g,
    reason: "destructures CNCF prose fields off `card`",
  },
  {
    pattern: /(?:const|let|var)\s*\{[^}]*\brationale\b[^}]*\}\s*=\s*(?:j|e|hint)\b/g,
    reason: "destructures `rationale` off a CNCF justification/effect/hint",
  },
  {
    pattern: /(?:const|let|var)\s+\w+\s*=\s*card\.(?:name|description|maturity|category|subcategory)\b/g,
    reason: "aliases a CNCF prose field off `card`",
  },
  {
    pattern: /(?:const|let|var)\s+\w+\s*=\s*(?:j|e|hint)\.rationale\b/g,
    reason: "aliases a CNCF rationale off `j` / `e` / `hint`",
  },
  {
    // Anti-rebinding: `const c = card;` and `const x = j;` style
    // re-aliasing of the protected root identifiers, including
    // wrapped / asserted variants such as `(card)`, `card!`, and
    // `card as Foo`. Without this rule the scanner's `card.field`
    // / `j.rationale` patterns can be sidestepped by routing
    // through an aliased identifier. Rebinding adds no value over
    // using the original name in JSX, so it is rejected wholesale
    // across CTAD pages/components.
    pattern: /(?:const|let|var)\s+[\w$]+(?:\s*:\s*[^=;\n]+?)?\s*=\s*\(*\s*(?:card|j|e|hint)\b\s*\)*\s*(?:!|(?:as|satisfies)\s+[^;,\n]+|[;,\n])/g,
    reason: "rebinds a CNCF root identifier (`card` / `j` / `e` / `hint`) to a new name (including wrapped, non-null-asserted, or `as`-cast forms)",
  },
];

// Replace block comments and line comments with whitespace of the
// same length so that scanning patterns cannot be evaded via
// comment-interleaving (e.g. `const c = card /* alias */;`) and
// line numbers in error messages remain accurate.
function stripCommentsPreservingOffsets(input: string): string {
  // Block comments.
  let out = input.replace(/\/\*[\s\S]*?\*\//g, (m) =>
    m.replace(/[^\n]/g, " "),
  );
  // Line comments — preserve the trailing newline (if any).
  out = out.replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
  return out;
}

// Files where the protected expressions are not subject to the
// boundary rule (e.g. the QuotedSource implementation itself,
// type-only files, this scanner).
const EXEMPT_PATHS: readonly string[] = [
  "components/ctad/QuotedSource.tsx",
  "components/ctad/quotedSourceBoundary.test-shape.ts",
];

// Window size used to look for the nearest enclosing tag. CtadShell
// keeps QuotedSource usage tightly scoped, so 600 chars is plenty.
const WINDOW = 600;

function isExempt(path: string): boolean {
  return EXEMPT_PATHS.some((p) => path.endsWith(p));
}

function withinQuotedSource(
  source: string,
  matchIndex: number,
  matchLength: number,
): boolean {
  const start = Math.max(0, matchIndex - WINDOW);
  const end = Math.min(source.length, matchIndex + matchLength + WINDOW);
  const before = source.slice(start, matchIndex);
  const after = source.slice(matchIndex + matchLength, end);
  // Look for the most recent unbalanced <QuotedSource ...>
  // opener in `before` and a matching </QuotedSource> in `after`.
  const lastOpen = before.lastIndexOf("<QuotedSource");
  const lastClose = before.lastIndexOf("</QuotedSource>");
  // Opener must come after any prior closer (i.e. we are inside
  // an open QuotedSource element).
  if (lastOpen === -1 || lastOpen < lastClose) return false;
  // Closing tag must appear after the match within the window.
  const nextClose = after.indexOf("</QuotedSource>");
  if (nextClose === -1) return false;
  return true;
}

function lineNumber(source: string, idx: number): number {
  let n = 1;
  for (let i = 0; i < idx; i++) if (source[i] === "\n") n += 1;
  return n;
}

export function assertQuotedSourceBoundary(
  sources: Record<string, string>,
): void {
  for (const [path, rawContents] of Object.entries(sources)) {
    if (isExempt(path)) continue;
    const contents = stripCommentsPreservingOffsets(rawContents);
    for (const { pattern, reason } of FORBIDDEN_BINDING_PATTERNS) {
      pattern.lastIndex = 0;
      const match = pattern.exec(contents);
      if (match) {
        throw new Error(
          `QuotedSource boundary violation: file "${path}" line ${lineNumber(contents, match.index)} ${reason} ("${match[0].trim()}"). The boundary scanner only verifies field-access JSX expressions, so destructuring or aliasing CNCF prose fields would silently bypass the rule. Render the field directly inside <QuotedSource source="CNCF">{card.field}</QuotedSource> instead.`,
        );
      }
    }
    for (const pattern of PROTECTED_EXPRESSIONS) {
      // Reset lastIndex on the (sticky-free) regex to be safe.
      pattern.lastIndex = 0;
      const matches = contents.matchAll(pattern);
      for (const m of matches) {
        if (typeof m.index !== "number") continue;
        if (!withinQuotedSource(contents, m.index, m[0].length)) {
          throw new Error(
            `QuotedSource boundary violation: file "${path}" line ${lineNumber(contents, m.index)} renders the protected CNCF expression "${m[0].trim()}" outside any <QuotedSource> element. Wrap the expression in <QuotedSource source="CNCF">…</QuotedSource> so the third-party text boundary is explicit and the CTAD vocabulary guard exemption stays visible.`,
          );
        }
      }
    }
  }
}

assertQuotedSourceBoundary(SCAN_SOURCES);
