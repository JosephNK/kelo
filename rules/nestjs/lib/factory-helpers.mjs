// =============================================================================
// Kelo shareable config — factory 공용 헬퍼
// -----------------------------------------------------------------------------
// rules/nestjs/lib/factory-helpers.mjs 와 rules/nextjs/lib/factory-helpers.mjs 는
// 동일 내용을 유지한다 (패키지가 분리 배포되므로 서로의 파일을 import할 수 없다).
// =============================================================================

import fs from "node:fs";
import path from "node:path";

import { globalIgnores } from "eslint/config";

export const LINT_CONFIG_FILE = "kelo.lint.json";

const LINT_CONFIG_KEYS = new Set([
  "stacks",
  "boundaryElements",
  "boundaryRules",
  "boundaryIgnores",
  "ignores",
]);

// kelo.lint.json은 프로젝트가 직접 편집하는 파일이라, 규칙을 사실상 끄는 넓은 제외 패턴은
// 로드 단계에서 거부한다 (전체, 소스 루트 전체, 소스 확장자 전체).
const BROAD_SOURCE_ROOTS = new Set([
  "src",
  "app",
  "lib",
  "pages",
  "components",
]);
const SOURCE_EXT_RE =
  /^(\*\*\/)?\*\.(\{[a-z,]+\}|ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;

function isOverlyBroadIgnore(pattern) {
  if (typeof pattern !== "string" || pattern.startsWith("!")) return false;
  let p = pattern.trim().replace(/^\.\//, "");
  let prev;
  do {
    prev = p;
    p = p.replace(/\/(\*\*|\*)$/, "").replace(/\/$/, "");
  } while (p !== prev);
  return (
    p === "" ||
    p === "**" ||
    p === "*" ||
    BROAD_SOURCE_ROOTS.has(p) ||
    SOURCE_EXT_RE.test(p)
  );
}

function assertNarrowIgnores(file, data) {
  for (const key of ["ignores", "boundaryIgnores"]) {
    const broad = (data[key] ?? []).filter(isOverlyBroadIgnore);
    if (broad.length > 0) {
      throw new Error(
        `[kelo] ${file}: ${key}에 너무 넓은 제외 패턴이 있습니다: ${broad.join(", ")}\n` +
          "kelo 규칙을 사실상 끄는 패턴(전체, src/·app/ 등 소스 루트 전체, 소스 확장자 전체)은 허용되지 않습니다. " +
          "빌드 산출물·생성 코드처럼 필요한 경로만 좁게 지정하세요.",
      );
    }
  }
}

/**
 * `<root>/kelo.lint.json`을 읽는다. 파일이 없으면 빈 설정(스택 없음)으로 동작한다.
 * 알 수 없는 키는 오타일 가능성이 높으므로 에러로 처리하고, 너무 넓은 제외 패턴은 거부한다.
 */
export function loadLintConfig(root) {
  const file = path.join(root, LINT_CONFIG_FILE);
  if (!fs.existsSync(file)) return {};
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(`[kelo] ${file} 파싱 실패: ${err.message}`);
  }
  const unknown = Object.keys(data).filter(
    (k) => !k.startsWith("$") && !LINT_CONFIG_KEYS.has(k),
  );
  if (unknown.length > 0) {
    throw new Error(
      `[kelo] ${file}: 알 수 없는 키 ${unknown.join(", ")} (허용: ${[...LINT_CONFIG_KEYS].join(", ")})`,
    );
  }
  assertNarrowIgnores(file, data);
  return data;
}

/**
 * 스택 이름 목록을 등록표 항목으로 변환한다. 이름은 정렬해 적용 순서를 고정한다.
 */
export function resolveStacks(registry, names, framework) {
  return [...new Set(names)].sort().map((name) => {
    const stack = registry[name];
    if (!stack) {
      throw new Error(
        `[kelo] 알 수 없는 ${framework} 스택: '${name}' (사용 가능: ${Object.keys(registry).join(", ")})`,
      );
    }
    return stack;
  });
}

/** 선택된 스택들의 같은 키 배열을 이어 붙인다. */
export function pickFromStacks(stacks, key) {
  return stacks.flatMap((s) => s[key] ?? []);
}

/** 프로젝트 설정의 global ignore 목록을 flat config 블록으로 변환한다. */
export function projectIgnoresBlock(ignores) {
  return ignores && ignores.length > 0 ? [globalIgnores(ignores)] : [];
}

function collectRuleIds(blocks) {
  const ids = new Set();
  for (const block of blocks) {
    for (const id of Object.keys(block?.rules ?? {})) ids.add(id);
  }
  return ids;
}

function collectSettingKeys(blocks) {
  const keys = new Set();
  for (const block of blocks) {
    for (const key of Object.keys(block?.settings ?? {})) keys.add(key);
  }
  return keys;
}

/**
 * `eslint.project.config.mjs`가 kelo 규칙을 약화·변경하지 않는지 검사한다.
 *
 * 허용: kelo가 쓰지 않는 새 규칙/플러그인 추가, 파일 범위 지정.
 * 금지: kelo가 설정한 규칙 ID 재정의(강화 포함), kelo가 쓰는 settings 키 재정의,
 *       linterOptions 변경(inline disable 재허용 등), global ignore 블록
 *       (전역 제외는 kelo.lint.json `ignores`로만).
 */
export function assertProjectConfig(project, keloBlocks) {
  if (!Array.isArray(project)) {
    throw new Error(
      "[kelo] eslint.project.config.mjs는 flat config 배열을 default export 해야 합니다.",
    );
  }
  const ruleIds = collectRuleIds(keloBlocks);
  const settingKeys = collectSettingKeys(keloBlocks);
  const violations = [];

  project.forEach((block, i) => {
    if (!block || typeof block !== "object") return;
    const where = `project[${i}]${block.name ? ` (${block.name})` : ""}`;

    for (const id of Object.keys(block.rules ?? {})) {
      if (ruleIds.has(id)) violations.push(`${where} rules."${id}"`);
    }
    for (const key of Object.keys(block.settings ?? {})) {
      if (settingKeys.has(key)) violations.push(`${where} settings."${key}"`);
    }
    if ("linterOptions" in block) violations.push(`${where} linterOptions`);

    const keys = Object.keys(block).filter((k) => k !== "name");
    if (keys.length === 1 && keys[0] === "ignores") {
      violations.push(`${where} global ignores`);
    }
  });

  if (violations.length > 0) {
    throw new Error(
      [
        "[kelo] eslint.project.config.mjs가 kelo 관리 규칙을 변경하려고 합니다:",
        ...violations.map((v) => `  - ${v}`),
        "kelo 규칙 변경은 kelo 저장소에서 하세요. 프로젝트 파일은 새 규칙 추가만 허용됩니다.",
        "전역 제외 경로는 kelo.lint.json의 `ignores`에 추가하세요.",
      ].join("\n"),
    );
  }
}

/**
 * inline 설정 주석(`eslint-disable` 등)을 무시한다.
 * 규칙 예외는 코드 주석이 아니라 kelo 규칙 변경으로만 허용한다.
 */
export const lockInlineConfigBlock = {
  name: "kelo/lock-inline-config",
  linterOptions: {
    noInlineConfig: true,
  },
};
