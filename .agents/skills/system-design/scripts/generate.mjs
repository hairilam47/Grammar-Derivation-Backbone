#!/usr/bin/env node
// Generator for the system-design layer (services, functions, flows).
//
// Reads designs/system-model.yaml (or --json file), writes:
//   - designs/diagrams/system-c4.puml      (one C4 component view)
//   - designs/diagrams/seq-<slug>.puml     (one sequence diagram per flow)
//
// Per-flow and global summaries are printed to stdout.
// Foundation-layer issues (unresolved IDs, wrong-kind references) are the
// foundation validator's responsibility — see
// .agents/skills/design-model/scripts/validate.mjs.
//
// Exit codes:
//   0 — success (warnings allowed)
//   2 — internal failure (file unreadable, parse error, missing required sections)

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

// flow:place-order            → seq-place-order
// flow:billing/refund         → seq-billing_refund
function flowSlug(id) {
  if (typeof id !== "string") return "seq-unknown";
  return "seq-" + id.replace(/^flow:/, "").replace(/[\/\.]/g, "_");
}

// Kind-prefixed safe alias so service:Foo and module:foo never collide.
function alias(id) {
  if (typeof id !== "string") return "n_unknown";
  const [kind, rest] = id.split(":", 2);
  const safe = (rest ?? id).replace(/[^A-Za-z0-9]/g, "_");
  const prefix = kind === "service" ? "svc_"
               : kind === "function" ? "fn_"
               : kind === "module" ? "mod_"
               : kind === "flow" ? "flow_"
               : "n_";
  return prefix + safe;
}

