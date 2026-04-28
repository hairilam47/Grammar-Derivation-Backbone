#!/usr/bin/env node
// Generator for the code-structure-design layer (modules + allowed/forbidden deps).
//
// Reads designs/system-model.yaml (or --json file), writes:
//   - designs/diagrams/code-structure.puml  (one PlantUML package diagram)
//
// Optional --compare-repo <root>:
//   read-only diff between modules' intendedFolderPath and actual folders
//   under <root>/src (and one level deeper inside workspace-style folders).
//
// Cycle and contradiction reports are printed to stdout. Foundation-layer
// issues (unresolved IDs, wrong-kind references) are the foundation
// validator's responsibility — see
// .agents/skills/design-model/scripts/validate.mjs.
//
// Exit codes:
//   0 — success (warnings allowed, including detected cycles)
//   1 — allowed/forbidden contradiction (an internal model inconsistency)
//   2 — internal failure (file unreadable, parse error, missing modules[])

import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join, resolve, basename } from "node:path";
import { argv, exit, stdout, stderr } from "node:process";

const DEFAULT_SKIP = new Set([
  ".git", "node_modules", "dist", "build", ".next", ".turbo",
  ".cache", "coverage", ".local",
]);

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

function alias(id) {
  if (typeof id !== "string") return "n_unknown";
  const [kind, rest] = id.split(":", 2);
  const safe = (rest ?? id).replace(/[^A-Za-z0-9]/g, "_");
  const prefix = kind === "module" ? "mod_"
               : kind === "service" ? "svc_"
               : "n_";
  return prefix + safe;
}

