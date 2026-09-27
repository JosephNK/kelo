#!/usr/bin/env node
// =============================================================================
// Wires a Next.js / NestJS project to the kelo ESLint shareable config package
// (`eslint-config-kelo-<framework>`, source: rules/<framework>/).
//
// Writes into <output-dir>:
//   - eslint.config.mjs          (kelo-managed, always overwritten) — a few lines
//                                that call the package factory
//   - kelo.lint.json             (kelo-managed) — `stacks` is rewritten from
//                                --with; other keys (boundaryElements,
//                                boundaryRules, boundaryIgnores, ignores) are
//                                preserved
//   - eslint.project.config.mjs  (user-owned) — stub created only when absent;
//                                may ADD rules, may not change kelo rules (the
//                                factory throws)
//
// Also patches the user's package.json:
//   - devDependencies: `eslint-config-kelo-<framework>` → GitHub Release
//     tarball URL of v<version> (rules/<framework>/package.json); removes the legacy
//     `@jkit/code-plugin` git dependency
//   - lint-staged: `*.{ts,tsx,js,jsx,mjs}` runs `kelo-lint-<framework> --fix`
//     (legacy `eslint --fix` entries are replaced)
//   - scripts.lint: `kelo-lint-<framework>` — the single lint entry point
//     (ignores eslint.config.mjs edits). Existing `eslint …` values of
//     `lint` / `lint:ci` / `lint:fix` are replaced (`lint:fix` gets `--fix`);
//     move path arguments such as `--ignore-pattern` to kelo.lint.json
//     `ignores`. A legacy `lint:jkit` script is removed.
//
// Usage:
//   gen-eslint.mjs <framework> -p <output-dir> [--with stack1,stack2,...]
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { keloPackageSpec, patchLintStaged, pyReprStr } from "../common.mjs";

const HELP = `Usage: gen-eslint.mjs <framework> -p <output-dir> [--with stack1,stack2,...]

Arguments:
  <framework>    Framework name (nextjs, nestjs)

Options:
  -p <dir>       Output directory (required)
  --with <list>  Comma-separated stacks (e.g. design-system/mantine,nextauth,tanstack-query)
  -h, --help     Show this help

Examples:
  ./scripts/typescript/gen-eslint.mjs nextjs -p ./my-project --with design-system/mantine,nextauth,tanstack-query
  ./scripts/typescript/gen-eslint.mjs nestjs -p ./my-project --with typeorm
`;

const LEGACY_PACKAGE = "@jkit/code-plugin";
const LINT_CONFIG_FILE = "kelo.lint.json";

function usage(code = 1) {
  (code === 0 ? process.stdout : process.stderr).write(HELP);
  process.exit(code);
}

// 생성물 — 매 init/sync마다 덮어쓴다. 규칙과 조립 로직은 패키지 안에 있다.
function renderEslintConfig(pkgName, factory) {
  return `// GENERATED FILE - DO NOT MODIFY BY HAND
// Managed by kelo (overwritten by /kelo:${factory}-init and -sync).
// Rules: ${pkgName} | Stacks: kelo.lint.json | Project rules: eslint.project.config.mjs

import { ${factory} } from "${pkgName}";

import projectConfig from "./eslint.project.config.mjs";

export default ${factory}({ root: import.meta.dirname, project: projectConfig });
`;
}

// 사용자 소유 파일의 초기 스텁. init에서 없을 때만 생성하고, sync는 보존한다.
const PROJECT_CONFIG_STUB = `// Project-specific ESLint rules (user-owned — created once, never overwritten by sync).
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
  const args = { framework: "", outputDir: "", stacks: "" };
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
      case "--with":
        if (!rest.length) {
          process.stderr.write("--with requires a stack list\n");
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
  if (!args.outputDir) {
    process.stderr.write("Error: -p <output-dir> is required\n");
    usage();
  }

  return args;
}

function splitStacks(raw) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// 스택은 rules/<framework>/<stack>/eslint.rules.mjs가 있어야 유효하다
// (패키지 factory의 스택 등록표와 1:1). 없으면 경고 후 제외 — factory가
// 알 수 없는 스택에 에러를 내므로 kelo.lint.json에 남기지 않는다.
function validateStacks(rulesDir, stacks) {
  const valid = [];
  for (const stack of stacks) {
    const rulesFile = path.join(rulesDir, stack, "eslint.rules.mjs");
    if (fs.existsSync(rulesFile)) {
      valid.push(stack);
    } else {
      process.stderr.write(
        `Warning: Unknown stack '${stack}' (no ${rulesFile}) — skipped\n`,
      );
    }
  }
  return [...new Set(valid)].sort();
}

function writeLintConfig(outputDir, stacks) {
  const file = path.join(outputDir, LINT_CONFIG_FILE);
  const existed = fs.existsSync(file);
  let current = {};
  if (existed) {
    try {
      current = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      process.stderr.write(`Error: ${file} is not valid JSON — fix it first\n`);
      process.exit(1);
    }
  }
  const next = { ...current, stacks };
  let verb = "Created:";
  if (existed) {
    verb =
      JSON.stringify(current) === JSON.stringify(next)
        ? "Unchanged:"
        : "Updated:";
  }
  fs.writeFileSync(file, JSON.stringify(next, null, 2) + "\n");
  process.stdout.write(
    `  ${verb.padEnd(10)} ${file} (stacks: ${stacks.join(", ") || "none"})\n`,
  );
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

  const stacks = validateStacks(rulesDir, splitStacks(args.stacks));

  // ── eslint.config.mjs (kelo-managed) ──────────────────────────────────────
  fs.mkdirSync(args.outputDir, { recursive: true });
  const outputFile = path.join(args.outputDir, "eslint.config.mjs");
  fs.writeFileSync(outputFile, renderEslintConfig(configPkg.name, factory));
  process.stdout.write(`Generated: ${outputFile}\n`);

  // ── kelo.lint.json (stacks rewritten, other keys preserved) ──────────────
  writeLintConfig(args.outputDir, stacks);

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

  if (LEGACY_PACKAGE in dev) {
    notes.push(
      `  Removed:   ${LEGACY_PACKAGE} (${dev[LEGACY_PACKAGE]}) — replaced by ${configPkg.name}`,
    );
    delete dev[LEGACY_PACKAGE];
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
      // 기존 명령이 --fix였다면 자동 수정 동작을 유지한다 (nest new 기본 lint 등)
      const next =
        /(^|\s)--fix(\s|$)/.test(old) && !cmd.endsWith("--fix")
          ? `${cmd} --fix`
          : cmd;
      if (old === next) continue;
      scripts[name] = next;
      notes.push(`  Replaced:  scripts.${name} "${old}" → ${next}`);
      if (/--ignore-pattern|\s[^-\s][^\s]*\//.test(old)) {
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
  if ("lint:jkit" in scripts) {
    delete scripts["lint:jkit"];
    notes.push("  Removed:   scripts.lint:jkit (scripts.lint로 통일)");
  }
  pkg.scripts = scripts;

  fs.writeFileSync(userPkgPath, JSON.stringify(pkg, null, 2) + "\n");
  for (const n of notes) process.stdout.write(n + "\n");

  process.stdout.write("\n");
  process.stdout.write(`Next step: run 'npm install' in ${args.outputDir}\n`);
  if (stacks.length > 0) {
    process.stdout.write(`Stacks: ${stacks.join(",")}\n`);
  }
}

main();