function plantQuote(s) {
  if (s == null) return "";
  return String(s).replace(/"/g, '\\"');
}

// function:OrderService.placeOrder → "OrderService"
// function:OrderService.placeOrder → "placeOrder"
function functionService(fnId) {
  if (typeof fnId !== "string" || !fnId.startsWith("function:")) return null;
  const dot = fnId.indexOf(".");
  if (dot < 0) return null;
  return "service:" + fnId.slice("function:".length, dot);
}
function functionMethod(fnId) {
  if (typeof fnId !== "string" || !fnId.startsWith("function:")) return null;
  const dot = fnId.indexOf(".");
  if (dot < 0) return null;
  return fnId.slice(dot + 1);
}

// ─── C4 component diagram ─────────────────────────────────────────────────
function renderC4(model, warnings, summary) {
  const services = model.services ?? [];
  const functions = model.functions ?? [];
  const fnById = new Map(functions.map((f) => [f.id, f]));
  const svcById = new Map(services.map((s) => [s.id, s]));

  // Group services by module — undeclared / missing modules bucket as
  // "module:tbd" so the diagram still renders; the foundation validator
  // would have flagged a missing module already.
  const byModule = new Map();
  for (const s of services) {
    const mod = s?.module ?? "module:tbd";
    if (!byModule.has(mod)) byModule.set(mod, []);
    byModule.get(mod).push(s);
  }

  const lines = [];
  lines.push("@startuml system-c4");
  lines.push("' Generated from designs/system-model.yaml — do not hand-edit.");
  lines.push("' Regenerate with: node .agents/skills/system-design/scripts/generate.mjs designs/system-model.yaml");
  lines.push("title System — Component View");
  lines.push("skinparam component {");
  lines.push("  BackgroundColor<<service>>  LightBlue");
  lines.push("  BorderColor<<service>>      SteelBlue");
  lines.push("}");
  lines.push("skinparam rectangle {");
  lines.push("  BackgroundColor<<module>>   #FAFAFA");
  lines.push("  BorderColor<<module>>       #888888");
  lines.push("}");
  lines.push("");

  for (const [mod, svcs] of byModule) {
    lines.push(`rectangle "${plantQuote(mod)}" <<module>> {`);
    for (const s of svcs) {
      lines.push(`  component "${plantQuote(s.name ?? s.id)}" as ${alias(s.id)} <<service>>`);
    }
    lines.push("}");
  }
  lines.push("");

  // Build edges: one per (caller, callee) pair, label = consumed methods.
  const edges = new Map(); // key = "caller→callee", value = Set<methodLabel>
  let edgeCount = 0;
  for (const s of services) {
    for (const consumedFn of s?.consumes ?? []) {
      const calleeSvc = functionService(consumedFn);
      const method = functionMethod(consumedFn);
      if (!calleeSvc) {
        warnings.push(`service ${s.id}: consumes "${consumedFn}" — not a recognised function ID`);
        continue;
      }
      if (!svcById.has(calleeSvc)) {
        warnings.push(`service ${s.id}: consumes function from unknown service ${calleeSvc} (run validate.mjs for full ID checks)`);
        continue;
      }
      if (calleeSvc === s.id) continue; // self-edges skipped (see references)
      const key = `${s.id}→${calleeSvc}`;
      if (!edges.has(key)) edges.set(key, new Set());
      edges.get(key).add(method ?? consumedFn);
    }
  }
  for (const [key, methods] of edges) {
    const [caller, callee] = key.split("→");
    const label = [...methods].join("\\n");
    lines.push(`${alias(caller)} --> ${alias(callee)} : "${plantQuote(label)}"`);
    edgeCount++;
  }
  lines.push("");
  lines.push("@enduml");

  summary.c4 = `system-c4 — ${services.length} services in ${byModule.size} modules · ${edgeCount} function-call edges`;
  return lines.join("\n") + "\n";
}

// ─── Per-flow sequence diagram ────────────────────────────────────────────
function renderFlow(flow, model, warnings, summaries) {
  const services = model.services ?? [];
  const functions = model.functions ?? [];
  const svcById = new Map(services.map((s) => [s.id, s]));
  const fnById = new Map(functions.map((f) => [f.id, f]));

  const sequence = flow.sequence ?? [];
  const slug = flowSlug(flow.id);

  const lines = [];
  lines.push(`@startuml ${slug}`);
  lines.push("' Generated from designs/system-model.yaml — do not hand-edit.");
  lines.push(`' Flow: ${flow.id}${flow.name ? ` (${flow.name})` : ""}`);
  lines.push("' Regenerate with: node .agents/skills/system-design/scripts/generate.mjs designs/system-model.yaml");
  if (flow.name) lines.push(`title Flow: ${plantQuote(flow.name)}`);
  lines.push("");

  // Resolve each step to its owning service. Skip steps that don't resolve
  // (foundation validator hard-fails on those; we warn and continue).
  const resolved = [];
  for (const fnId of sequence) {
    const svcId = functionService(fnId);
    if (!svcId || !svcById.has(svcId)) {
      warnings.push(`${flow.id}: step ${fnId} skipped — owning service ${svcId ?? "?"} not in services[]`);
      continue;
    }
    if (!fnById.has(fnId)) {
      warnings.push(`${flow.id}: step ${fnId} not declared in functions[] (run validate.mjs)`);
      // Render the call anyway — the service exists, so we know who it lands on.
    }
    resolved.push({ fnId, svcId, method: functionMethod(fnId) ?? fnId });
  }

  // Participants — one per unique service in order of first appearance,
  // plus an External participant for the entry point.
  const participants = [];
  const seenSvc = new Set();
  participants.push({ alias: "ext", label: "External" });
  for (const step of resolved) {
    if (!seenSvc.has(step.svcId)) {
      seenSvc.add(step.svcId);
      const svc = svcById.get(step.svcId);
      participants.push({ alias: alias(step.svcId), label: svc?.name ?? step.svcId });
    }
  }
  lines.push(`participant "External" as ext`);
  for (const p of participants.slice(1)) {
    lines.push(`participant "${plantQuote(p.label)}" as ${p.alias}`);
  }
  lines.push("");

  // Edges: external → first; then each step's owning service → next step's owning service.
  let prevAlias = "ext";
  for (const step of resolved) {
    const calleeAlias = alias(step.svcId);
    lines.push(`${prevAlias} -> ${calleeAlias} : "${plantQuote(step.method)}"`);
    prevAlias = calleeAlias;
  }
  lines.push("");
  lines.push("@enduml");

  // Per-flow summary + warnings.
  const svcsTouched = new Set(resolved.map((r) => r.svcId));
  const modulesTouched = new Set();
  for (const sId of svcsTouched) {
    const mod = svcById.get(sId)?.module;
    if (mod) modulesTouched.add(mod);
  }
  summaries.push(`${flow.id} — ${svcsTouched.size + (resolved.length > 0 ? 1 : 0)} participants · ${resolved.length} steps · spans ${svcsTouched.size} services / ${modulesTouched.size} modules`);

  // Disconnected first step: first function isn't exposed by any service.
  if (resolved.length > 0) {
    const firstFn = resolved[0].fnId;
    const exposingSvc = services.find((s) => (s?.exposes ?? []).includes(firstFn));
    if (!exposingSvc) {
      warnings.push(`${flow.id}: first step ${firstFn} is not exposed by any service — likely modelling error (no entry point declared)`);
    }
  }
  if (modulesTouched.size > 1) {
    warnings.push(`${flow.id}: spans ${modulesTouched.size} modules (${[...modulesTouched].join(", ")}) — informational, real flows often cross modules`);
  }

  return lines.join("\n") + "\n";
}

// ─── Cross-layer warnings (run once, not per flow) ────────────────────────
function reportCrossLayer(model, warnings) {
  const services = model.services ?? [];
  const functions = model.functions ?? [];
  const flows = model.flows ?? [];

  const fnIds = new Set(functions.map((f) => f.id).filter(Boolean));
  const exposedFnIds = new Set();
  for (const s of services) for (const f of s?.exposes ?? []) exposedFnIds.add(f);
  const consumedFnIds = new Set();
  for (const s of services) for (const f of s?.consumes ?? []) consumedFnIds.add(f);
  const flowMembers = new Set();
  for (const fl of flows) for (const f of fl?.sequence ?? []) flowMembers.add(f);

  // Services that don't expose anything, don't consume anything, and aren't
  // mentioned anywhere — leftover stubs.
  for (const s of services) {
    const hasExposes = (s?.exposes?.length ?? 0) > 0;
    const hasConsumes = (s?.consumes?.length ?? 0) > 0;
    const isCallee = services.some((other) =>
      (other?.consumes ?? []).some((f) => functionService(f) === s.id)
    );
    const inFlow = [...flowMembers].some((f) => functionService(f) === s.id);
    if (!hasExposes && !hasConsumes && !isCallee && !inFlow) {
      warnings.push(`orphan service: ${s.id} — declares no exposes / consumes, isn't called by anyone, and doesn't appear in any flow`);
    }
  }

  // Functions not exposed by any service and not in any flow.
  for (const f of functions) {
    if (!exposedFnIds.has(f.id) && !flowMembers.has(f.id)) {
      warnings.push(`orphan function: ${f.id} — not exposed by any service and not in any flow`);
    }
  }

  // function.service / service.exposes mismatches.
  const exposeMap = new Map(); // function id → service id that exposes it
  for (const s of services) {
    for (const f of s?.exposes ?? []) exposeMap.set(f, s.id);
  }
  for (const f of functions) {
    if (!f?.service) continue;
    const exposingSvc = exposeMap.get(f.id);
    if (exposingSvc && exposingSvc !== f.service) {
      warnings.push(`function/service mismatch: ${f.id}.service = ${f.service} but ${exposingSvc}.exposes lists it`);
    } else if (!exposingSvc) {
      warnings.push(`function/service mismatch: ${f.id}.service = ${f.service} but no service exposes it (add to ${f.service}.exposes[])`);
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────
async function main() {
  const args = argv.slice(2);
  let asJson = false;
  let onlyFlow = null;
  const files = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") asJson = true;
    else if (a === "--flow") onlyFlow = args[++i];
    else if (a === "-h" || a === "--help") {
      stdout.write("Usage: node generate.mjs [--json] [--flow <id>] <path-to-model>\n");
      exit(0);
    } else files.push(a);
  }
  if (files.length !== 1) {
    stderr.write("Usage: node generate.mjs [--json] [--flow <id>] <path-to-model>\n");
    exit(2);
  }
  const modelPath = resolve(files[0]);
  const model = await loadModel(modelPath, asJson);
  if (!model || typeof model !== "object") fatal("Model file did not parse to an object.");

  // Required sections — at least one of services/functions/flows must exist.
  if (!Array.isArray(model.services) && !Array.isArray(model.functions) && !Array.isArray(model.flows)) {
    fatal("Model has no services[], functions[], or flows[] section. Use design-model to bootstrap.");
  }

  const designsDir = dirname(modelPath);
  const diagramsDir = join(designsDir, "diagrams");
  await mkdir(diagramsDir, { recursive: true });

  const warnings = [];
  const summaryHolder = {};
  const flowSummaries = [];

  // C4 component diagram (skipped when --flow is targeted).
  if (!onlyFlow) {
    const c4 = renderC4(model, warnings, summaryHolder);
    const c4Path = join(diagramsDir, "system-c4.puml");
    await writeFile(c4Path, c4, "utf8");
    stdout.write(`Wrote ${c4Path}\n`);
  }

  // Per-flow sequence diagrams.
  const flows = model.flows ?? [];
  const targets = onlyFlow ? flows.filter((f) => f?.id === onlyFlow) : flows;
  if (onlyFlow && targets.length === 0) {
    fatal(`No flow matches --flow ${onlyFlow}. Known IDs: ${flows.map((f) => f.id).join(", ") || "(none)"}`);
  }
  for (const flow of targets) {
    if (!flow?.id) continue;
    const puml = renderFlow(flow, model, warnings, flowSummaries);
    const path = join(diagramsDir, `${flowSlug(flow.id)}.puml`);
    await writeFile(path, puml, "utf8");
    stdout.write(`Wrote ${path}\n`);
  }

  // Cross-layer warnings (only on full runs, not for single-flow regenerations).
  if (!onlyFlow) reportCrossLayer(model, warnings);

  stdout.write("\nSummary:\n");
  if (summaryHolder.c4) stdout.write(`  • ${summaryHolder.c4}\n`);
  for (const s of flowSummaries) stdout.write(`  • ${s}\n`);
  if (warnings.length > 0) {
    stdout.write("\nWARNINGS:\n");
    warnings.forEach((w, i) => stdout.write(`  ${i + 1}. ${w}\n`));
  } else {
    stdout.write("\nNo system-layer warnings.\n");
  }
  exit(0);
}

main().catch((e) => fatal(`Internal error: ${e.stack || e.message}`));
