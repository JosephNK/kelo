// =============================================================================
// Kelo lint CLI 인자 처리 — eslint를 import하지 않아 단독으로 테스트할 수 있다.
// -----------------------------------------------------------------------------
// rules/nestjs/lib/lint-cli-args.mjs 와 rules/nextjs/lib/lint-cli-args.mjs 는
// 동일 내용을 유지한다.
// =============================================================================

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const CACHE_STRATEGIES = ["metadata", "content"];

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

export function parseArgs(argv, binName) {
  const args = {
    fix: false,
    maxWarnings: -1,
    format: "stylish",
    cache: false,
    cacheLocation: undefined,
    cacheStrategy: "metadata",
    patterns: [],
  };
  const value = (i, option) => {
    const v = argv[i];
    if (v === undefined || v.startsWith("-")) {
      fail(`Option ${option} requires a value`);
    }
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--fix") args.fix = true;
    else if (a === "--max-warnings") args.maxWarnings = Number(argv[++i]);
    else if (a === "--format") args.format = argv[++i];
    else if (a === "--cache") args.cache = true;
    else if (a === "--cache-location") args.cacheLocation = value(++i, a);
    else if (a === "--cache-strategy") {
      args.cacheStrategy = value(++i, a);
      if (!CACHE_STRATEGIES.includes(args.cacheStrategy)) {
        fail(
          `Invalid --cache-strategy: ${args.cacheStrategy} (${CACHE_STRATEGIES.join(" | ")})`,
        );
      }
    } else if (a === "-h" || a === "--help") {
      process.stdout.write(
        `Usage: ${binName} [--fix] [--max-warnings <n>] [--format <name>]\n` +
          "       [--cache] [--cache-location <path>] [--cache-strategy <metadata|content>] [patterns...]\n\n" +
          "프로젝트의 eslint.config.mjs 대신 kelo 규칙(+ kelo.lint.json,\n" +
          "eslint.project.config.mjs)으로 검사합니다. 패턴 생략 시 '.' 전체.\n" +
          "--format: ESLint formatter 이름 (기본 stylish, kelo doctor는 json).\n" +
          "--cache: 바뀐 파일만 다시 검사합니다 (기본 꺼짐).\n" +
          "--cache-location: 캐시 파일 또는 디렉터리 (기본 <프로젝트 루트>/.eslintcache).\n" +
          "  디렉터리이거나 프로젝트 루트가 여럿이면 루트마다 다른 파일을 씁니다.\n" +
          "--cache-strategy: metadata(기본, 수정 시각·크기) | content(내용 해시 — CI용).\n" +
          "캐시는 파일 단위라, 다른 파일의 타입·import 변경으로 생기는 위반은 놓칠 수 있습니다.\n",
      );
      process.exit(0);
    } else if (a.startsWith("-")) {
      fail(`Unknown option: ${a}`);
    } else args.patterns.push(a);
  }
  return args;
}

// --cache-location을 호출 위치(cwd) 기준으로 풀고, 프로젝트 루트가 여럿이어도 캐시 파일이 겹치지 않게 한다.
// - 생략: undefined → ESLint 기본값(<root>/.eslintcache)
// - 디렉터리: 그대로 넘긴다 → ESLint가 루트(cwd)별 `.cache_<hash>` 파일을 만든다
// - 파일: 루트가 하나면 그대로, 여럿이면 `<파일>.<루트 해시>`
export function resolveCacheLocation({ location, cwd, root, rootCount }) {
  if (location === undefined) return undefined;
  const abs = path.resolve(cwd, location);
  const isDirectory =
    /[/\\]$/.test(location) ||
    (fs.existsSync(abs) && fs.statSync(abs).isDirectory());
  if (isDirectory) return abs + path.sep;
  if (rootCount <= 1) return abs;
  const key = path.relative(cwd, root).split(path.sep).join("/") || ".";
  const hash = crypto.createHash("sha1").update(key).digest("hex").slice(0, 8);
  return `${abs}.${hash}`;
}
