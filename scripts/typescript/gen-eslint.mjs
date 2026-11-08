#!/usr/bin/env node
// =============================================================================
// Wires a Next.js / NestJS project to the kelo ESLint shareable config package
// (`eslint-config-kelo-<framework>`, source: rules/<framework>/).
//
// Writes into <output-dir>:
//   - eslint.config.mjs          (kelo-managed, always overwritten) — a few lines
//                                that call the package factory
//   - kelo.lint.json             (project-owned) — created as `{}` only when
//                                absent
//   - eslint.project.config.mjs  (user-owned) — stub created only when absent;
//                                may ADD rules, may not change kelo rules (the
//                                factory throws)
//
// Also patches the user's package.json:
//   - devDependencies: `eslint-config-kelo-<framework>` → GitHub Release
//     tarball URL of v<version> (rules/<framework>/package.json)
//   - lint-staged: `*.{ts,tsx,js,jsx,mjs}` runs `kelo-lint-<framework> --fix`
//     (legacy `eslint --fix` entries are replaced)
//   - scripts.lint: `kelo-lint-<framework>` — the single lint entry point
//     (ignores eslint.config.mjs edits). Existing `eslint …` values of
//     `lint` / `lint:ci` / `lint:fix` are replaced (`lint:fix` gets `--fix`);
//     move path arguments such as `--ignore-pattern` to kelo.lint.json
//     `ignores`.
//
// Usage:
//   gen-eslint.mjs <framework> -p <output-dir>
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { keloPackageSpec, patchLintStaged, pyReprStr } from "../common.mjs";

const HELP = `Usage: gen-eslint.mjs <framework> -p <output-dir>

Arguments:
  <framework>    Framework name (nextjs, nestjs)

Options:
  -p <dir>       Output directory (required)
  -h, --help     Show this help

Examples:
  ./scripts/typescript/gen-eslint.mjs nextjs -p ./my-project
  ./scripts/typescript/gen-eslint.mjs nestjs -p ./my-project
`;

const LINT_CONFIG_FILE = "kelo.lint.json";

function usage(code = 1) {
  (code === 0 ? process.stdout : process.stderr).write(HELP);
  process.exit(code);
}

// 생성물 — 매 init/sync마다 덮어쓴다. 규칙과 조립 로직은 패키지 안에 있다.
function renderEslintConfig(pkgName, factory) {
  return `// GENERATED FILE - DO NOT MODIFY BY HAND
// Managed by kelo (overwritten by /kelo:setup).
// Rules: ${pkgName} | Project extensions: kelo.lint.json | Project rules: eslint.project.config.mjs

import { ${factory} } from "${pkgName}";

import projectConfig from "./eslint.project.config.mjs";

export default ${factory}({ root: import.meta.dirname, project: projectConfig });
`;
}

// 사용자 소유 파일의 초기 스텁. init에서 없을 때만 생성하고, sync는 보존한다.
const PROJECT_CONFIG_STUB = `// Project-specific ESLint rules (user-owned — created once, never overwritten by /kelo:setup).
// Allowed: new rules/plugins. Redefining kelo rules/settings, linterOptions, or
// global ignores fails at load time — use kelo.lint.json \`ignores\` for exclusions.
// Install any plugin you import here as a devDependency of this project.

// import groupDepPlugin from "eslint-plugin-import";

/** @type {import('eslint').Linter.Config[]} */
const projectConfig = [
  // Example: block dependencies between bounded contexts (uncomment the import above)
  // {
  //   files: ["src/**/*.ts"],
  //   ignores: ["**/*.spec.ts"],
  //   plugins: { groupdep: groupDepPlugin },
  //   rules: {
  //     "groupdep/no-restricted-paths": ["error", {
  //       zones: [
  //         {
  //           target: "./src/modules/forwarder",
  //           from: "./src/modules/consumer",
  //           message: "forwarder must not depend on consumer.",
  //         },
  //       ],
  //     }],
  //   },
  // },
];

export default projectConfig;
`;

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