function plantQuote(s) {
  if (s == null) return "";
  return String(s).replace(/"/g, '\\"');
}

// ─── Diagram ──────────────────────────────────────────────────────────────
function renderDiagram(model, warnings) {
  const modules = model.modules ?? [];
  const services = model.services ?? [];
  const svcById = new Map(services.map((s) => [s.id, s]));
  const modById = new Map(modules.map((m) => [m.id, m]));

  const lines = [];
  lines.push("@startuml code-structure");
  lines.push("' Generated from designs/system-model.yaml — do not hand-edit.");
  lines.push("' Regenerate with: node .agents/skills/code-structure-design/scripts/generate.mjs designs/system-model.yaml");
  lines.push("title Code Structure — Module View");
  lines.push("");

  // Packages with their contained services.
  for (const m of modules) {
    lines.push(`package "${plantQuote(m.id)}" as ${alias(m.id)} {`);
    for (const sId of m?.contains ?? []) {
      const svc = svcById.get(sId);
      const label = svc?.name ?? sId.replace(/^service:/, "");
      lines.push(`  component "${plantQuote(label)}" as ${alias(sId)}`);
    }
    lines.push("}");
  }
  lines.push("");

  // Allowed-dependency edges (solid black, label "allowed").
  let allowedEdgeCount = 0;
  let forbiddenEdgeCount = 0;
  let placedServices = 0;
  for (const m of modules) {
    placedServices += (m?.contains?.length ?? 0);
    for (const dep of m?.allowedDependencies ?? []) {
      if (!modById.has(dep)) {
        warnings.push(`module ${m.id}: allowedDependencies → unknown module ${dep} (run validate.mjs for full ID checks)`);
        continue;
      }
      if (dep === m.id) continue; // ignore self
      lines.push(`${alias(m.id)} --> ${alias(dep)} : "allowed"`);
      allowedEdgeCount++;
    }
  }

  // Forbidden-dependency edges (red dashed, label "forbidden").
  for (const m of modules) {
    for (const dep of m?.forbiddenDependencies ?? []) {
      if (!modById.has(dep)) {
        warnings.push(`module ${m.id}: forbiddenDependencies → unknown module ${dep}`);
        continue;
      }
      if (dep === m.id) continue;
      lines.push(`${alias(m.id)} -[#red,dashed]-> ${alias(dep)} : "forbidden"`);
      forbiddenEdgeCount++;
    }
  }
  lines.push("");
  lines.push("@enduml");

  return {
    text: lines.join("\n") + "\n",
    summary: `code-structure — ${modules.length} modules · ${placedServices} services placed · ${allowedEdgeCount} allowed-dep edges · ${forbiddenEdgeCount} forbidden-dep edges`,
  };
}

// ─── Validation ───────────────────────────────────────────────────────────
function detectCycles(modules) {
  // Tarjan-like DFS that records back-edges and reconstructs cycle paths.
  const graph = new Map();
  for (const m of modules) {
    graph.set(m.id, (m?.allowedDependencies ?? []).filter((d) => d !== m.id));
  }
  const cycles = [];
  const seen = new Set();
  const stack = [];
  const onStack = new Set();
  const stackIndex = new Map();

  function dfs(node) {
    seen.add(node);
    stack.push(node);
    onStack.add(node);
    stackIndex.set(node, stack.length - 1);
    const deps = graph.get(node) ?? [];
    for (const next of deps) {
      if (!graph.has(next)) continue;
      if (!seen.has(next)) {
        dfs(next);
      } else if (onStack.has(next)) {
        const start = stackIndex.get(next);
        const cycle = stack.slice(start).concat(next);
        cycles.push(cycle);
      }
    }
    stack.pop();
    onStack.delete(node);
    stackIndex.delete(node);
  }

  for (const node of graph.keys()) {
    if (!seen.has(node)) dfs(node);
  }

  // Deduplicate cycles by canonical (rotated to start at min-id) form.
  const dedupe = new Map();
  for (const c of cycles) {
    const ring = c.slice(0, -1); // drop repeated final node
    if (ring.length === 0) continue;
    let minIdx = 0;
    for (let i = 1; i < ring.length; i++) if (ring[i] < ring[minIdx]) minIdx = i;
    const canonical = ring.slice(minIdx).concat(ring.slice(0, minIdx));
    const key = canonical.join("→");
    if (!dedupe.has(key)) dedupe.set(key, [...canonical, canonical[0]]);
  }
  return [...dedupe.values()];
}

function reportModelHealth(model, warnings, errors) {
  const modules = model.modules ?? [];
  const services = model.services ?? [];
  const placed = new Set();
  for (const m of modules) for (const sId of m?.contains ?? []) placed.add(sId);

  // Empty modules.
  for (const m of modules) {
    if ((m?.contains?.length ?? 0) === 0) {
      warnings.push(`empty module: ${m.id} — declares no contained services (placeholder?)`);
    }
  }

  // Unplaced services (cross-layer warning — services usually belong to a module).
  for (const s of services) {
    if (!placed.has(s.id)) {
      warnings.push(`unplaced service: ${s.id} — not contained by any module (most services should live in a module before EA can deploy them)`);
    }
  }

  // Allowed/forbidden contradictions (errors).
  for (const m of modules) {
    const allowed = new Set(m?.allowedDependencies ?? []);
    for (const dep of m?.forbiddenDependencies ?? []) {
      if (allowed.has(dep)) {
        errors.push(`contradiction: ${m.id} lists ${dep} as both allowed and forbidden — pick one`);
      }
    }
  }

  // Duplicate intendedFolderPath.
  const byPath = new Map();
  for (const m of modules) {
    if (!m?.intendedFolderPath) continue;
    const norm = m.intendedFolderPath.replace(/\/+$/, "");
    if (!byPath.has(norm)) byPath.set(norm, []);
    byPath.get(norm).push(m.id);
  }
  for (const [path, ids] of byPath) {
    if (ids.length > 1) {
      warnings.push(`duplicate intendedFolderPath: ${path} — claimed by ${ids.join(", ")}`);
    }
  }

  // Cycles (warnings, not errors — see references/module-patterns.md).
  const cycles = detectCycles(modules);
  for (const c of cycles) {
    warnings.push(`cycle in allowedDependencies: ${c.join(" → ")}`);
  }
}

// ─── Compare-repo ─────────────────────────────────────────────────────────
async function exists(path) {
  try { await stat(path); return true; }
  catch { return false; }
}

async function compareRepo(model, root, skipSet) {
  const modules = model.modules ?? [];
  const declaredPaths = new Map(); // normalised intendedFolderPath → moduleId
  for (const m of modules) {
    if (!m?.intendedFolderPath) continue;
    declaredPaths.set(m.intendedFolderPath.replace(/\/+$/, ""), m.id);
  }

  // Modules without a folder.
  const missing = [];
  for (const [path, modId] of declaredPaths) {
    const abs = resolve(root, path);
    if (!(await exists(abs))) missing.push({ modId, path });
  }

  // Folders without a module — scan two levels: <root>/src and one level
  // deeper inside any workspace-style folder (`packages`, `apps`, `artifacts`).
  // Also scan the root itself one level if no `src` exists.
  const candidates = new Set();
  async function scanDir(dir, depth) {
    if (depth < 0) return;
    if (!(await exists(dir))) return;
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (skipSet.has(e.name)) continue;
      const abs = join(dir, e.name);
      // Project-relative path for matching against intendedFolderPath.
      const rel = abs.slice(resolve(root).length + 1).replace(/\\/g, "/");
      candidates.add(rel);
      if (depth > 0) await scanDir(abs, depth - 1);
    }
  }
  // Scan src/ two levels; also scan top-level workspace dirs one level.
  await scanDir(resolve(root, "src"), 2);
  for (const ws of ["packages", "apps", "artifacts"]) {
    await scanDir(resolve(root, ws), 1);
  }
  // If no src/ at all, scan repo root one level.
  if (!(await exists(resolve(root, "src")))) await scanDir(resolve(root), 0);

  const declaredSet = new Set(declaredPaths.keys());
  const orphanFolders = [];
  for (const c of candidates) {
    if (declaredSet.has(c)) continue;
    // Also accept a parent match (a folder is "covered" if any declared path
    // starts with it — that means a deeper module is mapped here).
    const covered = [...declaredSet].some(
      (p) => p === c || p.startsWith(c + "/") || c.startsWith(p + "/"),
    );
    if (!covered) orphanFolders.push(c);
  }

  return { missing, orphanFolders, skipped: [...skipSet].sort() };
}

