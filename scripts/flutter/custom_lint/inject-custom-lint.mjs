#!/usr/bin/env node
// =============================================================================
// Inject architecture_lint (base) + stack-specific lint packages into
// `analysis_options.yaml` via the top-level `plugins:` section
// (analysis_server_plugin, Dart 3.10+).
//
// Dependency form: vendored copy + RELATIVE `path:`.
// Each plugin's sources (pubspec.yaml + lib/) are copied into
// `<dir of analysis_options.yaml>/.kelo/plugins/<package>/` and registered as
// `path: .kelo/plugins/<package>`. The copy is committed with the project, so
// the rules run the same on every machine and in CI.
//   - `git:` in plugins: resolves but reports no diagnostics (verified on
//     Dart 3.13.4; dart-lang/sdk#61794) — not usable yet.
//   - An absolute `path:` to the kelo plugin cache only works on one machine.
// A `.kelo-vendor.json` manifest (sha256 per file) is written next to each
// copy; `dart run kelo_analysis:verify` rejects modified copies.
// Every run replaces the copy (rules update via /kelo:flutter-sync).
//
// Each plugin entry is written with both `path:` and a `diagnostics:` enable
// list (every rule code mapped to `true`). The codes are auto-extracted from
// each plugin's `lib/src/lints/*.dart` (`LintCode('code_name', ...)`).
// `path:` alone is parsed but does NOT activate the rules — the `diagnostics:`
// block is required for analysis_server_plugin to actually run them.
//
// Workspace handling (Dart pub workspace):
//   - `plugins:` is registered at the workspace **root**'s analysis_options.yaml.
//   - Members do NOT automatically inherit options from the root — each member
//     must explicitly `include: <relpath-to-root>/analysis_options.yaml` to
//     pick up the root's `plugins:` (and other options). Without that include,
//     the root config has zero effect on the member. dart-lang/sdk#62161.
//   - Pass --strip-stale-from <member-path> to:
//       (a) strip any direct `plugins:`/`analyzer.plugins:` from the member
//           (single source of truth at root)
//       (b) prepend `include: <relpath-to-root>` if not already present
//
// Also strips the legacy `custom_lint` dev dependency and `analyzer.plugins:
// [custom_lint]` registration if found, to clean up post-migration.
//
// Uses the `yaml` package (Document API) for round-trip YAML editing —
// preserves comments, formatting, and existing structure.
//
// Usage:
//   inject-custom-lint.mjs \
//     --pubspec app/pubspec.yaml \
//     --analysis-options analysis_options.yaml \
//     --plugin-root /abs/path/to/kelo \
//     [--stacks leaf-kit,freezed] \
//     [--strip-stale-from app/analysis_options.yaml]
// =============================================================================

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import YAML from "yaml";

// Legacy umbrella plugin name — stripped from pubspec/analysis_options on injection.
const LEGACY_CUSTOM_LINT = "custom_lint";

// Base package — always injected. `subPath` is relative to --plugin-root
// (the local kelo checkout).
const BASE_PACKAGE = {
  name: "architecture_lint",
  subPath: "rules/flutter/base/custom-lint/architecture_lint",
};

// Stack → package mapping. Selecting a stack installs the corresponding lint
// package as an additional analyzer plugin.
const STACK_PACKAGES = {
  "leaf-kit": {
    name: "leaf_kit_lint",
    subPath: "rules/flutter/leaf-kit/custom-lint/leaf_kit_lint",
  },
  freezed: {
    name: "freezed_lint",
    subPath: "rules/flutter/freezed/custom-lint/freezed_lint",
  },
};

const ALL_LINT_PACKAGE_NAMES = new Set([
  BASE_PACKAGE.name,
  ...Object.values(STACK_PACKAGES).map((p) => p.name),
]);