function writeLintConfig(outputDir) {
  const file = path.join(outputDir, LINT_CONFIG_FILE);
  if (fs.existsSync(file)) {
    process.stdout.write(`  Preserved: ${file} (project-owned)\n`);
    return;
  }
  fs.writeFileSync(file, "{}\n");
  process.stdout.write(`  Created:   ${file} (project-owned)\n`);
}

// lint-staged의 레거시 `eslint --fix`를 모든 glob에서 CLI로 교체하고,
// 기본 TS/JS glob에 CLI가 없으면 추가한다. (프로젝트가 `*.ts`, `*.{ts,tsx}` 등
// 다른 glob에 eslint를 걸어 둔 경우도 kelo 규칙으로 검사되게 한다.)
function patchLintStagedCommand(lintStaged, glob, cmd) {
  const legacy = "eslint --fix";
  const notes = [];
  for (const [key, value] of Object.entries(lintStaged)) {
    if (value === legacy) {
      lintStaged[key] = cmd;
    } else if (Array.isArray(value) && value.includes(legacy)) {
      lintStaged[key] = value.map((c) => (c === legacy ? cmd : c));
    } else {
      continue;
    }
    notes.push(
      `  Replaced:  lint-staged[${pyReprStr(key)}] ${legacy} → ${cmd}`,
    );
  }
  notes.push(patchLintStaged(lintStaged, glob, cmd, cmd.split(" ")[0]));
  return notes.join("\n");
}

