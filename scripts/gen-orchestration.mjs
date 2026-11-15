#!/usr/bin/env node
// =============================================================================
// Turns a project into orchestration mode: the main session orchestrates and
// delegates implementation/verification to kelo:implementer / kelo:verifier.
// Run by /kelo:setup (scripts/kelo.mjs) from the `orchestration` key in the
// project's kelo.yaml; also usable on its own.
//
// Writes into <output-dir>:
//   .claude/rules/kelo-orchestration.md ← rules/common/orchestration.md
//                                         (always overwritten)
//   .claude/settings.json               ← `model` key only; every other key
//                                         and the key order are preserved
//
// When the model is managed (no --no-model), line 2 of the generated rule file
// records what setup did, so --remove can undo exactly that:
//   <!-- kelo-orchestration-state: {"model":"<written>","previousModel":<string|null>} -->
// `previousModel` is the project's `model` before kelo first managed it (null if
// the key was absent). Re-running setup keeps the recorded `previousModel` and
// only updates `model`. With --no-model no state is written, but an existing
// state line is carried over unchanged (settings are not touched).
//
// --remove deletes the rule file and, using the state line:
//   - settings `model` still equals state.model → restore previousModel in the
//     same key position, or delete the key if previousModel is null
//   - settings `model` differs → leave settings alone (changed after setup)
//   - no state line → leave settings alone
// Everything is read and validated before anything is deleted or written.
//
// The subagents themselves ship with the plugin (agents/implementer.md,
// agents/verifier.md) and are not copied into the project.
//
// Usage:
//   gen-orchestration.mjs -p <output-dir> [--model <id> | --no-model]
//   gen-orchestration.mjs -p <output-dir> --remove
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { ensureGitRepo, normalizePath } from "./common.mjs";

const DEFAULT_MODEL = "claude-fable-5-2";
const RULE_FILE = path.join(".claude", "rules", "kelo-orchestration.md");
const SETTINGS_FILE = path.join(".claude", "settings.json");
const STATE_RE = /^<!-- kelo-orchestration-state: (.*) -->$/;

const HELP = `Usage: gen-orchestration.mjs -p <output-dir> [--model <id> | --no-model]
       gen-orchestration.mjs -p <output-dir> --remove

Enables orchestration mode (orchestrator + kelo:implementer / kelo:verifier).

Options:
  -p <dir>        Project root (required)
  --model <id>    Main-session model written to .claude/settings.json
                  (default: ${DEFAULT_MODEL}). The model the project had
                  before kelo first managed it is recorded in the rule file.
  --no-model      Do not touch .claude/settings.json
  --remove        Disable orchestration mode: delete the rule file and, if the
                  settings \`model\` is still the value setup wrote, restore the
                  project's previous model (or drop the key if there was none).
                  A model changed after setup, or one kelo never wrote (only
                  ever set up with --no-model), is left alone. Cannot be
                  combined with --model / --no-model.
  -h, --help      Show this help

Examples:
  ./scripts/gen-orchestration.mjs -p .
  ./scripts/gen-orchestration.mjs -p . --model opus
  ./scripts/gen-orchestration.mjs -p . --remove
`;

function usage(code = 1) {
  (code === 0 ? process.stdout : process.stderr).write(HELP);
  process.exit(code);
}

function fail(message) {
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {
    outputDir: "",
    model: "",
    modelGiven: false,
    writeModel: true,
    remove: false,
  };
  const rest = argv.slice(2);
  while (rest.length > 0) {
    const a = rest.shift();
    switch (a) {
      case "-p":
        if (!rest.length || rest[0].startsWith("-")) {
          process.stderr.write("-p requires a directory\n");
          usage();
        }
        args.outputDir = rest.shift();
        break;
      case "--model":
        if (!rest.length || !rest[0] || rest[0].startsWith("-")) {
          process.stderr.write("--model requires a model id\n");
          usage();
        }
        args.model = rest.shift();
        args.modelGiven = true;
        break;
      case "--no-model":
        args.writeModel = false;
        break;
      case "--remove":
        args.remove = true;
        break;
      case "-h":
      case "--help":
        usage(0);
        break;
      default:
        process.stderr.write(`Unknown option: ${a}\n`);
        usage();
    }
  }
  if (!args.outputDir) {
    process.stderr.write("Error: -p <output-dir> is required\n");
    usage();
  }
  if (args.remove && (args.modelGiven || !args.writeModel)) {
    process.stderr.write(
      "Error: --remove cannot be combined with --model or --no-model\n",
    );
    usage();
  }
  if (args.modelGiven && !args.writeModel) {
    process.stderr.write("Error: --model and --no-model are exclusive\n");
    usage();
  }
  return args;
}

