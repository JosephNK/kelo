#!/usr/bin/env node
// =============================================================================
// Registers architecture_lint (and optional stack lint packages) as analyzer
// plugins in analysis_options.yaml via the new top-level `plugins:` section
// (analysis_server_plugin, Dart 3.10+).
//
// Each lint package is vendored into `.jkit/plugins/<package>/` next to the
// analysis_options.yaml that hosts `plugins:` and registered with a relative
// `path:` — portable across machines/CI. No umbrella custom_lint package. Also strips legacy
// custom_lint dev dependency and `analyzer.plugins:` registration if present.
//
// Delegates the YAML edits to `custom_lint/inject-custom-lint.mjs`, which uses
// the `yaml` package for round-trip YAML editing (preserves comments &
// formatting).
//
// Usage:
//   gen-custom-lint.mjs flutter -p <project-dir> [-entry <dir>] [--ref <git-ref>]
// =============================================================================

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

import { ensureFlutterRoot, normalizePath } from "../common.mjs";

// `--ref` and the legacy git URL are accepted for CLI backward compatibility
// but no longer used: `git:` in plugins: reports no diagnostics even on
// Dart 3.13.4 (dart-lang/sdk#61794), so plugin sources are vendored instead.

/**
 * Detect whether projectDir is a Dart pub workspace root that includes the
 * given entry as a member. analysis_server_plugin only honors `plugins:` at
 * the workspace root, so the entry's analysis_options.yaml is the wrong place.
 */
function isWorkspaceMember(projectDir, entry) {
  const rootPubspec = path.join(projectDir, "pubspec.yaml");
  if (!fs.existsSync(rootPubspec) || !fs.statSync(rootPubspec).isFile()) {
    return false;
  }
  let doc;
  try {
    doc = YAML.parseDocument(fs.readFileSync(rootPubspec, "utf-8"));
  } catch {
    return false;
  }
  const ws = doc.get("workspace");
  if (!YAML.isSeq(ws)) return false;
  const entries = ws.toJSON().map((s) => String(s).replace(/\/+$/, ""));
  return entries.includes(entry.replace(/\/+$/, ""));
}

const HELP = `Usage: gen-custom-lint.mjs flutter -p <project-dir> [-entry <dir>] [--stacks <stacks>]

Registers architecture_lint (base) + optional stack lint packages (e.g.
leaf_kit_lint when --stacks includes leaf-kit) as analyzer plugins in
analysis_options.yaml via the top-level \`plugins:\` section. Plugin sources
are copied from this plugin's checkout into \`.jkit/plugins/<package>/\` (commit
it) and registered with a relative \`path:\`, so they work on every machine/CI.

Use \`dart analyze\` (not \`flutter analyze\`, flutter/flutter#187999) to see
plugin diagnostics. \`--ref\` is accepted for backward compatibility but ignored.

Requires: Dart 3.10+ (Flutter 3.38+) and plugin's node_modules installed
(\`npm install\` in plugin root).

Arguments:
  flutter         Framework name (currently flutter only)

Options:
  -p <dir>        Project root directory (required)
  -entry <dir>    Flutter entry directory (default: app)
  --stacks <s>    Comma-separated convention stacks (default: none)
                  e.g. leaf-kit,freezed — installs matching stack lint package
  --ref <ref>     Deprecated/ignored (kept for backward compat)
  -h, --help      Show this help

Examples:
  ./scripts/flutter/gen-custom-lint.mjs flutter -p .
  ./scripts/flutter/gen-custom-lint.mjs flutter -p . -entry app
  ./scripts/flutter/gen-custom-lint.mjs flutter -p . --stacks leaf-kit
`;

function usage(code = 1) {
  (code === 0 ? process.stdout : process.stderr).write(HELP);
  process.exit(code);
}