// ─── Main ─────────────────────────────────────────────────────────────────
async function main() {
  const args = argv.slice(2);
  let asJson = false;
  let compareRoot = null;
  let skipExtra = [];
  let writeDiagram = true;
  const files = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") asJson = true;
    else if (a === "--compare-repo") compareRoot = args[++i];
    else if (a === "--skip") skipExtra.push(args[++i]);
    else if (a === "--no-diagram") writeDiagram = false;
    else if (a === "-h" || a === "--help") {
      stdout.write(
        "Usage: node generate.mjs [--json] [--compare-repo <root>] [--skip <name>...] [--no-diagram] <path-to-model>\n",
      );
      exit(0);
    } else files.push(a);
  }
  if (files.length !== 1) {
    stderr.write(
      "Usage: node generate.mjs [--json] [--compare-repo <root>] [--skip <name>...] [--no-diagram] <path-to-model>\n",
    );
    exit(2);
  }
  const modelPath = resolve(files[0]);
  const model = await loadModel(modelPath, asJson);
  if (!model || typeof model !== "object") fatal("Model file did not parse to an object.");
  if (!Array.isArray(model.modules)) {
    fatal("Model has no modules[] section. Use design-model to bootstrap.");
  }

  const designsDir = dirname(modelPath);
  const diagramsDir = join(designsDir, "diagrams");

  const warnings = [];
  const errors = [];
  let summary = null;

  if (writeDiagram) {
    await mkdir(diagramsDir, { recursive: true });
    const { text, summary: s } = renderDiagram(model, warnings);
    summary = s;
    const path = join(diagramsDir, "code-structure.puml");
    await writeFile(path, text, "utf8");
    stdout.write(`Wrote ${path}\n`);
  }

  reportModelHealth(model, warnings, errors);

  let compareReport = null;
  if (compareRoot) {
    const skipSet = new Set([...DEFAULT_SKIP, ...skipExtra]);
    compareReport = await compareRepo(model, compareRoot, skipSet);
  }

  stdout.write("\nSummary:\n");
  if (summary) stdout.write(`  • ${summary}\n`);
  else stdout.write(`  • (diagram not regenerated — --no-diagram set)\n`);

  if (errors.length > 0) {
    stdout.write(`\nERRORS (${errors.length}):\n`);
    errors.forEach((e, i) => stdout.write(`  ${i + 1}. ${e}\n`));
  }
  if (warnings.length > 0) {
    stdout.write(`\nWARNINGS (${warnings.length}):\n`);
    warnings.forEach((w, i) => stdout.write(`  ${i + 1}. ${w}\n`));
  }
  if (errors.length === 0 && warnings.length === 0) {
    stdout.write("\nNo code-structure warnings or errors.\n");
  }

  if (compareReport) {
    stdout.write(`\nRepo comparison (root: ${compareRoot}):\n`);
    if (compareReport.missing.length === 0) {
      stdout.write("  Modules without a folder: (none)\n");
    } else {
      stdout.write("  Modules without a folder:\n");
      for (const m of compareReport.missing) {
        stdout.write(`    • ${m.modId} → designs say ${m.path} — folder not found\n`);
      }
    }
    if (compareReport.orphanFolders.length === 0) {
      stdout.write("  Folders without a module: (none)\n");
    } else {
      stdout.write("  Folders without a module:\n");
      for (const f of compareReport.orphanFolders) {
        stdout.write(`    • ${f}\n`);
      }
    }
    stdout.write(`  Skipped (build / cache / vcs): ${compareReport.skipped.join(", ")}\n`);
  }

  exit(errors.length > 0 ? 1 : 0);
}

main().catch((e) => fatal(`Internal error: ${e.stack || e.message}`));
