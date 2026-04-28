#!/usr/bin/env node
// Generator for the ERD layer.
//
// Reads designs/system-model.yaml (or --json file), writes:
//   designs/diagrams/erd.puml             (always)
//   designs/diagrams/erd.ddl.sql          (only with --ddl)
//
// Reports warnings for entity-layer-specific gaps the foundation
// validator does not catch (no attributes, multiple primary keys,
// dangling FK target attributes already caught by validator are skipped).
//
// Lists orphan entities (no function reads or writes them) at the end.
//
// Exit codes:
//   0 — success (warnings allowed)
//   2 — internal failure (file unreadable, parse error, missing entities)

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { argv, exit, stdout, stderr } from "node:process";

// PlantUML cardinality symbol mapping. Keep in sync with
// references/cardinality.md and the table in SKILL.md.
const CARDINALITY = {
  "one-to-one":   { required: "||--||", optional: "||--|o" },
  "one-to-many":  { required: "||--|{", optional: "||--o{" },
  "many-to-one":  { required: "}|--||", optional: "}o--||" },
  "many-to-many": { required: "}|--|{", optional: "}o--o{" },
};

const REVERSE_CARDINALITY = {
  "one-to-one":   "one-to-one",
  "one-to-many":  "many-to-one",
  "many-to-one":  "one-to-many",
  "many-to-many": "many-to-many",
};

async function loadModel(path, asJson) {
  const text = await readFile(path, "utf8");
  if (asJson) {
    try { return JSON.parse(text); }
    catch (e) { fatal(`Failed to parse JSON: ${e.message}`); }
  }
  let yaml;
  try { yaml = await import("yaml"); }
  catch {
    fatal(
      "The 'yaml' package is not installed.\n" +
      "Install it once at the workspace root: pnpm add -D -w yaml\n" +
      "Or pass --json with a JSON model file."
    );
  }
  try { return yaml.parse(text); }
  catch (e) { fatal(`Failed to parse YAML: ${e.message}`); }
}

function fatal(message) {
  stderr.write(`generate.mjs: ${message}\n`);
  exit(2);
}

// ─── PlantUML rendering ───────────────────────────────────────────────────
// Render the entities slice as PlantUML and push any layer-specific issues
// (unresolved targets, unknown cardinality) into the warnings array.
function renderPuml(model, warnings) {
  const entities = model.entities ?? [];
  const knownIds = new Set(entities.map((e) => e?.id).filter(Boolean));
  const lines = [];
  lines.push("@startuml ERD");
  lines.push("' Generated from designs/system-model.yaml — do not hand-edit.");
  lines.push("' Regenerate with: node .agents/skills/erd-design/scripts/generate.mjs designs/system-model.yaml");
  lines.push("hide circle");
  lines.push("skinparam linetype ortho");
  lines.push("");

  // Entities — alias is namespace-safe; display label uses entity.name.
  for (const ent of entities) {
    if (!ent?.id) continue;
    const alias = entAlias(ent.id);
    const display = ent.name ?? entDisplayName(ent.id);
    lines.push(`entity "${display}" as ${alias} {`);
    const attrs = ent.attributes ?? [];
    const pk = attrs.filter((a) => a.primaryKey);
    const rest = attrs.filter((a) => !a.primaryKey);
    for (const a of pk) lines.push("  " + renderAttr(a));
    if (pk.length > 0 && rest.length > 0) lines.push("  --");
    for (const a of rest) lines.push("  " + renderAttr(a));
    lines.push("}");
    lines.push("");
  }

  // Relationships — canonical-key dedupe so:
  //   • parallel relationships with different role names are preserved
  //     (e.g. Order → Address as shippingAddress AND billingAddress);
  //   • the same logical relationship declared from both sides collapses
  //     into one edge.
  const seen = new Set();
  for (const ent of entities) {
    for (const rel of ent.relationships ?? []) {
      if (!rel?.to) continue;
      if (!knownIds.has(rel.to)) {
        warnings.push(`${ent.id}: relationship target ${rel.to} is not a declared entity (skipped from diagram)`);
        continue;
      }
      const symbols = CARDINALITY[rel.cardinality];
      if (!symbols) {
        // The lint pass will already warn about this; just skip rendering.
        continue;
      }
      const key = canonicalRelKey(ent.id, rel);
      if (seen.has(key)) continue;
      seen.add(key);
      const sym = rel.optional ? symbols.optional : symbols.required;
      const fromAlias = entAlias(ent.id);
      const toAlias = entAlias(rel.to);
      const label = relationshipLabel(rel);
      lines.push(`${fromAlias} ${sym} ${toAlias}${label}`);
    }
  }
  lines.push("");
  lines.push("@enduml");
  return lines.join("\n") + "\n";
}

