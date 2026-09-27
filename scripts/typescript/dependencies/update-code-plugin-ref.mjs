#!/usr/bin/env node
// =============================================================================
// Updates the version of the kelo ESLint config packages
// (eslint-config-kelo-nextjs, eslint-config-kelo-nestjs) across all
// package.json files in the target project. Legacy `@jkit/code-plugin` git
// dependencies are reported (not rewritten) — they need /kelo:<framework>-sync
// because eslint.config.mjs must be regenerated too.
//
// Usage:
//   update-code-plugin-ref.mjs [<ref>] --project-dir <dir> [--dry-run]
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { keloPackageSpec } from "../../common.mjs";

const PACKAGE_NAMES = [
  "eslint-config-kelo-nextjs",
  "eslint-config-kelo-nestjs",
];
const LEGACY_PACKAGE = "@jkit/code-plugin";
const SKIP_DIR_NAMES = new Set([
  "node_modules",
  "build",
  "dist",
  ".next",
  ".turbo",
  ".cache",
]);

const HELP = `Usage: update-code-plugin-ref.mjs [<ref>] --project-dir <dir> [--dry-run]

Updates eslint-config-kelo-{nextjs,nestjs} to the GitHub Release tarball
URL of <version> across all package.json files. Legacy @jkit/code-plugin git deps are reported only.

Arguments:
  <ref>                  Optional version (e.g. 0.3.80, v0.3.80).
                         If omitted, uses version from .claude-plugin/plugin.json.

Options:
  --project-dir <dir>    Project root directory (required)
  --dry-run              Preview changes without modifying files
  -h, --help             Show this help
`;

function usage(code = 1) {
  (code === 0 ? process.stdout : process.stderr).write(HELP);
  process.exit(code);
}

function parseArgs(argv) {
  const args = { ref: null, projectDir: "", dryRun: false };
  const rest = argv.slice(2);

  while (rest.length > 0) {
    const a = rest.shift();
    switch (a) {
      case "--project-dir":
        if (!rest.length) {
          process.stderr.write("--project-dir requires a directory\n");
          usage();
        }
        args.projectDir = rest.shift();
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "-h":
      case "--help":
        usage(0);
        break;
      default:
        if (a.startsWith("-")) {
          process.stderr.write(`Unknown option: ${a}\n`);
          usage();
        }
        if (args.ref !== null) {
          process.stderr.write(`Unexpected argument: ${a}\n`);
          usage();
        }
        args.ref = a;
    }
  }

  if (!args.projectDir) {
    process.stderr.write("Error: --project-dir <dir> is required\n");
    usage();
  }

  return args;
}

function normalizeRef(ref) {
  const version = ref.startsWith("v") ? ref.slice(1) : ref;
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
    process.stderr.write(
      `Error: '${ref}'는 semver 버전이 아닙니다 (예: 0.3.80). git ref(main 등)는 더 이상 지원하지 않습니다.\n`,
    );
    process.exit(1);
  }
  return version;
}

function resolvePluginVersion() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const pluginRoot = path.resolve(scriptDir, "..", "..", "..");
  const pluginJson = path.join(pluginRoot, ".claude-plugin", "plugin.json");

  if (!fs.existsSync(pluginJson) || !fs.statSync(pluginJson).isFile()) {
    process.stderr.write(`plugin.json을 찾을 수 없습니다: ${pluginJson}\n`);
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(pluginJson, "utf-8"));
  } catch (exc) {
    process.stderr.write(`plugin.json 파싱 실패: ${exc.message}\n`);
    process.exit(1);
  }

  const version = data.version;
  if (typeof version !== "string" || !version) {
    process.stderr.write("plugin.json의 version 필드가 비어 있습니다.\n");
    process.exit(1);
  }
  return normalizeRef(version);
}

function findPackageJsons(projectRoot) {
  const results = [];
  walk(projectRoot);
  return results.sort();

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIR_NAMES.has(entry.name)) continue;
        if (entry.name.startsWith(".") && entry.name !== ".") continue;
        walk(full);
      } else if (entry.isFile() && entry.name === "package.json") {
        results.push(full);
      }
    }
  }
}

