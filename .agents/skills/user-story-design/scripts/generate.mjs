#!/usr/bin/env node
// Generator for the user-story (agile backlog) design layer.
//
// Reads designs/system-model.yaml (or --json file), writes:
//   designs/stories.md                          (always)
//   designs/features/<epic-slug>.feature        (only with --gherkin)
//
// Per-run summary and story-layer warnings are printed to stdout.
// The foundation validator is invoked before generation so grammar /
// cross-reference errors fail fast — see
// .agents/skills/design-model/scripts/validate.mjs.
//
// Exit codes:
//   0 — success (warnings allowed); also returned for an empty / absent
//       stories[] section so the script is safe to run on a fresh model
//   1 — foundation validation failed (ID grammar or cross-ref errors)
//   2 — internal failure (file unreadable, parse error)

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { argv, exit, stdout, stderr } from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VALIDATOR_PATH = resolve(__dirname, "..", "..", "design-model", "scripts", "validate.mjs");

const PRIORITIES = ["must", "should", "could", "wont"];
const PRIORITY_RANK = new Map(PRIORITIES.map((p, i) => [p, i]));
const FIBONACCI = new Set([1, 2, 3, 5, 8, 13, 21]);
const TSHIRT = new Set(["xs", "s", "m", "l", "xl"]);

// Run the foundation validator as a subprocess on the same model file
// and forward its stdio. Resolves to its exit code.
function runValidator(modelPath, asJson) {
  return new Promise((resolveCode) => {
    const args = [VALIDATOR_PATH];
    if (asJson) args.push("--json");
    args.push(modelPath);
    const child = spawn(process.execPath, args, { stdio: "inherit" });
    child.on("error", (err) => {
      stderr.write(`generate.mjs: failed to spawn foundation validator: ${err.message}\n`);
      resolveCode(2);
    });
    child.on("exit", (code) => resolveCode(code ?? 2));
  });
}

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

// ─── Helpers ──────────────────────────────────────────────────────────────
// epic label → slug. "Customer Ordering" → "customer-ordering".
// Empty / missing epic → "unassigned".
function epicSlug(label) {
  if (typeof label !== "string" || label.trim() === "") return "unassigned";
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unassigned";
}

// actor:Customer → "Customer" (display name fallback).
function actorDisplay(actorId, model) {
  if (typeof actorId !== "string") return "(unknown actor)";
  const known = (model.actors ?? []).find((a) => a?.id === actorId);
  return known?.name ?? actorId.replace(/^actor:/, "");
}

// story:customer-orders-food → "customer-orders-food"
function storyName(id) {
  if (typeof id !== "string") return "unknown";
  return id.replace(/^story:/, "");
}

// Render one Gherkin Scenario block (4-space indent for body).
function renderScenario(ac, indent) {
  const pad = " ".repeat(indent);
  const title = (ac?.then ?? "scenario").replace(/^./, (c) => c.toLowerCase());
  const lines = [];
  lines.push(`${pad}Scenario: ${title}`);
  if (ac?.given) lines.push(`${pad}  Given ${ac.given}`);
  if (ac?.when)  lines.push(`${pad}  When ${ac.when}`);
  if (ac?.then)  lines.push(`${pad}  Then ${ac.then}`);
  return lines.join("\n");
}

