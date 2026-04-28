#!/usr/bin/env node
// Generator for the BPMN process-design layer.
//
// Reads designs/system-model.yaml (or --json file), writes one
// designs/diagrams/process-<slug>.puml file per process in the model.
//
// Per-process summary and BPMN-layer warnings are printed to stdout.
// Foundation-layer issues (unresolved IDs, dangling refs) are the
// foundation validator's responsibility — see
// .agents/skills/design-model/scripts/validate.mjs.
//
// Exit codes:
//   0 — success (warnings allowed)
//   2 — internal failure (file unreadable, parse error, missing processes[])

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { argv, exit, stdout, stderr } from "node:process";

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

// process:checkout            → process-checkout
// process:billing/place-order → process-billing_place-order
function processSlug(id) {
  if (typeof id !== "string") return "process-unknown";
  return "process-" + id.replace(/^process:/, "").replace(/[\/\.]/g, "_");
}

// node IDs for PlantUML — must be valid identifiers, must not collide
// across kinds. Prefix each by kind so "task:foo" and "event:foo" never
// produce the same alias.
function nodeAlias(id) {
  if (typeof id !== "string") return "n_unknown";
  const [kind, rest] = id.split(":", 2);
  const safe = (rest ?? id).replace(/[^A-Za-z0-9]/g, "_");
  const prefix = kind === "task" ? "t_"
               : kind === "event" ? "e_"
               : kind === "gateway" ? "g_"
               : kind === "lane" ? "lane_"
               : kind === "pool" ? "pool_"
               : "n_";
  return prefix + safe;
}

