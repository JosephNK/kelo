#!/usr/bin/env node
// =============================================================================
// Copies .husky hook templates from rules/<framework>/base/husky/ into
// <output-dir>/.husky/ and makes each hook executable.
//
// Also patches <output-dir>/package.json:
//   - devDependencies: husky (all frameworks) + framework-specific deps
//       flutter: @commitlint/cli, @commitlint/config-conventional
//       nestjs:  lint-staged, @commitlint/cli, @commitlint/config-conventional
//       nextjs:  lint-staged
//   - scripts.prepare = "husky"  (husky v9 auto-installs hooks on `npm install`)
//
// Optional -entry <dir> substitutes {{ENTRY}} placeholders in the copied
// hook files (used by flutter templates to bake the entry directory into
// the pre-commit script).
//
// Flutter in a monorepo (git root ≠ <output-dir>): the monorepo root owns
// .husky/ and commitlint, so instead of creating <output-dir>/.husky the
// pre-commit template is written to <output-dir>/scripts/kelo-pre-commit.sh
// ({{PROJECT}} = path from git root) and the root .husky/pre-commit gets one
// line that calls it. package.json is left untouched.
//
// Usage:
//   gen-husky.mjs <framework> -p <output-dir> [-entry <dir>]
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { setDep } from "./common.mjs";

const HELP = `Usage: gen-husky.mjs <framework> -p <output-dir> [-entry <dir>]

Generates .husky hook files for the given framework and patches package.json
with husky/commitlint/lint-staged devDependencies + scripts.prepare.

Arguments:
  <framework>    Framework name (e.g. nextjs, nestjs, flutter)

Options:
  -p <dir>       Output directory (required)
  -entry <dir>   Substitute {{ENTRY}} in hook files (e.g. -entry app)
  -h, --help     Show this help

Examples:
  ./scripts/gen-husky.mjs nextjs -p ./my-project
  ./scripts/gen-husky.mjs nestjs -p ./my-project
  ./scripts/gen-husky.mjs flutter -p ./my-project -entry app
`;

// Pinned versions aligned to the bin/CLI shape used by the husky hook templates.
// Bump these in one place when upgrading across downstream projects.
const HUSKY_VERSION = "^9.1.7";
const LINT_STAGED_VERSION = "^17.0.5";
const COMMITLINT_CLI_VERSION = "^21.0.1";
const COMMITLINT_CONFIG_CONVENTIONAL_VERSION = "^21.0.1";

// Framework → devDeps required by the generated hooks.
// `husky` itself is added for every framework (needed by `prepare`).
const FRAMEWORK_DEPS = {
  flutter: {
    "@commitlint/cli": COMMITLINT_CLI_VERSION,
    "@commitlint/config-conventional": COMMITLINT_CONFIG_CONVENTIONAL_VERSION,
  },
  nestjs: {
    "lint-staged": LINT_STAGED_VERSION,
    "@commitlint/cli": COMMITLINT_CLI_VERSION,
    "@commitlint/config-conventional": COMMITLINT_CONFIG_CONVENTIONAL_VERSION,
  },
  nextjs: {
    "lint-staged": LINT_STAGED_VERSION,
    "@commitlint/cli": COMMITLINT_CLI_VERSION,
    "@commitlint/config-conventional": COMMITLINT_CONFIG_CONVENTIONAL_VERSION,
  },
};

function usage(code = 1) {
  (code === 0 ? process.stdout : process.stderr).write(HELP);
  process.exit(code);
}