function readSettings(file) {
  if (!fs.existsSync(file)) return {};
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    fail(`${file} is not valid JSON (${err.message}). Fix it and re-run.`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail(`${file} must contain a JSON object.`);
  }
  return parsed;
}

function writeSettings(file, settings) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`);
}

// Returns { line, state } from line 2 of an existing rule file, or null when
// the file, the line, or its JSON is missing/invalid (treated as no state).
function readState(ruleFile) {
  if (!fs.existsSync(ruleFile)) return null;
  const line = fs.readFileSync(ruleFile, "utf8").split("\n")[1] ?? "";
  const match = STATE_RE.exec(line);
  if (!match) return null;
  let state;
  try {
    state = JSON.parse(match[1]);
  } catch {
    return null;
  }
  if (
    state === null ||
    typeof state !== "object" ||
    typeof state.model !== "string" ||
    !(typeof state.previousModel === "string" || state.previousModel === null)
  ) {
    return null;
  }
  return { line, state };
}

function stateLine(state) {
  return `<!-- kelo-orchestration-state: ${JSON.stringify(state)} -->`;
}

// Inserts the state line right after the "Managed by kelo" header (line 1).
function renderRule(source, line) {
  const lines = fs.readFileSync(source, "utf8").split("\n");
  if (line) lines.splice(1, 0, line);
  return lines.join("\n");
}

function describe(value) {
  if (value === undefined) return "unset";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function enable(outputDir, args, source) {
  // Validate settings and read the previous state before writing anything so
  // a broken file leaves the project untouched instead of half-configured.
  const settingsFile = path.join(outputDir, SETTINGS_FILE);
  const settings = args.writeModel ? readSettings(settingsFile) : null;

  const ruleFile = path.join(outputDir, RULE_FILE);
  const existing = readState(ruleFile);

  let line = existing ? existing.line : null;
  let model;
  if (settings) {
    model = args.model || DEFAULT_MODEL;
    // Keep the model the project had before kelo first managed it; the
    // current value may be one kelo wrote on an earlier run.
    const previousModel = existing
      ? existing.state.previousModel
      : typeof settings.model === "string"
        ? settings.model
        : null;
    line = stateLine({ model, previousModel });
  }

  fs.mkdirSync(path.dirname(ruleFile), { recursive: true });
  fs.writeFileSync(ruleFile, renderRule(source, line));
  process.stdout.write(`Generated: ${ruleFile}\n`);

  if (!settings) return;

  const previous = settings.model;
  if (previous === model) {
    process.stdout.write(`Unchanged: ${settingsFile} (model: ${model})\n`);
    return;
  }
  writeSettings(settingsFile, { ...settings, model });
  process.stdout.write(
    previous === undefined
      ? `Updated: ${settingsFile} (model: ${model})\n`
      : `Updated: ${settingsFile} (model: ${describe(previous)} → ${model})\n`,
  );
}

function remove(outputDir) {
  const ruleFile = path.join(outputDir, RULE_FILE);
  const settingsFile = path.join(outputDir, SETTINGS_FILE);

  // Read and validate everything before deleting or writing anything.
  const existing = readState(ruleFile);
  const state = existing ? existing.state : null;
  const settings =
    state && fs.existsSync(settingsFile) ? readSettings(settingsFile) : null;

  if (fs.existsSync(ruleFile)) {
    fs.rmSync(ruleFile);
    process.stdout.write(`Removed: ${ruleFile}\n`);
  } else {
    process.stdout.write(`Not found: ${ruleFile}\n`);
  }

  // No state line (set up with --no-model, or no rule file): settings were
  // not ours to manage.
  if (!settings) return;

  if (settings.model !== state.model) {
    process.stdout.write(
      `Kept: ${settingsFile} (model: ${describe(settings.model)} — changed after orchestration setup)\n`,
    );
    return;
  }
  if (state.previousModel !== null) {
    writeSettings(settingsFile, { ...settings, model: state.previousModel });
    process.stdout.write(
      `Updated: ${settingsFile} (model restored: ${state.model} → ${state.previousModel})\n`,
    );
    return;
  }
  const { model: _dropped, ...remaining } = settings;
  writeSettings(settingsFile, remaining);
  process.stdout.write(`Updated: ${settingsFile} (model removed)\n`);
}

function main() {
  const args = parseArgs(process.argv);

  let outputDir;
  try {
    ensureGitRepo(args.outputDir);
    outputDir = normalizePath(args.outputDir);
  } catch (err) {
    fail(err.message);
  }

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const source = path.resolve(
    scriptDir,
    "..",
    "rules",
    "common",
    "orchestration.md",
  );
  if (!args.remove && !fs.existsSync(source)) {
    fail(`orchestration.md not found: ${source}`);
  }

  if (args.remove) remove(outputDir);
  else enable(outputDir, args, source);
}

main();