// ─── Backlog markdown rendering ───────────────────────────────────────────
function renderBacklog(model, byEpic) {
  const out = [];
  out.push("# Backlog");
  out.push("");
  out.push(`Generated from \`designs/system-model.yaml\` on ${new Date().toISOString()}. Do not hand-edit.`);
  out.push("");

  const epics = sortedEpicKeys(byEpic);
  if (epics.length === 0) {
    out.push("> No stories declared. Add some via the `user-story-design` skill.");
    out.push("");
    return out.join("\n");
  }

  for (const epicKey of epics) {
    const epicLabel = epicKey === "" ? "Unassigned" : epicKey;
    out.push(`## ${epicLabel}`);
    out.push("");
    const stories = [...byEpic.get(epicKey)].sort(storyOrder);
    for (const s of stories) {
      const points = s.points !== undefined && s.points !== null ? ` · ${s.points} pts` : "";
      const prio = s.priority ?? "?";
      out.push(`### ${s.id} (${prio}${points})`);
      out.push("");
      const role = actorDisplay(s.role, model);
      const goal = s.goal ?? "(no goal declared)";
      const benefit = s.benefit ? ` **so that** ${s.benefit}` : "";
      out.push(`**As a** ${role} **I want to** ${goal}${benefit}.`);
      out.push("");
      const acs = Array.isArray(s.acceptanceCriteria) ? s.acceptanceCriteria : [];
      if (acs.length > 0) {
        out.push("```gherkin");
        for (let i = 0; i < acs.length; i++) {
          out.push(renderScenario(acs[i], 0));
          if (i < acs.length - 1) out.push("");
        }
        out.push("```");
        out.push("");
      }
      const footer = [];
      if ((s.realizes ?? []).length > 0)       footer.push(`- **Realizes**: ${s.realizes.join(", ")}`);
      if ((s.implementedBy ?? []).length > 0)  footer.push(`- **Implemented by**: ${s.implementedBy.join(", ")}`);
      if ((s.dependsOn ?? []).length > 0)      footer.push(`- **Depends on**: ${s.dependsOn.join(", ")}`);
      if (footer.length > 0) {
        out.push(footer.join("\n"));
        out.push("");
      }
    }
  }
  return out.join("\n");
}

// ─── Gherkin .feature rendering ───────────────────────────────────────────
function renderFeature(epicLabel, stories, model) {
  const lines = [];
  lines.push(`# Generated from designs/system-model.yaml on ${new Date().toISOString()}. Do not hand-edit.`);
  lines.push(`# Epic: ${epicLabel || "Unassigned"}`);
  lines.push("");
  for (const s of stories) {
    lines.push(`Feature: ${storyName(s.id)}`);
    const role = actorDisplay(s.role, model);
    lines.push(`  As a ${role}`);
    if (s.goal)    lines.push(`  I want to ${s.goal}`);
    if (s.benefit) lines.push(`  So that ${s.benefit}`);
    lines.push("");
    const acs = Array.isArray(s.acceptanceCriteria) ? s.acceptanceCriteria : [];
    for (let i = 0; i < acs.length; i++) {
      lines.push(renderScenario(acs[i], 2));
      lines.push("");
    }
    if (acs.length === 0) {
      lines.push("");
    }
  }
  return lines.join("\n");
}

// Sort epic keys: declared epics alphabetically, then "" (Unassigned) last.
function sortedEpicKeys(byEpic) {
  const keys = [...byEpic.keys()];
  const named = keys.filter((k) => k !== "").sort((a, b) => a.localeCompare(b));
  const hasUn = keys.includes("");
  return hasUn ? [...named, ""] : named;
}

// Stories within an epic: priority must→should→could→wont, then by ID.
function storyOrder(a, b) {
  const ap = PRIORITY_RANK.has(a.priority) ? PRIORITY_RANK.get(a.priority) : 99;
  const bp = PRIORITY_RANK.has(b.priority) ? PRIORITY_RANK.get(b.priority) : 99;
  if (ap !== bp) return ap - bp;
  return (a.id ?? "").localeCompare(b.id ?? "");
}