function plantQuote(s) {
  if (s == null) return "";
  return String(s).replace(/"/g, '\\"');
}

// ─── Per-process rendering ────────────────────────────────────────────────
function renderProcess(proc, model, warnings) {
  const lines = [];
  const slug = processSlug(proc.id);
  lines.push(`@startuml ${slug}`);
  lines.push(`' Generated from designs/system-model.yaml — do not hand-edit.`);
  lines.push(`' Process: ${proc.id}${proc.name ? ` (${proc.name})` : ""}`);
  lines.push(`' Regenerate with: node .agents/skills/bpmn-design/scripts/generate.mjs designs/system-model.yaml`);
  if (proc.name) lines.push(`title ${plantQuote(proc.name)}`);
  lines.push(`hide empty description`);
  lines.push(`skinparam backgroundColor white`);
  lines.push(`skinparam state {`);
  lines.push(`  BackgroundColor<<task>>    LightSkyBlue`);
  lines.push(`  BackgroundColor<<event>>   PaleGreen`);
  lines.push(`  BorderColor<<event>>       SeaGreen`);
  lines.push(`  BackgroundColor<<gateway>> LightYellow`);
  lines.push(`  BorderColor<<gateway>>     Orange`);
  lines.push(`}`);
  lines.push("");

  const events = proc.events ?? [];
  const tasks = proc.tasks ?? [];
  const gateways = proc.gateways ?? [];
  const flows = proc.flows ?? [];

  // Index every node by its id so flows can resolve them, and group nodes
  // by their lane for the swimlane composite states.
  const nodeById = new Map();
  for (const n of [...events, ...tasks, ...gateways]) {
    if (n?.id) nodeById.set(n.id, n);
  }
  // Lane → list of node IDs
  const nodesByLane = new Map();
  // Nodes with no `lane` field render outside any swimlane.
  const looseNodes = [];
  for (const n of [...events, ...tasks, ...gateways]) {
    if (!n?.id) continue;
    if (n.lane) {
      if (!nodesByLane.has(n.lane)) nodesByLane.set(n.lane, []);
      nodesByLane.get(n.lane).push(n);
    } else {
      looseNodes.push(n);
    }
  }

  // Render swimlanes (pools as composite states grouping their lanes).
  for (const pool of proc.pools ?? []) {
    const poolAlias = nodeAlias(pool.id);
    lines.push(`state "${plantQuote(pool.name ?? pool.id)}" as ${poolAlias} {`);
    for (const lane of pool.lanes ?? []) {
      const laneAlias = nodeAlias(lane.id);
      lines.push(`  state "${plantQuote(lane.name ?? lane.id)}" as ${laneAlias} {`);
      for (const node of nodesByLane.get(lane.id) ?? []) {
        lines.push("    " + renderNode(node));
      }
      lines.push(`  }`);
    }
    lines.push(`}`);
    lines.push("");
  }
  // Loose nodes (no lane) — render at top level.
  for (const node of looseNodes) {
    lines.push(renderNode(node));
  }
  if (looseNodes.length > 0) lines.push("");

  // Notes for tasks that declare cross-layer references.
  for (const t of tasks) {
    if (!t?.id) continue;
    const refs = [];
    if (t.implementedBy?.length) refs.push(`impl: ${t.implementedBy.join(", ")}`);
    if (t.consumes?.length)      refs.push(`consumes: ${t.consumes.join(", ")}`);
    if (t.produces?.length)      refs.push(`produces: ${t.produces.join(", ")}`);
    if (refs.length === 0) continue;
    lines.push(`note right of ${nodeAlias(t.id)}`);
    for (const r of refs) lines.push(`  ${r}`);
    lines.push(`end note`);
  }
  if (tasks.some((t) => t?.implementedBy?.length || t?.consumes?.length || t?.produces?.length)) {
    lines.push("");
  }

  // Flow rendering — anchor diagram with [*] from each `start` event and
  // to [*] from each `end` event so PlantUML draws sane begin/end markers.
  const startEvents = events.filter((e) => e?.type === "start");
  const endEvents = events.filter((e) => e?.type === "end");
  for (const e of startEvents) lines.push(`[*] --> ${nodeAlias(e.id)}`);
  for (const f of flows) {
    if (!f?.from || !f?.to) continue;
    if (!nodeById.has(f.from) || !nodeById.has(f.to)) {
      warnings.push(`${proc.id}: flow ${f.from} → ${f.to} skipped (endpoint not declared in this process)`);
      continue;
    }
    const label = f.condition ? ` : "${plantQuote(f.condition)}"` : "";
    lines.push(`${nodeAlias(f.from)} --> ${nodeAlias(f.to)}${label}`);
  }
  for (const e of endEvents) lines.push(`${nodeAlias(e.id)} --> [*]`);

  lines.push("");
  lines.push("@enduml");
  return lines.join("\n") + "\n";
}

function renderNode(node) {
  const kind = (node.id ?? "").split(":")[0];
  const stereotype = kind === "task" ? "<<task>>"
                    : kind === "event" ? "<<event>>"
                    : kind === "gateway" ? "<<gateway>>"
                    : "";
  return `state "${plantQuote(node.name ?? node.id)}" as ${nodeAlias(node.id)} ${stereotype}`.trimEnd();
}

// ─── Per-process summary + BPMN-layer warnings ────────────────────────────
function summariseProcess(proc, services, warnings) {
  const lanes = (proc.pools ?? []).flatMap((p) => p.lanes ?? []);
  const tasks = proc.tasks ?? [];
  const gateways = proc.gateways ?? [];
  const events = proc.events ?? [];
  const flows = proc.flows ?? [];

  const gatewayKindCounts = {};
  for (const g of gateways) {
    const k = g?.type ?? "?";
    gatewayKindCounts[k] = (gatewayKindCounts[k] ?? 0) + 1;
  }
  const starts = events.filter((e) => e?.type === "start").length;
  const ends = events.filter((e) => e?.type === "end").length;
  const gatewayKindStr = Object.entries(gatewayKindCounts)
    .map(([k, n]) => `${n} ${k}`)
    .join(", ") || "—";

  const summary =
    `${proc.id} — ${lanes.length} lanes · ${tasks.length} tasks · ` +
    `${gateways.length} gateways (${gatewayKindStr}) · ${starts} starts, ${ends} ends · ${flows.length} flows`;

  // Layer-specific warnings.
  if (starts === 0) warnings.push(`${proc.id}: no start event — every process needs at least one event of type "start"`);
  if (ends === 0)   warnings.push(`${proc.id}: no end event — every process needs at least one event of type "end"`);

  const orphanTasks = tasks.filter((t) => !(t?.implementedBy?.length));
  if (orphanTasks.length > 0 && orphanTasks.length === tasks.length && tasks.length > 0) {
    warnings.push(`${proc.id}: every task has empty implementedBy — process is disconnected from the system layer`);
  } else if (orphanTasks.length > 0) {
    const ids = orphanTasks.map((t) => t.id).join(", ");
    warnings.push(`${proc.id}: ${orphanTasks.length} orphan task(s) with no implementedBy: ${ids}`);
  }

  // Cross-module spread — collect modules referenced by the process's tasks.
  const fnToModule = new Map();
  for (const svc of services) {
    if (!svc?.id || !svc?.module) continue;
    fnToModule.set(svc.id, svc.module);
  }
  const modulesTouched = new Set();
  for (const t of tasks) {
    for (const fn of t?.implementedBy ?? []) {
      // function:Service.method → service:Service (assuming naming convention)
      const dot = fn.indexOf(".");
      if (dot < 0) continue;
      const svcId = "service:" + fn.slice("function:".length, dot);
      const mod = fnToModule.get(svcId);
      if (mod) modulesTouched.add(mod);
    }
  }
  if (modulesTouched.size > 1) {
    warnings.push(`${proc.id}: implementedBy references span ${modulesTouched.size} modules (${[...modulesTouched].join(", ")}) — verify the process is genuinely cross-cutting`);
  }

  return summary;
}

// ─── Main ─────────────────────────────────────────────────────────────────
async function main() {
  const args = argv.slice(2);
  let asJson = false;
  let onlyProcess = null;
  const files = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") asJson = true;
    else if (a === "--process") onlyProcess = args[++i];
    else if (a === "-h" || a === "--help") {
      stdout.write("Usage: node generate.mjs [--json] [--process <id>] <path-to-model>\n");
      exit(0);
    } else files.push(a);
  }
  if (files.length !== 1) {
    stderr.write("Usage: node generate.mjs [--json] [--process <id>] <path-to-model>\n");
    exit(2);
  }
  const modelPath = resolve(files[0]);
  const model = await loadModel(modelPath, asJson);
  if (!model || typeof model !== "object") fatal("Model file did not parse to an object.");
  if (!Array.isArray(model.processes) || model.processes.length === 0) {
    fatal("Model has no processes[] section. Use design-model to bootstrap, then add processes.");
  }

  const designsDir = dirname(modelPath);
  const diagramsDir = join(designsDir, "diagrams");
  await mkdir(diagramsDir, { recursive: true });

  const targets = onlyProcess
    ? model.processes.filter((p) => p?.id === onlyProcess)
    : model.processes;
  if (targets.length === 0) {
    fatal(`No process matches --process ${onlyProcess}. Known IDs: ${model.processes.map((p) => p.id).join(", ")}`);
  }

  const warnings = [];
  const summaries = [];
  for (const proc of targets) {
    if (!proc?.id) continue;
    const puml = renderProcess(proc, model, warnings);
    const path = join(diagramsDir, `${processSlug(proc.id)}.puml`);
    await writeFile(path, puml, "utf8");
    stdout.write(`Wrote ${path}\n`);
    summaries.push(summariseProcess(proc, model.services ?? [], warnings));
  }

  stdout.write("\nSummary:\n");
  for (const s of summaries) stdout.write(`  • ${s}\n`);
  if (warnings.length > 0) {
    stdout.write("\nWARNINGS:\n");
    warnings.forEach((w, i) => stdout.write(`  ${i + 1}. ${w}\n`));
  } else {
    stdout.write("\nNo BPMN-layer warnings.\n");
  }
  exit(0);
}

main().catch((e) => fatal(`Internal error: ${e.stack || e.message}`));