// Match `LintCode('code_name', ...)` first arg across line breaks. Codes are
// lowercase snake_case (e.g. `al_e1_entities_import`).
const LINT_CODE_RE = /LintCode\(\s*['"]([a-z][a-z0-9_]*)['"]/g;

const HELP = `Usage: inject-custom-lint.mjs --pubspec <path> --analysis-options <path> --plugin-root <abs-dir> [--stacks <stacks>] [--strip-stale-from <path>]

Inject architecture_lint (base) + optional stack lint packages into Flutter
project's analysis_options.yaml via the analysis_server_plugin top-level
plugins: section. Each entry gets path: + diagnostics: enable list (codes
auto-extracted from each plugin's lib/src/lints/*.dart).

Options:
  --pubspec <path>           Path to pubspec.yaml (used to strip legacy custom_lint dev dep)
  --analysis-options <path>  Path to analysis_options.yaml (required)
  --plugin-root <abs-dir>    Absolute path to the local kelo checkout (required)
  --stacks <stacks>          Comma-separated convention stacks (optional)
                             Known stacks with lint packages: ${Object.keys(STACK_PACKAGES).join(", ")}
  --strip-stale-from <path>  In workspace mode: normalize a member's analysis_options.yaml —
                             strip its plugins:/analyzer.plugins:, prepend
                             include: <relpath-to-root> if absent. Required so
                             the member inherits the root's plugins:.
                             (dart-lang/sdk#62161)
  -h, --help                 Show this help
`;

function usage(code = 1) {
  (code === 0 ? process.stdout : process.stderr).write(HELP);
  process.exit(code);
}

function parseArgs(argv) {
  const args = {
    pubspec: "",
    analysisOptions: "",
    pluginRoot: "",
    stacks: [],
    stripStaleFrom: "",
  };
  const rest = argv.slice(2);

  while (rest.length > 0) {
    const a = rest.shift();
    switch (a) {
      case "--pubspec":
        if (!rest.length) {
          process.stderr.write("--pubspec requires a value\n");
          usage();
        }
        args.pubspec = rest.shift();
        break;
      case "--analysis-options":
        if (!rest.length) {
          process.stderr.write("--analysis-options requires a value\n");
          usage();
        }
        args.analysisOptions = rest.shift();
        break;
      case "--plugin-root":
        if (!rest.length) {
          process.stderr.write("--plugin-root requires a value\n");
          usage();
        }
        args.pluginRoot = rest.shift();
        break;
      case "--stacks":
        if (!rest.length) {
          process.stderr.write("--stacks requires a value\n");
          usage();
        }
        args.stacks = rest
          .shift()
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      case "--strip-stale-from":
        if (!rest.length) {
          process.stderr.write("--strip-stale-from requires a value\n");
          usage();
        }
        args.stripStaleFrom = rest.shift();
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

  for (const [name, value] of [
    ["--pubspec", args.pubspec],
    ["--analysis-options", args.analysisOptions],
    ["--plugin-root", args.pluginRoot],
  ]) {
    if (!value) {
      process.stderr.write(`Error: ${name} is required\n`);
      usage();
    }
  }

  if (!path.isAbsolute(args.pluginRoot)) {
    process.stderr.write("Error: --plugin-root must be an absolute path\n");
    usage();
  }

  return args;
}

// Scan `<pluginAbsPath>/lib/src/lints/*.dart` for `LintCode('...')` and
// return a sorted, de-duplicated list of code names. The diagnostics: enable
// list in plugins: must contain exactly these codes for rules to fire.
function extractDiagnosticsFor(pluginAbsPath) {
  const lintsDir = path.join(pluginAbsPath, "lib", "src", "lints");
  if (!fs.existsSync(lintsDir) || !fs.statSync(lintsDir).isDirectory()) {
    return [];
  }
  const codes = new Set();
  for (const entry of fs.readdirSync(lintsDir)) {
    if (!entry.endsWith(".dart")) continue;
    const content = fs.readFileSync(path.join(lintsDir, entry), "utf-8");
    for (const m of content.matchAll(LINT_CODE_RE)) {
      codes.add(m[1]);
    }
  }
  return [...codes].sort();
}

const VENDOR_DIR = path.join(".kelo", "plugins");
const VENDOR_MANIFEST = ".kelo-vendor.json";

function listVendorFiles(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listVendorFiles(full, base));
    else if (entry.isFile())
      out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out.sort();
}

// Replace <hostDir>/.kelo/plugins/<name> with a fresh copy of the plugin's
// pubspec.yaml + lib/ and write a sha256 manifest. Returns the relative path
// (posix) to register in plugins:.
function vendorPlugin(srcAbsPath, hostDir, pkg, pluginVersion) {
  const destRel = path.join(VENDOR_DIR, pkg.name);
  const dest = path.join(hostDir, destRel);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  fs.copyFileSync(
    path.join(srcAbsPath, "pubspec.yaml"),
    path.join(dest, "pubspec.yaml"),
  );
  fs.cpSync(path.join(srcAbsPath, "lib"), path.join(dest, "lib"), {
    recursive: true,
  });

  const files = {};
  for (const rel of listVendorFiles(dest)) {
    files[rel] = crypto
      .createHash("sha256")
      .update(fs.readFileSync(path.join(dest, rel)))
      .digest("hex");
  }
  const manifest = {
    $comment:
      "Vendored by kelo — do not edit. Regenerate with /kelo:flutter-sync.",
    package: pkg.name,
    source: `kelo@${pluginVersion}/${pkg.subPath}`,
    files,
  };
  fs.writeFileSync(
    path.join(dest, VENDOR_MANIFEST),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  return destRel.split(path.sep).join("/");
}

function readPluginVersion(pluginRoot) {
  try {
    return JSON.parse(
      fs.readFileSync(
        path.join(pluginRoot, ".claude-plugin", "plugin.json"),
        "utf-8",
      ),
    ).version;
  } catch {
    return "unknown";
  }
}

function buildPluginEntry(relPath, diagnosticCodes) {
  return {
    path: relPath,
    diagnostics: Object.fromEntries(diagnosticCodes.map((c) => [c, true])),
  };
}

function diagnosticsEqual(a, b) {
  if (!a || typeof a !== "object") return false;
  const aKeys = Object.keys(a).sort();
  if (aKeys.length !== b.length) return false;
  for (let i = 0; i < b.length; i++) {
    if (aKeys[i] !== b[i]) return false;
    if (a[aKeys[i]] !== true) return false;
  }
  return true;
}

function nodeToJs(node) {
  if (node == null) return null;
  if (typeof node.toJSON === "function") return node.toJSON();
  return node;
}

function loadOrCreateDoc(filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    const empty = YAML.parseDocument("");
    empty.contents = empty.createNode({});
    return empty;
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  const doc = YAML.parseDocument(raw);
  if (doc.contents === null) {
    doc.contents = doc.createNode({});
  }
  return doc;
}

function writeDoc(filePath, doc) {
  fs.writeFileSync(filePath, String(doc));
}

function resolvePackages(stacks) {
  const packages = [BASE_PACKAGE];
  for (const stack of stacks) {
    const pkg = STACK_PACKAGES[stack];
    if (pkg) packages.push(pkg);
  }
  return packages;
}

// ─── pubspec.yaml — strip legacy lint deps ───
//
// analysis_server_plugin loads plugins from a synthetic package, so the user's
// pubspec.yaml does NOT need any of the lint packages or the legacy custom_lint
// umbrella. Strip them on injection.
function cleanPubspec(pubspecPath) {
  if (!fs.existsSync(pubspecPath) || !fs.statSync(pubspecPath).isFile()) {
    return true;
  }

  const raw = fs.readFileSync(pubspecPath, "utf-8");
  const doc = YAML.parseDocument(raw);
  if (doc.contents === null) return true;

  let changed = false;

  for (const section of ["dependencies", "dev_dependencies"]) {
    const sectionMap = doc.get(section);
    if (!YAML.isMap(sectionMap)) continue;

    if (sectionMap.has(LEGACY_CUSTOM_LINT)) {
      sectionMap.delete(LEGACY_CUSTOM_LINT);
      process.stdout.write(
        `  Removed legacy ${LEGACY_CUSTOM_LINT} from ${section} in ${pubspecPath}\n`,
      );
      changed = true;
    }
    for (const name of ALL_LINT_PACKAGE_NAMES) {
      if (sectionMap.has(name)) {
        sectionMap.delete(name);
        process.stdout.write(
          `  Removed ${name} from ${section} in ${pubspecPath} (now in analysis_options.yaml plugins:)\n`,
        );
        changed = true;
      }
    }
    // Drop the section entirely if it became empty after stripping.
    if (sectionMap.items.length === 0 && changed) {
      doc.delete(section);
    }
  }

  if (changed) writeDoc(pubspecPath, doc);
  return true;
}

// ─── analysis_options.yaml — register plugins under top-level `plugins:` ───
function injectAnalysisOptions(analysisPath, pluginRoot, packages) {
  const doc = loadOrCreateDoc(analysisPath);

  // 1. Strip legacy `analyzer.plugins: [custom_lint]` registration.
  const analyzer = doc.get("analyzer");
  if (YAML.isMap(analyzer)) {
    const legacyPlugins = analyzer.get("plugins");
    if (legacyPlugins != null) {
      analyzer.delete("plugins");
      process.stdout.write(
        `  Removed legacy analyzer.plugins from ${analysisPath}\n`,
      );
    }
    if (analyzer.items.length === 0) {
      doc.delete("analyzer");
    }
  }

  // 2. Build/update top-level `plugins:` section with `path:` deps.
  let pluginsMap = doc.get("plugins");
  if (pluginsMap != null && !YAML.isMap(pluginsMap)) {
    doc.delete("plugins");
    pluginsMap = null;
  }

  let changed = false;
  const hostDir = path.dirname(analysisPath);
  const pluginVersion = readPluginVersion(pluginRoot);

  for (const pkg of packages) {
    const absPath = path.join(pluginRoot, pkg.subPath);
    if (!fs.existsSync(absPath) || !fs.statSync(absPath).isDirectory()) {
      process.stderr.write(`Error: plugin source not found: ${absPath}\n`);
      return false;
    }

    const codes = extractDiagnosticsFor(absPath);
    if (codes.length === 0) {
      process.stderr.write(
        `Error: no LintCode entries found in ${absPath}/lib/src/lints/\n`,
      );
      return false;
    }

    const relPath = vendorPlugin(absPath, hostDir, pkg, pluginVersion);
    process.stdout.write(
      `  Vendored ${pkg.name} → ${path.join(hostDir, relPath)}\n`,
    );

    const current = YAML.isMap(pluginsMap)
      ? nodeToJs(pluginsMap.get(pkg.name))
      : null;
    const desired = buildPluginEntry(relPath, codes);
    const alreadyPinned =
      current &&
      typeof current === "object" &&
      typeof current.path === "string" &&
      current.path === desired.path &&
      current.git === undefined &&
      diagnosticsEqual(current.diagnostics, codes);

    if (alreadyPinned) {
      process.stdout.write(
        `  ${pkg.name} already registered (path: ${relPath}, ${codes.length} diagnostics) in ${analysisPath}\n`,
      );
      continue;
    }

    doc.setIn(["plugins", pkg.name], desired);
    process.stdout.write(
      `  Registered ${pkg.name} (path: ${relPath}, ${codes.length} diagnostics) in ${analysisPath} plugins:\n`,
    );
    changed = true;
  }

  if (changed || doc.get("analyzer")?.get?.("plugins") === undefined) {
    writeDoc(analysisPath, doc);
  }
  return true;
}

// ─── analysis_options.yaml — workspace member normalization ───
//
// In a Dart pub workspace, the analyzer does NOT auto-inherit options from
// the workspace root. Each member must explicitly include the root's options
// to pick up `plugins:` (and other settings) written there. dart-lang/sdk#62161.
//
// This function applies three idempotent fixes to a workspace member's
// analysis_options.yaml:
//   1. Strip our managed `plugins:` entries (single source of truth at root —
//      direct entries in the member also raise `plugins_in_inner_options`).
//   2. Strip legacy `analyzer.plugins: [custom_lint]` registration.
//   3. Prepend `include: <relpath-to-root>` if absent (for a list-form include,
//      prepend it to the list). If the member already has a non-matching
//      scalar include, warn and preserve (chain it manually).
function normalizeWorkspaceMember(memberPath, rootPath) {
  const includeRelOs = path.relative(path.dirname(memberPath), rootPath);
  const includeRel = includeRelOs.split(path.sep).join("/");

  // Read existing content (or empty string).
  let raw = "";
  if (fs.existsSync(memberPath) && fs.statSync(memberPath).isFile()) {
    raw = fs.readFileSync(memberPath, "utf-8");
  }

  let stripped = false;
  let bodyAfterStrip = raw;
  let currentInclude;

  if (raw.trim() !== "") {
    let doc;
    try {
      doc = YAML.parseDocument(raw);
    } catch (e) {
      process.stderr.write(`Error parsing ${memberPath}: ${e.message}\n`);
      return false;
    }

    if (doc.contents !== null) {
      // 1. Strip our managed plugins:
      const plugins = doc.get("plugins");
      if (YAML.isMap(plugins)) {
        for (const name of ALL_LINT_PACKAGE_NAMES) {
          if (plugins.has(name)) {
            plugins.delete(name);
            process.stdout.write(
              `  Stripped misplaced ${name} from ${memberPath} plugins:\n`,
            );
            stripped = true;
          }
        }
        if (plugins.items.length === 0 && stripped) doc.delete("plugins");
      }

      // 2. Strip legacy analyzer.plugins
      const analyzer = doc.get("analyzer");
      if (YAML.isMap(analyzer)) {
        const legacyPlugins = analyzer.get("plugins");
        if (legacyPlugins != null) {
          analyzer.delete("plugins");
          process.stdout.write(
            `  Stripped legacy analyzer.plugins from ${memberPath}\n`,
          );
          stripped = true;
          if (analyzer.items.length === 0) doc.delete("analyzer");
        }
      }

      currentInclude = doc.get("include");
    }

    if (stripped) bodyAfterStrip = String(doc);
  }

  // 3. Decide on include action.
  let finalContent = bodyAfterStrip;
  if (currentInclude === undefined) {
    const includeLine = `include: ${includeRel}\n`;
    finalContent =
      bodyAfterStrip.trim() === ""
        ? includeLine
        : `${includeLine}${bodyAfterStrip}`;
    process.stdout.write(
      `  Prepended include: ${includeRel} to ${memberPath}\n`,
    );
  } else if (typeof currentInclude === "string") {
    if (currentInclude === includeRel) {
      // Idempotent — no announce unless we also stripped.
      if (!stripped) {
        process.stdout.write(
          `  ${memberPath} already includes ${includeRel}\n`,
        );
      }
    } else {
      process.stderr.write(
        `  Warning: ${memberPath} has include: ${currentInclude} ` +
          `(expected ${includeRel}) — preserving existing. ` +
          `The member won't inherit the workspace root's plugins: until ` +
          `the includes are chained (root analysis_options.yaml should ` +
          `include the existing target, or vice versa).\n`,
      );
    }
  } else if (YAML.isSeq(currentInclude)) {
    // 목록 형태 include (예: [<root>, package:kelo_analysis/...]) — root가
    // 없으면 맨 앞에 추가한다.
    const targets = currentInclude.toJSON().map(String);
    if (targets.includes(includeRel)) {
      if (!stripped) {
        process.stdout.write(
          `  ${memberPath} already includes ${includeRel}\n`,
        );
      }
    } else {
      const doc = YAML.parseDocument(bodyAfterStrip);
      doc.get("include").items.unshift(doc.createNode(includeRel));
      finalContent = String(doc);
      process.stdout.write(
        `  Prepended ${includeRel} to include: list in ${memberPath}\n`,
      );
    }
  } else {
    process.stderr.write(
      `  Warning: ${memberPath} has unexpected include: type — ` +
        `skipping include injection\n`,
    );
  }

  if (finalContent !== raw) {
    fs.writeFileSync(memberPath, finalContent);
  }
  return true;
}

// ─── Main ───

function main() {
  const args = parseArgs(process.argv);
  const packages = resolvePackages(args.stacks);

  const stackList = args.stacks.length ? args.stacks.join(", ") : "(none)";
  process.stdout.write(
    `Registering analysis_server_plugin lint packages (stacks: ${stackList})...\n`,
  );

  let ok = true;
  ok = cleanPubspec(path.resolve(args.pubspec)) && ok;
  if (args.stripStaleFrom) {
    ok =
      normalizeWorkspaceMember(
        path.resolve(args.stripStaleFrom),
        path.resolve(args.analysisOptions),
      ) && ok;
  }
  ok =
    injectAnalysisOptions(
      path.resolve(args.analysisOptions),
      args.pluginRoot,
      packages,
    ) && ok;

  if (ok) {
    process.stdout.write("Done.\n");
  } else {
    process.stderr.write("Completed with errors.\n");
  }

  process.exit(ok ? 0 : 1);
}

main();
