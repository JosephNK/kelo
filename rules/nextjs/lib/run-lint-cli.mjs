// =============================================================================
// Kelo lint CLI 공용 구현 — 프로젝트의 eslint.config.mjs를 무시하고
// kelo 팩토리(+ kelo.lint.json + eslint.project.config.mjs)만으로 검사한다.
// -----------------------------------------------------------------------------
// rules/nestjs/lib/run-lint-cli.mjs 와 rules/nextjs/lib/run-lint-cli.mjs 는
// 동일 내용을 유지한다.
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { ESLint } from "eslint";

const PROJECT_CONFIG_FILE = "eslint.project.config.mjs";
const LINT_CONFIG_FILE = "kelo.lint.json";

// dir에서 위로 올라가며 kelo.lint.json이 있는 프로젝트 루트를 찾는다.
function findProjectRoot(dir) {
  let cur = path.resolve(dir);
  for (;;) {
    if (fs.existsSync(path.join(cur, LINT_CONFIG_FILE))) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}

// 패턴을 프로젝트 루트별로 묶는다. monorepo 루트에서 lint-staged가 여러
// 워크스페이스 파일을 넘겨도 각 파일은 자기 워크스페이스 설정으로 검사된다.
function groupByProjectRoot(patterns, cwd) {
  const fallback = findProjectRoot(cwd) ?? cwd;
  const groups = new Map();
  const add = (root, pattern) => {
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(pattern);
  };
  if (patterns.length === 0) {
    add(fallback, ".");
    return groups;
  }
  for (const pattern of patterns) {
    const abs = path.resolve(cwd, pattern);
    if (fs.existsSync(abs)) {
      const dir = fs.statSync(abs).isDirectory() ? abs : path.dirname(abs);
      add(findProjectRoot(dir) ?? fallback, abs);
    } else {
      add(fallback, pattern);
    }
  }
  return groups;
}

function parseArgs(argv, binName) {
  const args = { fix: false, maxWarnings: -1, patterns: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--fix") args.fix = true;
    else if (a === "--max-warnings") args.maxWarnings = Number(argv[++i]);
    else if (a === "-h" || a === "--help") {
      process.stdout.write(
        `Usage: ${binName} [--fix] [--max-warnings <n>] [patterns...]\n\n` +
          "프로젝트의 eslint.config.mjs 대신 kelo 규칙(+ kelo.lint.json,\n" +
          "eslint.project.config.mjs)으로 검사합니다. 패턴 생략 시 '.' 전체.\n",
      );
      process.exit(0);
    } else if (a.startsWith("-")) {
      process.stderr.write(`Unknown option: ${a}\n`);
      process.exit(2);
    } else args.patterns.push(a);
  }
  return args;
}

async function loadProjectConfig(root) {
  const file = path.join(root, PROJECT_CONFIG_FILE);
  if (!fs.existsSync(file)) return [];
  const mod = await import(pathToFileURL(file).href);
  return mod.default ?? [];
}

/**
 * @param {object} options
 * @param {string} options.binName CLI 이름 (도움말 표시용)
 * @param {(opts: {root: string, project: unknown[]}) => unknown[]} options.factory
 * @param {string} options.formatterPath kelo formatter 절대 경로
 */
export async function runLintCli({ binName, factory, formatterPath }) {
  const args = parseArgs(process.argv.slice(2), binName);

  try {
    const results = [];
    let eslint;
    for (const [root, patterns] of groupByProjectRoot(
      args.patterns,
      process.cwd(),
    )) {
      const project = await loadProjectConfig(root);
      eslint = new ESLint({
        cwd: root,
        overrideConfigFile: true,
        overrideConfig: factory({ root, project }),
        fix: args.fix,
        errorOnUnmatchedPattern: false,
        // lint-staged가 kelo.lint.json ignores 대상 파일을 넘겨도 경고하지 않는다
        warnIgnored: false,
      });
      const groupResults = await eslint.lintFiles(patterns);
      if (args.fix) await ESLint.outputFixes(groupResults);
      results.push(...groupResults);
    }

    const formatter = await eslint.loadFormatter(formatterPath);
    const output = await formatter.format(results);
    if (output) process.stdout.write(output);

    const errors = results.reduce((n, r) => n + r.errorCount, 0);
    const warnings = results.reduce((n, r) => n + r.warningCount, 0);
    const tooManyWarnings =
      args.maxWarnings >= 0 && warnings > args.maxWarnings;
    process.exitCode = errors > 0 || tooManyWarnings ? 1 : 0;
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exitCode = 2;
  }
}