function parseArgs(argv) {
  const args = {
    framework: "",
    projectDir: "",
    entry: "app",
    ref: "",
    stacks: "",
  };
  const rest = argv.slice(2);

  if (rest.length >= 1 && !rest[0].startsWith("-")) {
    args.framework = rest.shift();
  }

  while (rest.length > 0) {
    const a = rest.shift();
    switch (a) {
      case "-p":
        if (!rest.length) {
          process.stderr.write("-p requires a directory\n");
          usage();
        }
        args.projectDir = rest.shift();
        break;
      case "-entry":
        if (!rest.length) {
          process.stderr.write("-entry requires a directory\n");
          usage();
        }
        args.entry = rest.shift();
        break;
      case "--ref":
        if (!rest.length) {
          process.stderr.write("--ref requires a value\n");
          usage();
        }
        args.ref = rest.shift();
        break;
      case "--stacks":
        if (!rest.length) {
          process.stderr.write("--stacks requires a value\n");
          usage();
        }
        args.stacks = rest.shift();
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

  if (!args.framework) {
    process.stderr.write("Error: framework is required\n");
    usage();
  }
  if (!args.projectDir) {
    process.stderr.write("Error: -p <project-dir> is required\n");
    usage();
  }

  return args;
}

function main() {
  const args = parseArgs(process.argv);

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const pluginRoot = path.resolve(scriptDir, "..", "..");

  try {
    ensureFlutterRoot(args.projectDir, args.entry);
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }

  let projectDir;
  try {
    projectDir = normalizePath(args.projectDir);
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }

  const injectScript = path.join(
    scriptDir,
    "custom_lint",
    "inject-custom-lint.mjs",
  );

  // In a Dart pub workspace, the analyzer doesn't auto-inherit options from
  // the root — each member must `include:` the root's analysis_options.yaml
  // explicitly to pick up `plugins:` written there. dart-lang/sdk#62161.
  // We write `plugins:` to the root, and inject-custom-lint.mjs (via
  // --strip-stale-from) prepends the include into the member's options.
  // Non-workspace projects get plugins: directly in the entry's options.
  const inWorkspace = isWorkspaceMember(projectDir, args.entry);
  const analysisOptionsPath = inWorkspace
    ? "analysis_options.yaml"
    : path.join(args.entry, "analysis_options.yaml");
  const stalePath = inWorkspace
    ? path.join(args.entry, "analysis_options.yaml")
    : null;

  if (inWorkspace) {
    process.stdout.write(
      `  Detected pub workspace — writing plugins: to ${analysisOptionsPath} (root) ` +
        `and ensuring ${stalePath} includes it\n`,
    );
  }

  // Vendor plugin sources into .jkit/plugins/ and register relative `path:`
  // deps (see inject-custom-lint.mjs header for why not git/absolute path).
  const injectArgs = [
    injectScript,
    "--pubspec",
    path.join(args.entry, "pubspec.yaml"),
    "--analysis-options",
    analysisOptionsPath,
    "--plugin-root",
    pluginRoot,
  ];
  if (stalePath) {
    injectArgs.push("--strip-stale-from", stalePath);
  }
  if (args.stacks) {
    injectArgs.push("--stacks", args.stacks);
  }

  const result = spawnSync(process.execPath, injectArgs, {
    cwd: projectDir,
    // Preserve bash-style logical cwd semantics (matches `(cd && pwd)`).
    env: { ...process.env, PWD: projectDir },
    stdio: "inherit",
  });

  if (result.error) {
    process.stderr.write(
      `Error running inject-custom-lint.mjs: ${result.error.message}\n`,
    );
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  // Invalidate Dart analyzer plugin caches.
  // The new analysis_server_plugin system creates a synthetic package per
  // plugin set and caches the resolved sources. Restart of the analysis server
  // is required after plugin changes (per Dart docs); clearing both legacy and
  // new cache directories also helps surface fresh sources on next analyze.
  for (const cacheDir of [
    path.join(os.homedir(), ".dartServer", ".plugin_manager"),
    path.join(os.homedir(), ".dartServer", ".analysis_server_plugin"),
  ]) {
    if (fs.existsSync(cacheDir)) {
      fs.rmSync(cacheDir, { recursive: true, force: true });
      process.stdout.write(`  Cleared ${cacheDir}\n`);
    }
  }
  process.stdout.write(
    "  Note: restart the Dart Analysis Server (or your IDE) to apply changes.\n",
  );
}

main();