// ─── Story-layer warnings ─────────────────────────────────────────────────
function lintStories(stories, warnings) {
  const byId = new Map();
  for (const s of stories) {
    if (s?.id) byId.set(s.id, s);
  }

  for (const s of stories) {
    if (!s?.id) continue;

    // Priority within MoSCoW set.
    if (s.priority && !PRIORITY_RANK.has(s.priority)) {
      warnings.push(`${s.id}: priority "${s.priority}" is not one of ${PRIORITIES.join(" / ")}`);
    }
    if (!s.priority) {
      warnings.push(`${s.id}: missing priority — add one of ${PRIORITIES.join(" / ")}`);
    }

    // Points domain check.
    if (s.points !== undefined && s.points !== null) {
      const isFib = typeof s.points === "number" && FIBONACCI.has(s.points);
      const isTshirt = typeof s.points === "string" && TSHIRT.has(s.points.toLowerCase());
      if (!isFib && !isTshirt) {
        warnings.push(`${s.id}: points "${s.points}" is not a Fibonacci number (${[...FIBONACCI].join(", ")}) or t-shirt size (${[...TSHIRT].join(", ")})`);
      }
    }

    // Required-ish fields.
    if (!s.role)              warnings.push(`${s.id}: no role (every story needs an actor it speaks for)`);
    if (!s.goal)              warnings.push(`${s.id}: no goal (the "I want to …" half is required)`);
    if (!s.benefit)           warnings.push(`${s.id}: no benefit (the "so that …" half is strongly recommended)`);

    // Acceptance criteria well-formedness.
    const acs = Array.isArray(s.acceptanceCriteria) ? s.acceptanceCriteria : [];
    if (acs.length === 0) {
      warnings.push(`${s.id}: no acceptanceCriteria — story is not testable yet`);
    }
    for (let i = 0; i < acs.length; i++) {
      const ac = acs[i];
      if (!ac || typeof ac !== "object") {
        warnings.push(`${s.id}: acceptanceCriteria[${i}] is not an object`);
        continue;
      }
      const missing = ["given", "when", "then"].filter((k) => typeof ac[k] !== "string" || ac[k].trim() === "");
      if (missing.length > 0) {
        warnings.push(`${s.id}: acceptanceCriteria[${i}] missing ${missing.join(", ")}`);
      }
    }

    // Cross-layer informational gaps (also flagged by the EA orchestrator).
    if ((s.realizes ?? []).length === 0) {
      warnings.push(`${s.id}: realizes no use case — confirm intent or add a usecase: reference`);
    }
    if ((s.implementedBy ?? []).length === 0) {
      warnings.push(`${s.id}: no implementedBy — fine in early backlog, suspicious once mid-sprint`);
    }

    // Self-reference in dependsOn.
    for (const dep of s.dependsOn ?? []) {
      if (dep === s.id) {
        warnings.push(`${s.id}: dependsOn lists itself — remove the self-reference`);
      }
    }
  }

  // dependsOn cycle detection (depth-first walk, canonical signature dedupe).
  const reported = new Set();
  for (const start of stories) {
    if (!start?.id || !(start.dependsOn ?? []).length) continue;
    const stack = [{ id: start.id, path: [start.id], inPath: new Set([start.id]) }];
    while (stack.length > 0) {
      const { id, path, inPath } = stack.pop();
      const node = byId.get(id);
      if (!node) continue;
      for (const dep of node.dependsOn ?? []) {
        if (inPath.has(dep)) {
          const cycleStart = path.indexOf(dep);
          if (cycleStart < 0) continue;
          const cycle = path.slice(cycleStart);
          const sig = [...cycle].sort().join("→");
          if (!reported.has(sig)) {
            reported.add(sig);
            warnings.push(`dependsOn cycle detected: ${cycle.concat(dep).join(" → ")}`);
          }
          continue;
        }
        if (!byId.has(dep)) continue;
        const newPath = [...path, dep];
        const newSet = new Set(inPath);
        newSet.add(dep);
        stack.push({ id: dep, path: newPath, inPath: newSet });
      }
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────
async function main() {
  const args = argv.slice(2);
  let asJson = false;
  let emitGherkin = false;
  const files = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") asJson = true;
    else if (a === "--gherkin") emitGherkin = true;
    else if (a === "-h" || a === "--help") {
      stdout.write("Usage: node generate.mjs [--json] [--gherkin] <path-to-model>\n");
      exit(0);
    } else files.push(a);
  }
  if (files.length !== 1) {
    stderr.write("Usage: node generate.mjs [--json] [--gherkin] <path-to-model>\n");
    exit(2);
  }
  const modelPath = resolve(files[0]);

  // Run the foundation validator first so grammar / cross-reference
  // errors surface before we render anything. Story refs cross four kinds
  // (actor, usecase, function, story) — partial validation makes warnings
  // here hard to trust.
  const validatorCode = await runValidator(modelPath, asJson);
  if (validatorCode === 1) {
    stderr.write("generate.mjs: foundation validation failed — fix the errors above before regenerating.\n");
    exit(1);
  }
  if (validatorCode !== 0) {
    // 2 = internal failure inside the validator. The validator already
    // printed its own diagnostic to stderr.
    exit(2);
  }

  const model = await loadModel(modelPath, asJson);
  if (!model || typeof model !== "object") fatal("Model file did not parse to an object.");
  const stories = Array.isArray(model.stories) ? model.stories.filter((s) => s?.id) : [];
  if (stories.length === 0) {
    stdout.write("No stories[] section in the model — nothing to generate.\n");
    exit(0);
  }

  const designsDir = dirname(modelPath);
  await mkdir(designsDir, { recursive: true });

  // Group by epic (empty key for "Unassigned").
  const byEpic = new Map();
  for (const s of stories) {
    const key = typeof s.epic === "string" && s.epic.trim() !== "" ? s.epic : "";
    if (!byEpic.has(key)) byEpic.set(key, []);
    byEpic.get(key).push(s);
  }

  // Slug-collision guard on the .feature side: two distinct epic labels
  // can slugify to the same filename ("A B" and "A-B" both → "a-b").
  // Detect across the FULL group set so a partial regenerate never
  // clobbers a previously-emitted feature file from a colliding epic.
  if (emitGherkin) {
    const slugToLabels = new Map();
    for (const key of byEpic.keys()) {
      const s = epicSlug(key);
      if (!slugToLabels.has(s)) slugToLabels.set(s, []);
      slugToLabels.get(s).push(key === "" ? "(unassigned)" : key);
    }
    const collisions = [...slugToLabels.entries()].filter(([, ls]) => ls.length > 1);
    if (collisions.length > 0) {
      const detail = collisions
        .map(([s, ls]) => `  ${s}.feature ← ${ls.map((l) => `"${l}"`).join(", ")}`)
        .join("\n");
      fatal(
        "Two or more epic labels slugify to the same .feature filename:\n" +
        detail + "\n" +
        "Rename one of the colliding epic labels in the model so each epic writes a distinct file."
      );
    }
  }

  // Write backlog markdown.
  const backlogPath = join(designsDir, "stories.md");
  await writeFile(backlogPath, renderBacklog(model, byEpic), "utf8");
  stdout.write(`Wrote ${backlogPath}\n`);

  // Write per-epic .feature files (only with --gherkin).
  if (emitGherkin) {
    const featuresDir = join(designsDir, "features");
    await mkdir(featuresDir, { recursive: true });
    for (const [key, list] of byEpic.entries()) {
      const sorted = [...list].sort(storyOrder);
      const path = join(featuresDir, `${epicSlug(key)}.feature`);
      await writeFile(path, renderFeature(key, sorted, model), "utf8");
      stdout.write(`Wrote ${path}\n`);
    }
  }

  // Layer warnings.
  const warnings = [];
  lintStories(stories, warnings);

  // Priority distribution.
  const counts = Object.fromEntries(PRIORITIES.map((p) => [p, 0]));
  let unknownPriority = 0;
  for (const s of stories) {
    if (PRIORITY_RANK.has(s.priority)) counts[s.priority] += 1;
    else unknownPriority += 1;
  }
  if (counts.must === stories.length && stories.length > 1) {
    warnings.push(`every story is priority "must" — backlog is unprioritised; force the should/could/wont conversation`);
  }

  const epicCount = byEpic.size;
  const distParts = PRIORITIES.map((p) => `${counts[p]} ${p}`);
  if (unknownPriority > 0) distParts.push(`${unknownPriority} ?`);
  stdout.write("\nSummary:\n");
  stdout.write(`  • stories — ${stories.length} stories · ${epicCount} epic${epicCount === 1 ? "" : "s"} · ${distParts.join(" · ")}\n`);

  if (warnings.length > 0) {
    stdout.write("\nWARNINGS:\n");
    warnings.forEach((w, i) => stdout.write(`  ${i + 1}. ${w}\n`));
  } else {
    stdout.write("\nNo story-layer warnings.\n");
  }
  exit(0);
}

main().catch((e) => fatal(`Internal error: ${e.stack || e.message}`));
