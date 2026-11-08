// =============================================================================
// Kelo Next.js ESLint shareable config — factory
// -----------------------------------------------------------------------------
// 소비 프로젝트의 eslint.config.mjs:
//
//   import { nextjs } from "eslint-config-kelo-nextjs";
//   import projectConfig from "./eslint.project.config.mjs";
//   export default nextjs({ root: import.meta.dirname, project: projectConfig });
//
// 프로젝트별 확장(boundary element/rule/ignore, 전역 ignore, 추가 금지 목록)은
// `<root>/kelo.lint.json`에서 읽는다. 블록 순서는 뒤가 앞을 override하므로
// 아래 조립 순서를 바꾸지 않는다.
// =============================================================================

import {
  baseBoundaryElements,
  baseBoundaryIgnores,
  baseBoundaryRules,
  baseConfig,
  baseCustomRules,
  baseFileSizeRules,
  baseDomainBannedPackages,
  baseIgnores,
  baseRestrictedPatterns,
  baseRestrictedSyntax,
  baseServerComponentRules,
  buildArchitectureBoundaries,
  buildDomainPurity,
  buildRestrictedImports,
  orderBoundaryElements,
} from "./base/eslint.rules.mjs";
import {
  assertProjectConfig,
  loadLintConfig,
  lockInlineConfigBlock,
  projectIgnoresBlock,
} from "./lib/factory-helpers.mjs";

/** kelo.lint.json에서 nextjs가 추가로 받는 금지 목록 키 (추가만, 기존 목록 제거 불가). */
const NEXTJS_LINT_CONFIG_KEYS = ["domainBannedPackages", "restrictedPatterns"];

/**
 * kelo 관리 블록만 조립한다 (project override/ignore 제외).
 * `nextjs()`와 CLI(`kelo-lint-nextjs`)가 공유한다.
 */
function buildKeloBlocks(root, lintConfig) {
  // 전역 + 도메인 순수성 양쪽에서 공통으로 사용되는 import 금지 패턴
  const allRestrictedPatterns = [
    ...baseRestrictedPatterns,
    ...(lintConfig.restrictedPatterns ?? []),
  ];

  return [
    // [1] 베이스 (Next.js + TS + Prettier + SonarJS + 공통 스타일)
    ...baseConfig,

    // [2] tsconfigRootDir를 소비 프로젝트 루트로 재지정
    {
      files: ["**/*.{ts,tsx}"],
      languageOptions: {
        parserOptions: {
          tsconfigRootDir: root,
        },
      },
    },

    // [3] 전역 import 제한 (base + kelo.lint.json)
    ...buildRestrictedImports(allRestrictedPatterns),

    // [4] 도메인 순수성 — 프레임워크/브라우저 글로벌 차단
    ...buildDomainPurity(
      [...baseDomainBannedPackages, ...(lintConfig.domainBannedPackages ?? [])],
      allRestrictedPatterns,
    ),

    // [5] AST selector 기반 금지 구문 — Server Component 룰보다 먼저 (warn)
    {
      rules: {
        "no-restricted-syntax": ["warn", ...baseRestrictedSyntax],
      },
    },

    // [6] Server Component 전용 — src/app/** 에서 Hook 호출 금지 (error)
    ...baseServerComponentRules,

    // [7] 아키텍처 경계 — base + kelo.lint.json 확장
    // catch-all(`fallback: true`)은 프로젝트 element 뒤로 — first-match라 앞에 두면 가려진다
    ...buildArchitectureBoundaries(
      orderBoundaryElements([
        ...baseBoundaryElements,
        ...(lintConfig.boundaryElements ?? []),
      ]),
      [...baseBoundaryRules, ...(lintConfig.boundaryRules ?? [])],
      [...baseBoundaryIgnores, ...(lintConfig.boundaryIgnores ?? [])],
      root,
    ),

    // [8] 프로젝트 공용 custom 룰 (conventions.md 강제)
    ...baseCustomRules,

    // [8-1] 파일 크기 제한 (800줄, warn)
    ...baseFileSizeRules,
  ];
}

/**
 * Next.js ESLint flat config를 만든다.
 *
 * @param {object} options
 * @param {string} options.root 소비 프로젝트 루트 (`import.meta.dirname`)
 * @param {import("eslint").Linter.Config[]} [options.project]
 *   `eslint.project.config.mjs` — 새 규칙 추가만 허용, kelo 규칙 변경 시 에러
 */
export function nextjs({ root, project = [] } = {}) {
  if (!root) {
    throw new Error(
      "[kelo] nextjs({ root })가 필요합니다 — eslint.config.mjs에서 `root: import.meta.dirname`을 전달하세요.",
    );
  }
  const lintConfig = loadLintConfig(root, NEXTJS_LINT_CONFIG_KEYS);
  const keloBlocks = buildKeloBlocks(root, lintConfig);
  assertProjectConfig(project, keloBlocks);

  return [
    ...keloBlocks,

    // 프로젝트 전용 추가 규칙 (eslint.project.config.mjs)
    ...project,

    // inline disable 주석 무시
    lockInlineConfigBlock,

    // [9] 전역 ignore (빌드 산출물 등) + kelo.lint.json `ignores`
    baseIgnores,
    ...projectIgnoresBlock(lintConfig.ignores),
  ];
}