function parseArgs(argv) {
  const args = { framework: "", outputDir: "", entry: "" };
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
      case "-entry":
        if (!rest.length) {
          process.stderr.write("-entry requires a directory\n");
          usage();
        }
        args.entry = rest.shift();
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

function renderHook(content, entry, project) {
  if (entry) content = content.replaceAll("{{ENTRY}}", entry);
  return content.replaceAll("{{PROJECT}}", project);
}

// <outputDir>가 git 저장소 루트가 아니면 루트 기준 상대 경로(예: "apps/app"), 아니면 "".
function projectPathFromGitRoot(outputDir) {
  try {
    const top = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: outputDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const rel = path.relative(
      fs.realpathSync(top),
      fs.realpathSync(path.resolve(outputDir)),
    );
    return {
      gitRoot: top,
      rel: rel === "" ? "" : rel.split(path.sep).join("/"),
    };
  } catch {
    return { gitRoot: "", rel: "" };
  }
}

// 모노레포 Flutter: 앱 안에 검사 스크립트를 두고 루트 .husky/pre-commit이 부르게 한다.
function wireMonorepoFlutter(huskySrc, outputDir, entry, gitRoot, rel) {
  const scriptRel = `${rel}/scripts/kelo-pre-commit.sh`;
  const scriptPath = path.join(outputDir, "scripts", "kelo-pre-commit.sh");
  fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
  const tpl = fs.readFileSync(path.join(huskySrc, "pre-commit"), "utf8");
  fs.writeFileSync(scriptPath, renderHook(tpl, entry, `${rel}/`));
  fs.chmodSync(scriptPath, 0o755);
  process.stdout.write(`Generated: ${scriptPath}\n`);

  const rootHook = path.join(gitRoot, ".husky", "pre-commit");
  const call = `bash ${scriptRel}`;
  if (!fs.existsSync(rootHook)) {
    process.stdout.write(
      `  Note:      ${rootHook} 없음 — 모노레포 루트 husky에 다음 줄을 추가하세요: ${call}\n`,
    );
    return;
  }
  const hook = fs.readFileSync(rootHook, "utf8");
  if (hook.includes(scriptRel)) {
    process.stdout.write(
      `  Unchanged: ${rootHook} (${scriptRel} already called)\n`,
    );
    return;
  }
  const block = `\n# kelo: ${rel} Flutter 검사 (gen-husky가 추가 — 해당 경로에 staged 파일이 없으면 바로 끝남)\n${call}\n`;
  fs.writeFileSync(rootHook, hook.replace(/\n*$/, "\n") + block);
  process.stdout.write(`  Appended:  ${rootHook} → ${call}\n`);
}

function copyHooks(huskySrc, huskyDest, entry) {
  fs.mkdirSync(huskyDest, { recursive: true });

  // Sort for stable, bash-glob-like iteration.
  const entries = fs.readdirSync(huskySrc).sort();

  for (const hookName of entries) {
    const src = path.join(huskySrc, hookName);
    if (!fs.statSync(src).isFile()) continue;

    const dest = path.join(huskyDest, hookName);
    const content = renderHook(fs.readFileSync(src, "utf8"), entry, "");
    fs.writeFileSync(dest, content);
    fs.chmodSync(dest, 0o755);
    process.stdout.write(`Generated: ${dest}\n`);
  }
}

// Patch <outputDir>/package.json with husky/commitlint/lint-staged devDeps
// and ensure `scripts.prepare = "husky"`.
//
// Requires package.json to already exist (downstream init command is expected
// to bootstrap it via `npm init -y` / `pnpm init` / etc.). Fails loudly so
// the caller doesn't ship a silently-broken husky install.
function patchPackageJson(outputDir, framework) {
  const pkgPath = path.join(outputDir, "package.json");
  if (!fs.existsSync(pkgPath)) {
    process.stderr.write(
      `Error: package.json not found at ${pkgPath}\n` +
        "Hint: create it first (e.g., `npm init -y` / `pnpm init`) before " +
        "running gen-husky.mjs.\n",
    );
    process.exit(1);
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const changes = [];

  // ── devDependencies ───────────────────────────────────────────────────────
  const dev = pkg.devDependencies || {};
  changes.push(setDep(dev, "husky", HUSKY_VERSION));
  const extraDeps = FRAMEWORK_DEPS[framework] || {};
  for (const [name, version] of Object.entries(extraDeps)) {
    changes.push(setDep(dev, name, version));
  }
  const sortedDev = {};
  for (const k of Object.keys(dev).sort()) sortedDev[k] = dev[k];
  pkg.devDependencies = sortedDev;

  // ── scripts.prepare ───────────────────────────────────────────────────────
  // husky v9 initializes hooks when the `prepare` lifecycle script runs
  // `husky` with no args (npm/pnpm/yarn all run `prepare` after install).
  const scripts = pkg.scripts || {};
  const prevPrepare = scripts.prepare;
  let prepareNote;
  if (!prevPrepare) {
    scripts.prepare = "husky";
    prepareNote = "  Added:     scripts.prepare -> husky";
  } else if (prevPrepare === "husky") {
    prepareNote = "  Unchanged: scripts.prepare (husky)";
  } else {
    // User already has a prepare script — don't clobber. husky v9 is tolerant
    // of being invoked from any prepare chain, so leave composition to the
    // downstream project owner.
    prepareNote = `  Skipped:   scripts.prepare (already set: "${prevPrepare}")`;
  }
  pkg.scripts = scripts;

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

  for (const line of changes) process.stdout.write(line + "\n");
  process.stdout.write(prepareNote + "\n");
  process.stdout.write(`Patched:   ${pkgPath}\n`);
}

function main() {
  const args = parseArgs(process.argv);

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const pluginRoot = path.resolve(scriptDir, "..");
  const huskySrc = path.join(
    pluginRoot,
    "rules",
    args.framework,
    "base",
    "husky",
  );

  if (!fs.existsSync(huskySrc) || !fs.statSync(huskySrc).isDirectory()) {
    process.stderr.write(`Error: Husky templates not found: ${huskySrc}\n`);
    process.exit(1);
  }

  if (args.framework === "flutter") {
    const { gitRoot, rel } = projectPathFromGitRoot(args.outputDir);
    if (rel) {
      process.stdout.write(
        `Monorepo detected (${rel} under ${gitRoot}) — root .husky / package.json are left to the monorepo.\n`,
      );
      wireMonorepoFlutter(huskySrc, args.outputDir, args.entry, gitRoot, rel);
      return;
    }
  }

  // Fail-fast: verify package.json exists before writing any hook files so
  // a partial failure doesn't leave orphan `.husky/` artifacts behind.
  const pkgPath = path.join(args.outputDir, "package.json");
  if (!fs.existsSync(pkgPath)) {
    process.stderr.write(
      `Error: package.json not found at ${pkgPath}\n` +
        "Hint: create it first (e.g., `npm init -y` / `pnpm init`) before " +
        "running gen-husky.mjs.\n",
    );
    process.exit(1);
  }

  const huskyDest = path.join(args.outputDir, ".husky");
  copyHooks(huskySrc, huskyDest, args.entry);

  patchPackageJson(args.outputDir, args.framework);
}

main();
