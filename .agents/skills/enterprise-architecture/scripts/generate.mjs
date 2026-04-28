#!/usr/bin/env node
// Orchestrator generator for the enterprise-architecture skill.
//
// Reads designs/system-model.yaml (or --json file) and writes:
//   - designs/diagrams/ea-overview.puml   (one layered overview diagram)
//   - designs/ea-traceability.md          (markdown traceability report)
//
// Cross-layer gap report is printed to stdout. The orchestrator never edits
// layer-owned sections — it only reads them. ID grammar and cross-reference
// resolution are owned by the foundation validator
// (.agents/skills/design-model/scripts/validate.mjs).
//
// Optional --render-all also runs the four sibling generators sequentially
// so all layer diagrams refresh in one shot.
//
// Exit codes:
//   0 — success (warnings allowed)
//   1 — gap report has entries AND --strict was passed
//   2 — internal failure (file unreadable, parse error)

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { argv, exit, stdout, stderr } from "node:process";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILLS_ROOT = resolve(HERE, "..", "..");

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
  const prefix =
    kind === "process"  ? "proc_" :
    kind === "actor"    ? "actor_" :
    kind === "entity"   ? "ent_" :
    kind === "service"  ? "svc_" :
    kind === "function" ? "fn_" :
    kind === "module"   ? "mod_" :
    kind === "node"     ? "node_" :
    "n_";
  return prefix + safe;
}

