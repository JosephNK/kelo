#!/usr/bin/env node
// =============================================================================
// Kelo i18n Error Code Checker
// -----------------------------------------------------------------------------
// exception/ 폴더의 *.error.ts 파일에서 사용된 에러 코드가
// src/infrastructure/i18n/locales/<lang>/error.json 모든 로케일에 등록되었는지
// 검증한다. conventions.md "Exception creation checklist" 강제 보조 스크립트.
//
// 사용법 (프로젝트 root에서):
//   npx kelo-check-i18n   (eslint-config-kelo-nestjs bin)
//   npx kelo-check-i18n -p /path/to/project
//
// 옵션:
//   -p <dir>           프로젝트 루트 (기본: CWD)
//   --locales-dir <d>  locales 디렉토리 (기본: src/infrastructure/i18n/locales)
//   --modules-dir <d>  modules 디렉토리 (기본: src/modules)
//   -h, --help         도움말
//
// 탐지 전략:
//   1) *.error.ts 파일들에서 snake_case 문자열 리터럴을 수집
//      SCREAMING_SNAKE_CASE (예: 'ORDER_NOT_FOUND') 와
//      lower_snake_case (예: 'order_not_found') 를 모두 채택
//      — 단어 사이 `_`가 있는 것만 채택 (단일 단어 상수는 false-positive 방지)
//   2) locales/<lang>/error.json 각각을 JSON 로드 → 중첩 키를 평탄화
//   3) 1의 각 코드가 모든 로케일의 키에 존재하는지 검사
//
// 평탄화 규칙:
//   { "Order": { "NOT_FOUND": "..." } } → "Order.NOT_FOUND"
//   코드 매칭은 (a) 코드 = leaf key 또는 (b) 코드 = 전체 경로 중 하나면 통과.
//
// 종료 코드:
//   0 : 모든 코드가 모든 로케일에 등록됨
//   1 : 누락 또는 구성 오류
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const USAGE = `Usage: check-i18n.mjs [-p <project-root>] [--locales-dir <dir>] [--modules-dir <dir>]

Verifies that every SCREAMING_SNAKE error code in src/modules/**/exception/**/*.error.ts
exists as a key in each src/infrastructure/i18n/locales/<lang>/error.json.
`;

const CODE_PATTERN =
  /['"]([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+|[a-z][a-z0-9]*(?:_[a-z0-9]+)+)['"]/g;

function walk(dir, predicate, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, predicate, results);
    } else if (predicate(full)) {
      results.push(full);
    }
  }
  return results;
}

function extractErrorCodes(content) {
  const codes = new Set();
  CODE_PATTERN.lastIndex = 0;
  for (const m of content.matchAll(CODE_PATTERN)) {
    codes.add(m[1]);
  }
  return codes;
}

function flattenKeys(obj, prefix = "", out = new Set()) {
  if (!obj || typeof obj !== "object") return out;
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      flattenKeys(v, full, out);
    } else {
      out.add(full);
    }
  }
  return out;
}

function hasCode(code, flatKeys) {
  if (flatKeys.has(code)) return true;
  for (const key of flatKeys) {
    if (key === code || key.endsWith("." + code)) return true;
  }
  return false;
}

function parseArgs(argv) {
  const opts = {
    projectRoot: process.cwd(),
    localesDir: "src/infrastructure/i18n/locales",
    modulesDir: "src/modules",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "-p":
        opts.projectRoot = argv[++i];
        break;
      case "--locales-dir":
        opts.localesDir = argv[++i];
        break;
      case "--modules-dir":
        opts.modulesDir = argv[++i];
        break;
      case "-h":
      case "--help":
        console.log(USAGE);
        process.exit(0);
      default:
        console.error(`Unknown option: ${a}`);
        console.error(USAGE);
        process.exit(1);
    }
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const modulesAbs = path.resolve(opts.projectRoot, opts.modulesDir);
  const localesAbs = path.resolve(opts.projectRoot, opts.localesDir);

  if (!fs.existsSync(modulesAbs)) {
    console.error(`Error: modules directory not found: ${modulesAbs}`);
    process.exit(1);
  }
  if (!fs.existsSync(localesAbs)) {
    console.error(`Error: locales directory not found: ${localesAbs}`);
    process.exit(1);
  }

  const errorFiles = walk(modulesAbs, (p) =>
    /\/exception\/[^/]*\.error\.ts$/.test(p),
  );

  const allCodes = new Set();
  const codeSources = new Map();
  for (const file of errorFiles) {
    const codes = extractErrorCodes(fs.readFileSync(file, "utf8"));
    for (const code of codes) {
      allCodes.add(code);
      if (!codeSources.has(code)) codeSources.set(code, file);
    }
  }

  if (allCodes.size === 0) {
    console.log("No error codes found — nothing to verify.");
    process.exit(0);
  }

  const localeFlat = {};
  for (const entry of fs.readdirSync(localesAbs, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const lang = entry.name;
    const errorJson = path.join(localesAbs, lang, "error.json");
    if (!fs.existsSync(errorJson)) {
      console.warn(`Warning: ${lang}/error.json missing — skipping locale.`);
      continue;
    }
    try {
      localeFlat[lang] = flattenKeys(
        JSON.parse(fs.readFileSync(errorJson, "utf8")),
      );
    } catch (e) {
      console.error(`Error: invalid JSON in ${errorJson}: ${e.message}`);
      process.exit(1);
    }
  }

  const locales = Object.keys(localeFlat);
  if (locales.length === 0) {
    console.error("Error: no valid locale directories found.");
    process.exit(1);
  }

  const missing = [];
  for (const code of allCodes) {
    for (const lang of locales) {
      if (!hasCode(code, localeFlat[lang])) {
        missing.push({
          code,
          lang,
          source: path.relative(opts.projectRoot, codeSources.get(code)),
        });
      }
    }
  }

  if (missing.length === 0) {
    console.log(
      `OK — ${allCodes.size} error code(s) registered in ${locales.length} locale(s): ${locales.join(", ")}`,
    );
    process.exit(0);
  }

  console.error(`FAIL — ${missing.length} missing i18n entry(s):`);
  for (const m of missing) {
    console.error(`  [${m.lang}] ${m.code}  (defined in ${m.source})`);
  }
  process.exit(1);
}

main();
