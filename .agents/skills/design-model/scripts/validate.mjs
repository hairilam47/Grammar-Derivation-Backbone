#!/usr/bin/env node
// Validator for designs/system-model.yaml.
//
// Checks:
//   1. ID uniqueness across the whole model.
//   2. ID-grammar conformance per kind.
//   3. Cross-reference resolution: every reference points at an existing ID.
//
// Exit codes:
//   0  validation passed (warnings allowed)
//   1  validation failed (one or more errors)
//   2  internal failure (file unreadable, parser missing)
//
// Usage:
//   node validate.mjs <path-to-model.yaml>
//   node validate.mjs --json <path-to-model.json>

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { argv, exit, stdout, stderr } from "node:process";

// ─── ID grammar ───────────────────────────────────────────────────────────
// Mirror the table in SKILL.md. Regex matches the part AFTER "<kind>:".
const KIND_RULES = {
  actor:    { name: /^[A-Z][A-Za-z0-9]*$/,                              section: "actors" },
  entity:   { name: /^([a-z0-9-]+\/)?[A-Z][A-Za-z0-9]*$/,               section: "entities" },
  process:  { name: /^[a-z][a-z0-9-]*$/,                                section: "processes" },
  pool:     { name: /^[a-z][a-z0-9-]*$/,                                section: null /* nested */ },
  lane:     { name: /^[a-z][a-z0-9-]*$/,                                section: null },
  task:     { name: /^[a-z][a-z0-9-]*$/,                                section: null },
  gateway:  { name: /^[a-z][a-z0-9-]*$/,                                section: null },
  event:    { name: /^[a-z][a-z0-9-]*$/,                                section: null },
  service:  { name: /^[A-Z][A-Za-z0-9]*$/,                              section: "services" },
  function: { name: /^[A-Z][A-Za-z0-9]*\.[a-z][A-Za-z0-9]*$/,           section: "functions" },
  module:   { name: /^[a-z][a-z0-9-]*(\/[a-z][a-z0-9-]*)*$/,            section: "modules" },
  flow:     { name: /^[a-z][a-z0-9-]*$/,                                section: "flows" },
  node:     { name: /^[a-z][a-z0-9-]*$/,                                section: null /* technology.nodes */ },
  usecase:  { name: /^[a-z][a-z0-9-]*$/,                                section: "usecases" },
};

// Cross-reference fields. Each entry: where to walk, and what kind(s) the
// value must resolve to. Use `kind` for a single-kind ref or `kinds` for
// a ref that may resolve to any of several kinds (e.g. BPMN flow endpoints).
const CROSS_REFS = [
  // Process tasks → functions, entities, lanes
  { path: "processes[].tasks[].implementedBy[]", kind: "function" },
  { path: "processes[].tasks[].consumes[]",      kind: "entity"   },
  { path: "processes[].tasks[].produces[]",      kind: "entity"   },
  { path: "processes[].tasks[].lane",            kind: "lane"     },
  // Process pools → lanes → actor
  { path: "processes[].pools[].lanes[].actor",   kind: "actor"    },
  // Process events → lanes
  { path: "processes[].events[].lane",           kind: "lane"     },
  { path: "processes[].gateways[].lane",         kind: "lane"     },
  // BPMN flow edges — endpoints may be events, tasks, or gateways
  { path: "processes[].flows[].from",            kinds: ["event", "task", "gateway"] },
  { path: "processes[].flows[].to",              kinds: ["event", "task", "gateway"] },
  // Entity relationships
  { path: "entities[].relationships[].to",       kind: "entity"   },
  // Services
  { path: "services[].module",                   kind: "module"   },
  { path: "services[].exposes[]",                kind: "function" },
  { path: "services[].consumes[]",               kind: "function" },
  // Functions
  { path: "functions[].service",                 kind: "service"  },
  { path: "functions[].reads[]",                 kind: "entity"   },
  { path: "functions[].writes[]",                kind: "entity"   },
  { path: "functions[].flows[]",                 kind: "flow"     },
  // Modules
  { path: "modules[].contains[]",                kind: "service"  },
  { path: "modules[].allowedDependencies[]",     kind: "module"   },
  { path: "modules[].forbiddenDependencies[]",   kind: "module"   },
  { path: "modules[].deployedTo[]",              kind: "node"     },
  // Flows
  { path: "flows[].process",                     kind: "process"  },
  { path: "flows[].sequence[]",                  kind: "function" },
  // Use cases
  { path: "usecases[].actors[]",                 kind: "actor"    },
  { path: "usecases[].include[]",                kind: "usecase"  },
  { path: "usecases[].extend[].usecase",         kind: "usecase"  },
  { path: "usecases[].specializes",              kind: "usecase"  },
];