function plantQuote(s) {
  if (s == null) return "";
  return String(s).replace(/"/g, '\\"');
}

// Build cross-layer indexes used by both the diagram and the report.
function buildIndex(model) {
  const processes = model.processes ?? [];
  const actors    = model.actors    ?? [];
  const entities  = model.entities  ?? [];
  const services  = model.services  ?? [];
  const functions = model.functions ?? [];
  const modules   = model.modules   ?? [];
  const nodes     = model.technology?.nodes ?? [];
  const environments = model.technology?.environments ?? [];

  const fnById  = new Map(functions.map((f) => [f.id, f]));
  const svcById = new Map(services.map((s)  => [s.id, s]));
  const modById = new Map(modules.map((m)   => [m.id, m]));
  const entById = new Map(entities.map((e)  => [e.id, e]));
  const nodeById = new Map(nodes.map((n)    => [n.id, n]));
  const procById = new Map(processes.map((p) => [p.id, p]));

  // service → module: prefer modules[].contains[]; fall back to services[].module.
  const serviceToModule = new Map();
  for (const m of modules) {
    for (const sId of m?.contains ?? []) serviceToModule.set(sId, m.id);
  }
  for (const s of services) {
    if (s?.module && !serviceToModule.has(s.id)) serviceToModule.set(s.id, s.module);
  }

  // module → environment names (a node may be in multiple environments).
  const nodeToEnvs = new Map();
  for (const env of environments) {
    for (const nId of env?.nodes ?? []) {
      if (!nodeToEnvs.has(nId)) nodeToEnvs.set(nId, []);
      nodeToEnvs.get(nId).push(env.name);
    }
  }

  return {
    processes, actors, entities, services, functions, modules, nodes, environments,
    fnById, svcById, modById, entById, nodeById, procById,
    serviceToModule, nodeToEnvs,
  };
}

// ─── Overview diagram ─────────────────────────────────────────────────────
function renderOverview(idx) {
  const lines = [];
  lines.push("@startuml ea-overview");
  lines.push("' Generated from designs/system-model.yaml — do not hand-edit.");
  lines.push("' Regenerate with: node .agents/skills/enterprise-architecture/scripts/generate.mjs designs/system-model.yaml");
  lines.push("title Enterprise Architecture — Overview");
  lines.push("");

  // Business layer.
  lines.push(`rectangle "Business Layer (BPMN — processes, actors)" as L_business #FFF2CC {`);
  for (const p of idx.processes) {
    const label = p.name ? `${p.id}\\n${p.name}` : p.id;
    lines.push(`  rectangle "${plantQuote(label)}" as ${alias(p.id)}`);
  }
  for (const a of idx.actors) {
    const label = a.name ? `${a.id}\\n${a.name}` : a.id;
    lines.push(`  rectangle "${plantQuote(label)}" as ${alias(a.id)}`);
  }
  if (idx.processes.length === 0 && idx.actors.length === 0) {
    lines.push(`  rectangle "(no processes or actors declared)" as L_business_empty`);
  }
  lines.push(`}`);
  lines.push("");

  // Data layer.
  lines.push(`rectangle "Data Layer (ERD — entities)" as L_data #DAE8FC {`);
  for (const e of idx.entities) {
    lines.push(`  rectangle "${plantQuote(e.id)}" as ${alias(e.id)}`);
  }
  if (idx.entities.length === 0) {
    lines.push(`  rectangle "(no entities declared)" as L_data_empty`);
  }
  lines.push(`}`);
  lines.push("");

  // Application layer (modules nest services; functions float).
  lines.push(`rectangle "Application Layer (services, functions, modules)" as L_application #D5E8D4 {`);
  // Modules with their contained services.
  const placedServices = new Set();
  for (const m of idx.modules) {
    lines.push(`  rectangle "${plantQuote(m.id)}" as ${alias(m.id)} {`);
    for (const sId of m?.contains ?? []) {
      const svc = idx.svcById.get(sId);
      const label = svc?.name ?? sId.replace(/^service:/, "");
      lines.push(`    component "${plantQuote(label)}" as ${alias(sId)}`);
      placedServices.add(sId);
    }
    lines.push(`  }`);
  }
  // Services not placed in any module — render at module level.
  for (const s of idx.services) {
    if (placedServices.has(s.id)) continue;
    const label = s.name ?? s.id.replace(/^service:/, "");
    lines.push(`  component "${plantQuote(label)}" as ${alias(s.id)}`);
  }
  // Functions float.
  for (const f of idx.functions) {
    const label = f.id.replace(/^function:/, "");
    lines.push(`  component "${plantQuote(label)}" as ${alias(f.id)}`);
  }
  if (idx.services.length === 0 && idx.functions.length === 0 && idx.modules.length === 0) {
    lines.push(`  rectangle "(no services, functions, or modules declared)" as L_application_empty`);
  }
  lines.push(`}`);
  lines.push("");

  // Technology layer.
  lines.push(`rectangle "Technology Layer (deployment nodes)" as L_technology #F8CECC {`);
  for (const n of idx.nodes) {
    const envs = idx.nodeToEnvs.get(n.id) ?? [];
    const envTag = envs.length > 0 ? `\\n[${envs.join(", ")}]` : "";
    const kindTag = n.kind ? `\\n«${n.kind}»` : "";
    const label = `${n.id}${kindTag}${envTag}`;
    lines.push(`  rectangle "${plantQuote(label)}" as ${alias(n.id)}`);
  }
  if (idx.nodes.length === 0) {
    lines.push(`  rectangle "(no deployment nodes declared)" as L_technology_empty`);
  }
  lines.push(`}`);
  lines.push("");

  // ─── Cross-layer arrows ────────────────────────────────────────────────
  // Process tasks → functions (implementedBy).
  const seenProcFn = new Set();
  for (const p of idx.processes) {
    for (const t of p?.tasks ?? []) {
      for (const fnId of t?.implementedBy ?? []) {
        if (!idx.fnById.has(fnId)) continue;
        const key = `${p.id}|${fnId}`;
        if (seenProcFn.has(key)) continue;
        seenProcFn.add(key);
        lines.push(`${alias(p.id)} ..> ${alias(fnId)} : "implementedBy"`);
      }
    }
  }
  // Functions → entities (reads / writes).
  for (const f of idx.functions) {
    for (const eId of f?.reads ?? []) {
      if (!idx.entById.has(eId)) continue;
      lines.push(`${alias(f.id)} ..> ${alias(eId)} : "reads"`);
    }
    for (const eId of f?.writes ?? []) {
      if (!idx.entById.has(eId)) continue;
      lines.push(`${alias(f.id)} ..> ${alias(eId)} : "writes"`);
    }
  }
  // Modules → nodes (deployedTo).
  for (const m of idx.modules) {
    for (const nId of m?.deployedTo ?? []) {
      if (!idx.nodeById.has(nId)) continue;
      lines.push(`${alias(m.id)} ..> ${alias(nId)} : "deployedTo"`);
    }
  }

  lines.push("");
  lines.push("@enduml");

  return lines.join("\n") + "\n";
}

// ─── Traceability report ──────────────────────────────────────────────────
function renderTraceability(idx) {
  const out = [];
  out.push("# Architecture Traceability");
  out.push("");
  out.push(`Generated from \`designs/system-model.yaml\` on ${new Date().toISOString()}.`);
  out.push("");
  out.push("This report walks every business process down through the stack: tasks → functions → entities → services → modules → deployment nodes. Gaps in the trace are flagged with ⚠ and listed in the summary at the bottom.");
  out.push("");

  if (idx.processes.length === 0) {
    out.push("> No processes are declared. Add some via the `bpmn-design` skill.");
    out.push("");
  }

  for (const p of idx.processes) {
    const heading = p.name ? `${p.id} — ${p.name}` : p.id;
    out.push(`## ${heading}`);
    if (p.description) {
      out.push("");
      out.push(`> ${p.description}`);
    }
    out.push("");
    const tasks = p.tasks ?? [];
    if (tasks.length === 0) {
      out.push("⚠ NO TASKS DECLARED");
      out.push("");
      continue;
    }
    for (const t of tasks) {
      const taskHeading = t.name ? `${t.id} — "${t.name}"` : t.id;
      out.push(`### ${taskHeading}`);
      if (t.lane) out.push(`- **Lane**: ${t.lane}`);
      const impls = t.implementedBy ?? [];
      if (impls.length === 0) {
        out.push("- ⚠ NO IMPLEMENTING FUNCTIONS DECLARED — gap");
        out.push("");
        continue;
      }
      out.push("- **Implemented by**:");
      for (const fnId of impls) {
        const fn = idx.fnById.get(fnId);
        out.push(`  - **${fnId}**`);
        if (!fn) {
          out.push(`    - ⚠ function not found in services[].functions[] — run validate.mjs`);
          continue;
        }
        const svcId = fn.service ?? null;
        if (svcId) out.push(`    - Service: ${svcId}`);
        else out.push(`    - ⚠ function has no \`service\` — gap`);
        const modId = svcId ? idx.serviceToModule.get(svcId) : null;
        if (modId) out.push(`    - Module:  ${modId}`);
        else if (svcId) out.push(`    - ⚠ service ${svcId} not contained by any module — gap`);
        if ((fn.reads ?? []).length > 0) out.push(`    - Reads:   ${fn.reads.join(", ")}`);
        if ((fn.writes ?? []).length > 0) out.push(`    - Writes:  ${fn.writes.join(", ")}`);
        if (modId) {
          const mod = idx.modById.get(modId);
          const deployedTo = mod?.deployedTo ?? [];
          if (deployedTo.length === 0) {
            out.push(`    - ⚠ module ${modId} declares no \`deployedTo[]\` — gap`);
          } else {
            const formatted = deployedTo.map((nId) => {
              const envs = idx.nodeToEnvs.get(nId) ?? [];
              return envs.length > 0 ? `${nId} *(${envs.join(", ")})*` : nId;
            }).join(", ");
            out.push(`    - Deployed to: ${formatted}`);
          }
        }
      }
      out.push("");
    }
  }

  return out.join("\n");
}

// ─── Cross-layer gap report ───────────────────────────────────────────────
function buildGapReport(idx) {
  const tasksWithoutImpl = [];
  for (const p of idx.processes) {
    for (const t of p?.tasks ?? []) {
      if ((t?.implementedBy?.length ?? 0) === 0) {
        tasksWithoutImpl.push(`${p.id} / ${t.id}`);
      }
    }
  }

  const fnWithoutService = [];
  for (const f of idx.functions) {
    if (!f.service) fnWithoutService.push(f.id);
  }

  const svcWithoutModule = [];
  for (const s of idx.services) {
    if (!idx.serviceToModule.has(s.id)) svcWithoutModule.push(s.id);
  }

  const modWithoutDeploy = [];
  for (const m of idx.modules) {
    if ((m?.deployedTo?.length ?? 0) === 0) {
      modWithoutDeploy.push(m.id);
    }
  }

  const referencedNodes = new Set();
  for (const m of idx.modules) for (const nId of m?.deployedTo ?? []) referencedNodes.add(nId);
  const orphanNodes = idx.nodes
    .filter((n) => !referencedNodes.has(n.id))
    .map((n) => n.id);

  const procWithoutTasks = idx.processes
    .filter((p) => (p?.tasks?.length ?? 0) === 0)
    .map((p) => p.id);

  return {
    tasksWithoutImpl,
    fnWithoutService,
    svcWithoutModule,
    modWithoutDeploy,
    orphanNodes,
    procWithoutTasks,
  };
}

function printGapReport(rep) {
  const sections = [
    ["Process tasks without an implementing function", rep.tasksWithoutImpl],
    ["Functions without an owning service",            rep.fnWithoutService],
    ["Services not placed in any module",              rep.svcWithoutModule],
    ["Modules not deployed",                           rep.modWithoutDeploy],
    ["Processes with no tasks",                        rep.procWithoutTasks],
    ["Nodes referenced by no module (informational)",  rep.orphanNodes],
  ];
  let total = 0;
  stdout.write("\nCross-layer gap report:\n");
  for (const [title, items] of sections) {
    if (items.length === 0) {
      stdout.write(`  ✓ ${title}: none\n`);
    } else {
      stdout.write(`  ⚠ ${title} (${items.length}):\n`);
      for (const it of items) stdout.write(`      - ${it}\n`);
      // Orphan nodes are informational; everything else counts toward the gap total.
      if (title.startsWith("Nodes referenced")) continue;
      total += items.length;
    }
  }
  return total;
}

function appendGapSummaryToTrace(trace, rep) {
  const out = [trace, "---", "", "## Cross-layer gap summary", ""];
  const sections = [
    ["Process tasks without an implementing function", rep.tasksWithoutImpl],
    ["Functions without an owning service",            rep.fnWithoutService],
    ["Services not placed in any module",              rep.svcWithoutModule],
    ["Modules not deployed",                           rep.modWithoutDeploy],
    ["Processes with no tasks",                        rep.procWithoutTasks],
    ["Nodes referenced by no module (informational)",  rep.orphanNodes],
  ];
  let any = false;
  for (const [title, items] of sections) {
    if (items.length === 0) continue;
    any = true;
    out.push(`- **${title}** (${items.length}):`);
    for (const it of items) out.push(`  - ${it}`);
  }
  if (!any) out.push("_No cross-layer gaps detected._");
  out.push("");
  return out.join("\n");
}

// ─── --render-all: run sibling generators ─────────────────────────────────
function renderSiblings(modelPath, asJson) {
  const siblings = [
    ["bpmn-design",           "scripts/generate.mjs"],
    ["erd-design",            "scripts/generate.mjs"],
    ["system-design",         "scripts/generate.mjs"],
    ["code-structure-design", "scripts/generate.mjs"],
  ];
  for (const [skill, rel] of siblings) {
    const script = join(SKILLS_ROOT, skill, rel);
    const args = asJson ? ["--json", modelPath] : [modelPath];
    stdout.write(`\n── running ${skill}/${rel} ──\n`);
    const r = spawnSync(process.execPath, [script, ...args], { stdio: "inherit" });
    if (r.status !== 0) {
      stderr.write(`(${skill} exited with status ${r.status})\n`);
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────
async function main() {
  const args = argv.slice(2);
  let asJson = false;
  let renderAll = false;
  let writeOverview = true;
  let writeTrace = true;
  let strict = false;
  const files = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") asJson = true;
    else if (a === "--render-all") renderAll = true;
    else if (a === "--no-overview") writeOverview = false;
    else if (a === "--no-trace") writeTrace = false;
    else if (a === "--strict") strict = true;
    else if (a === "-h" || a === "--help") {
      stdout.write(
        "Usage: node generate.mjs [--json] [--render-all] [--no-overview] [--no-trace] [--strict] <path-to-model>\n",
      );
      exit(0);
    } else files.push(a);
  }
  if (files.length !== 1) {
    stderr.write(
      "Usage: node generate.mjs [--json] [--render-all] [--no-overview] [--no-trace] [--strict] <path-to-model>\n",
    );
    exit(2);
  }
  const modelPath = resolve(files[0]);
  const model = await loadModel(modelPath, asJson);
  if (!model || typeof model !== "object") fatal("Model file did not parse to an object.");

  const designsDir = dirname(modelPath);
  const diagramsDir = join(designsDir, "diagrams");
  const idx = buildIndex(model);

  if (writeOverview) {
    await mkdir(diagramsDir, { recursive: true });
    const text = renderOverview(idx);
    const path = join(diagramsDir, "ea-overview.puml");
    await writeFile(path, text, "utf8");
    stdout.write(`Wrote ${path}\n`);
  }

  const gap = buildGapReport(idx);

  if (writeTrace) {
    const trace = renderTraceability(idx);
    const fullTrace = appendGapSummaryToTrace(trace, gap);
    const path = join(designsDir, "ea-traceability.md");
    await writeFile(path, fullTrace, "utf8");
    stdout.write(`Wrote ${path}\n`);
  }

  if (renderAll) renderSiblings(modelPath, asJson);

  stdout.write("\nSummary:\n");
  stdout.write(
    `  • EA — ${idx.processes.length} processes · ${idx.entities.length} entities · ` +
    `${idx.services.length} services · ${idx.functions.length} functions · ` +
    `${idx.modules.length} modules · ${idx.nodes.length} nodes\n`,
  );

  const totalGaps = printGapReport(gap);

  if (strict && totalGaps > 0) {
    stdout.write(`\n--strict: ${totalGaps} gap(s) found, exiting 1.\n`);
    exit(1);
  }
  exit(0);
}

main().catch((e) => fatal(`Internal error: ${e.stack || e.message}`));