function main() {
  const args = parseArgs(process.argv);

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const pluginRoot = path.resolve(scriptDir, "..", "..");
  const rulesDir = path.join(pluginRoot, "rules", args.framework);
  const pkgJsonPath = path.join(rulesDir, "package.json");

  if (!fs.existsSync(pkgJsonPath)) {
    process.stderr.write(
      `Error: No ESLint config package for '${args.framework}' (${pkgJsonPath} not found)\n`,
    );
    process.exit(1);
  }
  const configPkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
  const factory = args.framework;
  const cliName = `kelo-lint-${args.framework}`;

  const userPkgPath = path.join(args.outputDir, "package.json");
  if (!fs.existsSync(userPkgPath)) {
    process.stderr.write(`Error: package.json not found at ${userPkgPath}\n`);
    process.stderr.write(
      "Hint: run 'npm init -y' in the project root first.\n",
    );
    process.exit(1);
  }

  // ── eslint.config.mjs (kelo-managed) ──────────────────────────────────────
  fs.mkdirSync(args.outputDir, { recursive: true });
  const outputFile = path.join(args.outputDir, "eslint.config.mjs");
  fs.writeFileSync(outputFile, renderEslintConfig(configPkg.name, factory));
  process.stdout.write(`Generated: ${outputFile}\n`);

  // ── kelo.lint.json (project-owned; created when absent) ─────────────────
  writeLintConfig(args.outputDir);

  // ── eslint.project.config.mjs (user-owned, preserved on sync) ────────────
  const projectConfigFile = path.join(
    args.outputDir,
    "eslint.project.config.mjs",
  );
  if (fs.existsSync(projectConfigFile)) {
    process.stdout.write(`  Preserved: ${projectConfigFile} (user-owned)\n`);
  } else {
    fs.writeFileSync(projectConfigFile, PROJECT_CONFIG_STUB);
    process.stdout.write(`  Created:   ${projectConfigFile} (user-owned)\n`);
  }

  // ── package.json ─────────────────────────────────────────────────────────
  const pkg = JSON.parse(fs.readFileSync(userPkgPath, "utf8"));
  const dev = pkg.devDependencies || {};
  const notes = [];

  const depSpec = keloPackageSpec(configPkg.name, configPkg.version);
  const old = dev[configPkg.name];
  dev[configPkg.name] = depSpec;
  if (old === depSpec) {
    notes.push(`  Unchanged: ${configPkg.name} (${depSpec})`);
  } else if (old) {
    notes.push(`  Updated:   ${configPkg.name} ${old} → ${depSpec}`);
  } else {
    notes.push(`  Added:     ${configPkg.name} → ${depSpec}`);
  }

  // Next.js 16+ baseline: eslint-config-next가 typescript-eslint(unified meta)를
  // transitive로 가져오므로 top-level에 명시되어 있으면 @typescript-eslint 플러그인이
  // 두 인스턴스로 등록되어 flat config가 거부한다. 항목이 있으면 제거한다.
  if (args.framework === "nextjs" && "typescript-eslint" in dev) {
    notes.push(
      `  Removed:   typescript-eslint (${dev["typescript-eslint"]}) — pulled transitively via eslint-config-next; explicit top-level entry causes plugin duplicate registration`,
    );
    delete dev["typescript-eslint"];
  }

  const sortedDev = {};
  for (const k of Object.keys(dev).sort()) sortedDev[k] = dev[k];
  pkg.devDependencies = sortedDev;

  // lint-staged: 커밋 시 프로젝트 eslint.config.mjs가 아니라 kelo CLI로 검사
  const lintStaged = pkg["lint-staged"] || {};
  notes.push(
    patchLintStagedCommand(
      lintStaged,
      "*.{ts,tsx,js,jsx,mjs}",
      `${cliName} --fix`,
    ),
  );
  pkg["lint-staged"] = lintStaged;

  // scripts.lint — 단일 lint 진입점. 개발자·CI·nx가 모두 kelo CLI를 타도록
  // eslint 기반 lint 스크립트를 교체한다 (에디터 실시간 표시는 eslint.config.mjs 담당).
  const scripts = pkg.scripts || {};
  const desired = {
    lint: cliName,
    "lint:ci": cliName,
    "lint:fix": `${cliName} --fix`,
  };
  for (const [name, cmd] of Object.entries(desired)) {
    const old = scripts[name];
    if (old === cmd) continue;
    if (typeof old === "string" && old.startsWith(cliName)) continue;
    if (name === "lint" && old === undefined) {
      scripts[name] = cmd;
      notes.push(`  Set:       scripts.lint → ${cmd}`);
    } else if (typeof old === "string" && /^eslint(\s|$)/.test(old)) {
      // 첫 eslint 명령만 교체하고 뒤에 이어진 명령(`&& tsc --noEmit` 등)은 보존한다
      const chainAt = old.search(/\s*(&&|\|\||;)/);
      const eslintPart = chainAt === -1 ? old : old.slice(0, chainAt);
      const rest = chainAt === -1 ? "" : old.slice(chainAt);
      // 기존 명령이 --fix였다면 자동 수정 동작을 유지한다 (nest new 기본 lint 등)
      const replaced =
        /(^|\s)--fix(\s|$)/.test(eslintPart) && !cmd.endsWith("--fix")
          ? `${cmd} --fix`
          : cmd;
      const next = replaced + rest;
      if (old === next) continue;
      scripts[name] = next;
      notes.push(`  Replaced:  scripts.${name} "${old}" → ${next}`);
      if (/--ignore-pattern|\s[^-\s][^\s]*\//.test(eslintPart)) {
        notes.push(
          `             ↳ 경로/ignore 인자는 kelo.lint.json "ignores"로 옮기세요 (이전: ${old})`,
        );
      }
    } else if (name === "lint" && old !== undefined) {
      notes.push(
        `  Kept:      scripts.lint "${old}" (eslint 명령이 아님 — 확인 필요)`,
      );
    }
  }
  pkg.scripts = scripts;

  fs.writeFileSync(userPkgPath, JSON.stringify(pkg, null, 2) + "\n");
  for (const n of notes) process.stdout.write(n + "\n");

  process.stdout.write("\n");
  process.stdout.write(`Next step: run 'npm install' in ${args.outputDir}\n`);
}

main();
