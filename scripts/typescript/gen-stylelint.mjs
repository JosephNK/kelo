#!/usr/bin/env node
// =============================================================================
// Writes <output-dir>/stylelint.config.mjs (kelo-managed, always overwritten)
// that re-exports the preset from the framework config package
// (`eslint-config-kelo-<framework>/stylelint`, source:
// rules/<framework>/base/stylelint.preset.mjs) and patches
// <output-dir>/package.json:
//   - devDependencies: stylelint, stylelint-config-standard,
//     stylelint-declaration-strict-value, eslint-config-kelo-<framework>
//   - scripts.lint:css
//   - lint-staged glob for CSS files
//
// Usage:
//   gen-stylelint.mjs <framework> -p <output-dir>
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { keloPackageSpec, patchLintStaged, setDep } from "../common.mjs";

const HELP = `Usage: gen-stylelint.mjs <framework> -p <output-dir>

Writes <output-dir>/stylelint.config.mjs (re-exports the kelo preset) and
patches <output-dir>/package.json with:
  - devDependencies: stylelint, stylelint-config-standard, eslint-config-kelo-<framework>
  - scripts.lint:css
  - lint-staged glob for CSS files

Arguments:
  <framework>    Framework name (e.g. nextjs)

Options:
  -p <dir>       Output directory (required)
  -h, --help     Show this help

Examples:
  ./scripts/typescript/gen-stylelint.mjs nextjs -p ./my-project
`;

function usage(code = 1) {
  (code === 0 ? process.stdout : process.stderr).write(HELP);
  process.exit(code);
}

function parseArgs(argv) {
  const args = { framework: "", outputDir: "" };
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
        args.outputDir = rest.shift();
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
  if (!args.outputDir) {
    process.stderr.write("Error: -p <output-dir> is required\n");
    usage();
  }

  return args;
}

function main() {
  const args = parseArgs(process.argv);

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const pluginRoot = path.resolve(scriptDir, "..", "..");
  const rulesDir = path.join(pluginRoot, "rules", args.framework);
  const preset = path.join(rulesDir, "base", "stylelint.preset.mjs");
  const pkgJsonPath = path.join(rulesDir, "package.json");

  if (!fs.existsSync(preset) || !fs.existsSync(pkgJsonPath)) {
    process.stderr.write(
      `Error: Stylelint preset not found for '${args.framework}' (${preset})\n`,
    );
    process.exit(1);
  }
  const configPkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));

  // stylelint.config.mjs — kelo-managed, 매번 덮어쓴다.
  fs.mkdirSync(args.outputDir, { recursive: true });
  const outputFile = path.join(args.outputDir, "stylelint.config.mjs");
  fs.writeFileSync(
    outputFile,
    `// GENERATED FILE - DO NOT MODIFY BY HAND
// Managed by kelo (overwritten by /kelo:${args.framework}-init and -sync).
// Rules: ${configPkg.name}/stylelint

export { default } from "${configPkg.name}/stylelint";
`,
  );
  process.stdout.write(`Generated: ${outputFile}\n`);

  const userPkgPath = path.join(args.outputDir, "package.json");
  if (!fs.existsSync(userPkgPath)) {
    process.stderr.write(`Error: package.json not found at ${userPkgPath}\n`);
    process.stderr.write(
      "Hint: run gen-eslint.mjs first (which ensures package.json exists).\n",
    );
    process.exit(1);
  }

  const pkg = JSON.parse(fs.readFileSync(userPkgPath, "utf8"));

  // ── devDependencies ─────────────────────────────────────────────────────
  const dev = pkg.devDependencies || {};
  const devChanges = [];
  // stylelint 17.x (Node 18+) — stylelint-config-standard 40.x is 17-compatible.
  devChanges.push(setDep(dev, "stylelint", "^17.11.1"));
  devChanges.push(setDep(dev, "stylelint-config-standard", "^40.0.0"));
  // Enforces token usage (stylelint.rules.mjs uses scale-unlimited/declaration-strict-value).
  // v1.11+ requires `ignoreFunctions: boolean` and string `message` (see stylelint.rules.mjs).
  devChanges.push(setDep(dev, "stylelint-declaration-strict-value", "^1.11.1"));
  // gen-eslint.mjs already pins the config package; re-sync here for idempotency.
  devChanges.push(
    setDep(
      dev,
      configPkg.name,
      keloPackageSpec(configPkg.name, configPkg.version),
    ),
  );
  if ("@jkit/code-plugin" in dev) {
    devChanges.push(
      `  Removed:   @jkit/code-plugin (${dev["@jkit/code-plugin"]}) — replaced by ${configPkg.name}`,
    );
    delete dev["@jkit/code-plugin"];
  }

  const sortedDev = {};
  for (const k of Object.keys(dev).sort()) sortedDev[k] = dev[k];
  pkg.devDependencies = sortedDev;

  // ── scripts.lint:css ────────────────────────────────────────────────────
  const scripts = pkg.scripts || {};
  const cssGlob = "**/*.{css,scss}";
  const cssCmd = `stylelint "${cssGlob}" --fix`;
  let scriptNote;
  if (!("lint:css" in scripts)) {
    scripts["lint:css"] = cssCmd;
    scriptNote = `  Added:     scripts.lint:css`;
  } else {
    scriptNote = `  Unchanged: scripts.lint:css (already defined)`;
  }
  pkg.scripts = scripts;

  // ── lint-staged ─────────────────────────────────────────────────────────
  const lintStaged = pkg["lint-staged"] || {};
  const lintGlob = "*.{css,scss}";
  const lintCmd = "stylelint --fix";
  const lsNote = patchLintStaged(lintStaged, lintGlob, lintCmd, "stylelint");
  pkg["lint-staged"] = lintStaged;

  fs.writeFileSync(userPkgPath, JSON.stringify(pkg, null, 2) + "\n");

  for (const line of devChanges) process.stdout.write(line + "\n");
  process.stdout.write(scriptNote + "\n");
  process.stdout.write(lsNote + "\n");

  process.stdout.write("\n");
  process.stdout.write(
    `Next step: run your package manager install in ${args.outputDir}\n`,
  );
}

main();