// Namespace-safe alias for PlantUML / DDL identifiers.
//   entity:Order             → Order
//   entity:billing/Invoice   → billing_Invoice
// Two different namespaced entities never collide.
function entAlias(id) {
  if (typeof id !== "string") return "Unknown";
  return id.replace(/^entity:/, "").replace(/[\/\.]/g, "_");
}

// Display name (used inside the entity quotes when entity.name is missing).
function entDisplayName(id) {
  if (typeof id !== "string") return "Unknown";
  const after = id.replace(/^entity:/, "");
  const slash = after.lastIndexOf("/");
  return slash >= 0 ? after.slice(slash + 1) : after;
}

// Canonical key for a relationship — invariant under which side declared it,
// but distinct for parallel relationships with different role names.
function canonicalRelKey(srcId, rel) {
  const tgtId = rel.to;
  const reversed = REVERSE_CARDINALITY[rel.cardinality] ?? rel.cardinality;
  const src = `${srcId}|${rel.cardinality}|${rel.roleNameSource ?? ""}|${rel.roleNameTarget ?? ""}|${rel.optional ? 1 : 0}`;
  const tgt = `${tgtId}|${reversed}|${rel.roleNameTarget ?? ""}|${rel.roleNameSource ?? ""}|${rel.optional ? 1 : 0}`;
  return srcId <= tgtId ? `${src}→${tgtId}` : `${tgt}→${srcId}`;
}

function renderAttr(attr) {
  const markers = [];
  if (attr.primaryKey) markers.push("PK");
  if (attr.foreignKey) markers.push("FK");
  if (attr.unique) markers.push("UK");
  const required = attr.required || attr.primaryKey;
  const prefix = required ? "* " : "  ";
  const tag = markers.length ? ` <<${markers.join(",")}>>` : "";
  return `${prefix}${attr.name} : ${attr.type ?? "?"}${tag}`;
}

function relationshipLabel(rel) {
  const parts = [];
  if (rel.roleNameSource) parts.push(rel.roleNameSource);
  if (rel.roleNameTarget && rel.roleNameTarget !== rel.roleNameSource) {
    parts.push(`(${rel.roleNameTarget})`);
  }
  if (parts.length === 0) return "";
  return ` : "${parts.join(" ")}"`;
}

// ─── DDL rendering (design artifact) ──────────────────────────────────────
function renderDdl(model) {
  const entities = model.entities ?? [];
  const out = [];
  out.push("-- ╔══════════════════════════════════════════════════════════════╗");
  out.push("-- ║  DESIGN ARTIFACT — NOT A MIGRATION                            ║");
  out.push("-- ║  Generated from designs/system-model.yaml. Do not run as-is. ║");
  out.push("-- ║  Use as a starting point for a real migration written         ║");
  out.push("-- ║  elsewhere with explicit dialect, indexes, and rollbacks.     ║");
  out.push("-- ╚══════════════════════════════════════════════════════════════╝");
  out.push("");
  for (const ent of entities) {
    if (!ent?.id) continue;
    const tableName = entAlias(ent.id);  // namespace-safe (e.g. billing_Invoice)
    if (ent.description) out.push(`-- ${ent.description}`);
    out.push(`CREATE TABLE ${tableName} (`);
    const attrs = ent.attributes ?? [];
    const colWidth = Math.max(0, ...attrs.map((a) => (a.name ?? "").length));
    const typeWidth = Math.max(0, ...attrs.map((a) => (a.type ?? "?").length));
    const colLines = attrs.map((a) => {
      const parts = [
        "  ",
        (a.name ?? "?").padEnd(colWidth),
        " ",
        (a.type ?? "?").padEnd(typeWidth),
      ];
      if (a.primaryKey) parts.push(" PRIMARY KEY");
      if (a.required && !a.primaryKey) parts.push(" NOT NULL");
      if (a.unique && !a.primaryKey) parts.push(" UNIQUE");
      if (a.default !== undefined) parts.push(` DEFAULT ${a.default}`);
      return parts.join("");
    });
    const fkLines = attrs
      .filter((a) => a.foreignKey)
      .map((a) => {
        const dot = String(a.foreignKey).lastIndexOf(".");
        if (dot < 0) return null;
        const fkEnt = entAlias(String(a.foreignKey).slice(0, dot));
        const fkAttr = String(a.foreignKey).slice(dot + 1);
        return `  FOREIGN KEY (${a.name}) REFERENCES ${fkEnt}(${fkAttr})`;
      })
      .filter(Boolean);
    out.push([...colLines, ...fkLines].join(",\n"));
    out.push(");");

    // Indexes (design discussion)
    for (const idx of ent.indexes ?? []) {
      const cols = (idx.on ?? []).join(", ");
      const unique = idx.unique ? "UNIQUE " : "";
      const name = idx.name ?? `idx_${tableName.toLowerCase()}_auto`;
      out.push(`CREATE ${unique}INDEX ${name} ON ${tableName} (${cols});`);
    }
    out.push("");
  }
  return out.join("\n");
}