function updateSection(section, version) {
  const results = [];
  for (const name of PACKAGE_NAMES) {
    if (!(name in section)) continue;
    const old = section[name];
    const newValue = keloPackageSpec(name, version);
    if (old === newValue) {
      results.push({ changed: false, oldValue: old, newValue });
    } else {
      section[name] = newValue;
      results.push({ changed: true, oldValue: old, newValue });
    }
  }
  return results;
}

function detectIndent(raw) {
  const match = raw.match(/\n( +)"/);
  if (!match) return 2;
  return match[1].length;
}

function updatePackageJson(pkgPath, newRef, dryRun) {
  const raw = fs.readFileSync(pkgPath, "utf-8");
  let data;
  try {
    data = JSON.parse(raw);
  } catch (exc) {
    process.stdout.write(`  ⚠️  ${pkgPath}: JSON 파싱 실패 (${exc.message})\n`);
    return false;
  }

  let newValue = null;
  let changedAny = false;
  const oldValues = [];

  for (const key of ["dependencies", "devDependencies", "peerDependencies"]) {
    const section = data[key];
    if (!section || typeof section !== "object" || Array.isArray(section)) {
      continue;
    }
    if (LEGACY_PACKAGE in section) {
      process.stdout.write(
        `  ⚠️  ${pkgPath}: 레거시 ${LEGACY_PACKAGE} (${section[LEGACY_PACKAGE]}) — /kelo:<framework>-sync 로 패키지 방식 전환 필요\n`,
      );
    }
    for (const r of updateSection(section, newRef)) {
      const { changed, oldValue } = r;
      newValue = r.newValue;
      oldValues.push(oldValue);
      if (changed) changedAny = true;
    }
  }

  if (!changedAny) {
    if (oldValues.length > 0) {
      process.stdout.write(
        `  ⏭️  ${pkgPath}: 이미 동일한 버전 (${oldValues[0]})\n`,
      );
    }
    return false;
  }

  const oldRepr = oldValues.length > 0 ? oldValues[0] : "(none)";
  if (dryRun) {
    process.stdout.write(
      `  🔍 ${pkgPath}: ${oldRepr} → ${newValue} (dry-run)\n`,
    );
  } else {
    const indent = detectIndent(raw);
    const trailingNewline = raw.endsWith("\n") ? "\n" : "";
    fs.writeFileSync(
      pkgPath,
      JSON.stringify(data, null, indent) + trailingNewline,
      "utf-8",
    );
    process.stdout.write(`  ✅ ${pkgPath}: ${oldRepr} → ${newValue}\n`);
  }

  return true;
}

function main() {
  const args = parseArgs(process.argv);

  let ref;
  let refSource;
  if (args.ref === null) {
    ref = resolvePluginVersion();
    refSource = "plugin.json 자동 감지";
  } else {
    ref = normalizeRef(args.ref);
    refSource = "CLI 인자";
  }
  const projectRoot = path.resolve(args.projectDir);

  process.stdout.write(`프로젝트 루트: ${projectRoot}\n`);
  process.stdout.write(
    `새 버전: v${ref} — GitHub Release tarball (${refSource})\n`,
  );
  if (args.dryRun) {
    process.stdout.write("(dry-run 모드)\n");
  }
  process.stdout.write("\n");

  const pkgFiles = findPackageJsons(projectRoot);
  process.stdout.write(`발견된 package.json: ${pkgFiles.length}개\n\n`);

  let updated = 0;
  for (const pkg of pkgFiles) {
    if (updatePackageJson(pkg, ref, args.dryRun)) {
      updated += 1;
    }
  }

  process.stdout.write("\n");
  if (updated === 0) {
    process.stdout.write("변경된 파일이 없습니다.\n");
  } else {
    const action = args.dryRun ? "변경 예정" : "업데이트 완료";
    process.stdout.write(`${updated}개 파일 ${action}\n`);
    if (!args.dryRun) {
      process.stdout.write("\n");
      process.stdout.write(
        "Next step: 의존성 재설치가 필요하면 'npm install' (또는 'pnpm install' / 'yarn install')을 실행하세요.\n",
      );
    }
  }
}

main();