// IDs of objects nested inside other objects (not top-level sections).
// Used by collectIds. Each entry: where to find the nested objects.
const NESTED_ID_LOCATIONS = [
  { path: "processes[].pools[]",          kind: "pool"    },
  { path: "processes[].pools[].lanes[]",  kind: "lane"    },
  { path: "processes[].tasks[]",          kind: "task"    },
  { path: "processes[].gateways[]",       kind: "gateway" },
  { path: "processes[].events[]",         kind: "event"   },
  { path: "technology.nodes[]",           kind: "node"    },
];

const TOP_LEVEL_ID_SECTIONS = [
  { section: "actors",    kind: "actor"    },
  { section: "entities",  kind: "entity"   },
  { section: "processes", kind: "process"  },
  { section: "services",  kind: "service"  },
  { section: "functions", kind: "function" },
  { section: "modules",   kind: "module"   },
  { section: "flows",     kind: "flow"     },
  { section: "usecases",  kind: "usecase"  },
];

// ─── Reporter ─────────────────────────────────────────────────────────────
class Report {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.summary = [];
  }
  error(title, fields) {
    this.errors.push({ title, fields });
  }
  warn(message) {
    this.warnings.push(message);
  }
  note(line) {
    this.summary.push(line);
  }
  print() {
    stdout.write("\nSections:\n");
    for (const line of this.summary) stdout.write(`  ${line}\n`);

    if (this.errors.length > 0) {
      stdout.write(`\nERRORS (${this.errors.length}):\n`);
      this.errors.forEach((e, i) => {
        stdout.write(`  ${i + 1}. ${e.title}\n`);
        for (const [k, v] of Object.entries(e.fields)) {
          stdout.write(`     ${k}: ${v}\n`);
        }
      });
    }
    if (this.warnings.length > 0) {
      stdout.write(`\nWARNINGS (${this.warnings.length}):\n`);
      this.warnings.forEach((w, i) => stdout.write(`  ${i + 1}. ${w}\n`));
    }
    stdout.write(
      this.errors.length === 0
        ? "\nVALIDATION PASSED.\n"
        : "\nVALIDATION FAILED.\n",
    );
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function* walk(root, pathExpr) {
  // Walk a model along a path expression like "processes[].tasks[].lane".
  // Yields { value, location } where location is a human-readable path.
  const parts = pathExpr.split(".");
  yield* walkParts(root, parts, 0, "");
}

function* walkParts(value, parts, idx, location) {
  if (value === undefined || value === null) return;
  if (idx === parts.length) {
    yield { value, location };
    return;
  }
  const part = parts[idx];
  const isList = part.endsWith("[]");
  const key = isList ? part.slice(0, -2) : part;
  const next = value[key];
  if (next === undefined || next === null) return;
  const subLoc = location ? `${location}.${key}` : key;
  if (isList) {
    if (!Array.isArray(next)) return;
    for (let i = 0; i < next.length; i++) {
      yield* walkParts(next[i], parts, idx + 1, `${subLoc}[${i}]`);
    }
  } else {
    yield* walkParts(next, parts, idx + 1, subLoc);
  }
}

function parseId(id) {
  if (typeof id !== "string") return null;
  const colon = id.indexOf(":");
  if (colon < 1) return null;
  return { kind: id.slice(0, colon), name: id.slice(colon + 1), full: id };
}

function nearestMatch(target, candidates) {
  // Cheap suggestion: same kind, smallest case-insensitive Levenshtein.
  const parsed = parseId(target);
  if (!parsed) return null;
  const sameKind = [...candidates].filter((c) => c.startsWith(parsed.kind + ":"));
  if (sameKind.length === 0) return null;
  let best = null;
  let bestDist = Infinity;
  for (const c of sameKind) {
    const d = levenshtein(target.toLowerCase(), c.toLowerCase());
    if (d < bestDist && d <= Math.max(2, Math.floor(target.length / 4))) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// ─── Loader ───────────────────────────────────────────────────────────────
async function loadModel(path, asJson) {
  const text = await readFile(path, "utf8");
  if (asJson) {
    try { return JSON.parse(text); }
    catch (e) {
      stderr.write(`Failed to parse JSON: ${e.message}\n`);
      exit(2);
    }
  }
  let yaml;
  try {
    yaml = await import("yaml");
  } catch {
    stderr.write(
      "The 'yaml' package is not installed.\n" +
      "Install it once at the workspace root: pnpm add -D -w yaml\n" +
      "Or pass --json with a JSON model file: node validate.mjs --json model.json\n",
    );
    exit(2);
  }
  try {
    return yaml.parse(text);
  } catch (e) {
    stderr.write(`Failed to parse YAML: ${e.message}\n`);
    exit(2);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────
async function main() {
  const args = argv.slice(2);
  let asJson = false;
  const files = [];
  for (const a of args) {
    if (a === "--json") asJson = true;
    else if (a === "-h" || a === "--help") {
      stdout.write("Usage: node validate.mjs [--json] <path-to-model>\n");
      exit(0);
    } else files.push(a);
  }
  if (files.length !== 1) {
    stderr.write("Usage: node validate.mjs [--json] <path-to-model>\n");
    exit(2);
  }
  const modelPath = resolve(files[0]);
  const model = await loadModel(modelPath, asJson);
  if (!model || typeof model !== "object") {
    stderr.write("Model file did not parse to an object.\n");
    exit(2);
  }

  stdout.write(`Validating ${modelPath}…\n`);
  const report = new Report();

  // metadata
  if (!model.metadata || typeof model.metadata !== "object") {
    report.error("metadata section missing", { fix: "Add a metadata: { name, version } block." });
  } else {
    if (!model.metadata.name) report.error("metadata.name missing", { fix: "Set metadata.name to the project name." });
    if (!model.metadata.version) report.error("metadata.version missing", { fix: "Set metadata.version (e.g. 0.1.0)." });
    if (model.metadata.name && model.metadata.version) report.note("✓ metadata");
  }

  // Collect every ID in the model with where it came from.
  const idIndex = new Map(); // id -> { location, kind }
  const dupes = [];

  function register(id, location, expectedKind) {
    if (typeof id !== "string") {
      report.error("ID is not a string", { at: location, got: JSON.stringify(id) });
      return;
    }
    const parsed = parseId(id);
    if (!parsed) {
      report.error("ID grammar violation", {
        at: location,
        got: JSON.stringify(id),
        want: `format "<kind>:<name>" with a non-empty kind and name`,
      });
      return;
    }
    const rule = KIND_RULES[parsed.kind];
    if (!rule) {
      report.error("Unknown ID kind", {
        at: location,
        got: id,
        want: `kind must be one of: ${Object.keys(KIND_RULES).join(", ")}`,
      });
      return;
    }
    if (expectedKind && parsed.kind !== expectedKind) {
      report.error("ID kind does not match its section", {
        at: location,
        got: id,
        want: `kind must be "${expectedKind}:" because the object lives in this section`,
      });
      return;
    }
    if (!rule.name.test(parsed.name)) {
      report.error("ID grammar violation", {
        at: location,
        got: id,
        want: `name part must match ${rule.name}`,
      });
      return;
    }
    if (idIndex.has(id)) {
      dupes.push({ id, first: idIndex.get(id).location, second: location });
    } else {
      idIndex.set(id, { location, kind: parsed.kind });
    }
  }

  // Top-level sections
  for (const { section, kind } of TOP_LEVEL_ID_SECTIONS) {
    const list = model[section];
    if (list === undefined || list === null) continue;
    if (!Array.isArray(list)) {
      report.error("Section is not a list", { at: section, want: "a YAML list ([] or - items)" });
      continue;
    }
    list.forEach((obj, i) => {
      if (!obj || typeof obj !== "object") {
        report.error("List item is not an object", { at: `${section}[${i}]` });
        return;
      }
      register(obj.id, `${section}[${i}].id`, kind);
    });
    report.note(`✓ ${list.length} ${section}`);
  }

  // Nested IDs
  for (const { path, kind } of NESTED_ID_LOCATIONS) {
    for (const { value, location } of walk(model, path)) {
      if (!value || typeof value !== "object") continue;
      register(value.id, `${location}.id`, kind);
    }
  }

  // Duplicates
  for (const d of dupes) {
    report.error("Duplicate ID", {
      id: d.id,
      first: d.first,
      second: d.second,
    });
  }

  // Cross-references
  for (const ref of CROSS_REFS) {
    const allowedKinds = ref.kinds ?? [ref.kind];
    const wantPhrase = allowedKinds.length === 1
      ? `a ${allowedKinds[0]}: ID`
      : `one of: ${allowedKinds.map((k) => k + ":").join(", ")}`;
    for (const { value, location } of walk(model, ref.path)) {
      if (value === undefined || value === null) continue;
      const values = Array.isArray(value) ? value : [value];
      values.forEach((v, i) => {
        const at = Array.isArray(value) ? `${location}[${i}]` : location;
        if (typeof v !== "string") {
          report.error("Cross-reference is not a string", { at, got: JSON.stringify(v) });
          return;
        }
        // Generic refs must be exact IDs. The "entity:Name.attribute"
        // dotted form is only valid in the dedicated foreignKey check
        // below — accepting it here would let dotted refs slip through
        // fields like functions[].reads[].
        const found = idIndex.get(v);
        if (!found) {
          const fields = { at, got: v };
          const hint = nearestMatch(v, idIndex.keys());
          if (hint) fields.hint = `${hint} exists — typo?`;
          report.error("Cross-reference unresolved", fields);
          return;
        }
        if (!allowedKinds.includes(found.kind)) {
          report.error("Cross-reference points at wrong kind", {
            at, got: v,
            want: `${wantPhrase}, found a ${found.kind}: ID instead`,
          });
        }
      });
    }
  }

  // Special case: foreignKey on entity attributes
  if (Array.isArray(model.entities)) {
    model.entities.forEach((ent, i) => {
      if (!Array.isArray(ent?.attributes)) return;
      ent.attributes.forEach((attr, j) => {
        if (!attr?.foreignKey) return;
        const fk = String(attr.foreignKey);
        const at = `entities[${i}].attributes[${j}].foreignKey`;
        const dot = fk.lastIndexOf(".");
        if (dot < 0 || !fk.startsWith("entity:")) {
          report.error("foreignKey must be 'entity:Name.attribute'", { at, got: fk });
          return;
        }
        const entId = fk.slice(0, dot);
        const attrName = fk.slice(dot + 1);
        const target = idIndex.get(entId);
        if (!target || target.kind !== "entity") {
          report.error("foreignKey target entity not found", { at, got: fk });
          return;
        }
        const targetEnt = model.entities.find((e) => e.id === entId);
        const has = (targetEnt?.attributes || []).some((a) => a.name === attrName);
        if (!has) {
          report.error("foreignKey target attribute not found", {
            at, got: fk,
            want: `${entId} must declare an attribute named "${attrName}"`,
          });
        }
      });
    });
  }

  // Function ID must match its declared service
  if (Array.isArray(model.functions)) {
    model.functions.forEach((fn, i) => {
      if (!fn?.id || !fn?.service) return;
      const parsed = parseId(fn.id);
      if (!parsed || parsed.kind !== "function") return;
      const ownerFromId = "service:" + parsed.name.split(".")[0];
      if (ownerFromId !== fn.service) {
        report.error("function ID does not match its declared service", {
          at: `functions[${i}]`,
          got: `${fn.id} declares service ${fn.service}`,
          want: `the part before "." in the function ID must equal the service name (expected ${ownerFromId})`,
        });
      }
    });
  }

  // Orphan-entity warnings (not blocking)
  if (Array.isArray(model.entities) && Array.isArray(model.functions)) {
    const reads = new Set();
    const writes = new Set();
    for (const fn of model.functions) {
      for (const r of fn?.reads || []) reads.add(r);
      for (const w of fn?.writes || []) writes.add(w);
    }
    for (const ent of model.entities) {
      if (!ent?.id) continue;
      if (!reads.has(ent.id) && !writes.has(ent.id)) {
        report.warn(`Orphan entity: ${ent.id} (no function reads or writes it)`);
      }
    }
  }

  report.print();
  exit(report.errors.length === 0 ? 0 : 1);
}

main().catch((e) => {
  stderr.write(`Internal error: ${e.stack || e.message}\n`);
  exit(2);
});