// ─── Layer-specific warnings ──────────────────────────────────────────────
function lintEntities(model, warnings) {
  const entities = model.entities ?? [];
  for (const ent of entities) {
    if (!ent?.id) continue;
    const attrs = ent.attributes ?? [];
    if (attrs.length === 0) {
      warnings.push(`${ent.id}: no attributes declared`);
      continue;
    }
    const pks = attrs.filter((a) => a.primaryKey);
    if (pks.length === 0) {
      warnings.push(`${ent.id}: no primary key (mark one attribute primaryKey: true, or use a composite key on a join entity)`);
    } else if (pks.length > 1) {
      // Composite keys are valid only on join entities — a heuristic warning.
      const onlyPkAttrs = pks.length === attrs.length;
      if (!onlyPkAttrs) {
        warnings.push(`${ent.id}: ${pks.length} attributes marked primaryKey — composite primary keys are only conventional on join entities`);
      }
    }
    // Empty cardinality
    for (const rel of ent.relationships ?? []) {
      if (!CARDINALITY[rel.cardinality]) {
        warnings.push(`${ent.id} → ${rel.to ?? "?"}: unknown cardinality "${rel.cardinality}" (valid: ${Object.keys(CARDINALITY).join(", ")})`);
      }
    }
  }
}

function findOrphans(model) {
  const entities = model.entities ?? [];
  const functions = model.functions ?? [];
  const referenced = new Set();
  for (const fn of functions) {
    for (const r of fn?.reads ?? []) referenced.add(r);
    for (const w of fn?.writes ?? []) referenced.add(w);
  }
  return entities.filter((e) => e?.id && !referenced.has(e.id)).map((e) => e.id);
}

// ─── Main ─────────────────────────────────────────────────────────────────
async function main() {
  const args = argv.slice(2);
  let asJson = false;
  let emitDdl = false;
  const files = [];
  for (const a of args) {
    if (a === "--json") asJson = true;
    else if (a === "--ddl") emitDdl = true;
    else if (a === "-h" || a === "--help") {
      stdout.write("Usage: node generate.mjs [--json] [--ddl] <path-to-model>\n");
      exit(0);
    } else files.push(a);
  }
  if (files.length !== 1) {
    stderr.write("Usage: node generate.mjs [--json] [--ddl] <path-to-model>\n");
    exit(2);
  }
  const modelPath = resolve(files[0]);
  const model = await loadModel(modelPath, asJson);
  if (!model || typeof model !== "object") fatal("Model file did not parse to an object.");
  if (!Array.isArray(model.entities) || model.entities.length === 0) {
    fatal("Model has no entities[] section. Use design-model to bootstrap, then add entities.");
  }

  // Output paths are conventional: designs/diagrams/erd.{puml,ddl.sql}
  // Resolve relative to the model file's directory's parent (so a model at
  // designs/system-model.yaml writes diagrams to designs/diagrams/).
  const designsDir = dirname(modelPath);
  const diagramsDir = join(designsDir, "diagrams");
  await mkdir(diagramsDir, { recursive: true });

  // Collect layer-specific warnings during rendering and linting.
  const warnings = [];

  const pumlPath = join(diagramsDir, "erd.puml");
  await writeFile(pumlPath, renderPuml(model, warnings), "utf8");
  stdout.write(`Wrote ${pumlPath}\n`);

  if (emitDdl) {
    const ddlPath = join(diagramsDir, "erd.ddl.sql");
    await writeFile(ddlPath, renderDdl(model), "utf8");
    stdout.write(`Wrote ${ddlPath}\n`);
  }

  lintEntities(model, warnings);
  if (warnings.length > 0) {
    stdout.write("\nWARNINGS:\n");
    warnings.forEach((w, i) => stdout.write(`  ${i + 1}. ${w}\n`));
  }
  const orphans = findOrphans(model);
  if (orphans.length > 0) {
    stdout.write("\nORPHAN ENTITIES (no function reads or writes them):\n");
    orphans.forEach((id) => stdout.write(`  • ${id}\n`));
    stdout.write("Decide for each: remove, mark as planned, or add a function in the system-design layer.\n");
  } else {
    stdout.write("\nNo orphan entities — every entity is read or written by at least one function.\n");
  }
  exit(0);
}

main().catch((e) => fatal(`Internal error: ${e.stack || e.message}`));
