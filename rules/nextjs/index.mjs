// =============================================================================
// Kelo Next.js ESLint shareable config — factory
// -----------------------------------------------------------------------------
// 소비 프로젝트의 eslint.config.mjs:
//
//   import { nextjs } from "eslint-config-kelo-nextjs";
//   import projectConfig from "./eslint.project.config.mjs";
//   export default nextjs({ root: import.meta.dirname, project: projectConfig });
//
// 스택과 프로젝트별 확장(boundary element/rule/ignore, 전역 ignore)은
// `<root>/kelo.lint.json`에서 읽는다. 블록 순서는 뒤가 앞을 override하므로
// 아래 조립 순서를 바꾸지 않는다.
// =============================================================================

import {
  baseBoundaryElements,
  baseBoundaryIgnores,
  baseBoundaryRules,
  baseConfig,
  baseCustomRules,
  baseDomainBannedPackages,
  baseIgnores,
  baseRestrictedPatterns,
  baseRestrictedSyntax,
  baseServerComponentRules,
  buildArchitectureBoundaries,
  buildDomainPurity,
  buildRestrictedImports,
} from "./base/eslint.rules.mjs";
import {
  antdDomainBannedPackages,
  antdRestrictedPatterns,
} from "./design-system/antd/eslint.rules.mjs";
import {
  mantineDomainBannedPackages,
  mantineRestrictedPatterns,
} from "./design-system/mantine/eslint.rules.mjs";
import {
  shadcnAllowSetStateInEffect,
  shadcnBoundaryAllowPatches,
  shadcnDisableSonarjsForUi,
  shadcnDomainBannedPackages,
  shadcnRestrictedPatterns,
} from "./design-system/shadcn/eslint.rules.mjs";
import {
  assertProjectConfig,
  loadLintConfig,
  lockInlineConfigBlock,
  pickFromStacks,
  projectIgnoresBlock,
  resolveStacks,
} from "./lib/factory-helpers.mjs";
import { nextProxyBoundaryIgnores } from "./next-proxy/eslint.rules.mjs";
import {
  nextauthBoundaryAllowPatches,
  nextauthBoundaryElements,
  nextauthBoundaryRules,
  nextauthDomainBannedPackages,
} from "./nextauth/eslint.rules.mjs";
import { tanstackQueryDomainBannedPackages } from "./tanstack-query/eslint.rules.mjs";

/**
 * 스택 등록표 — `kelo.lint.json`의 `stacks` 이름 → 스택이 기여하는 데이터.
 * 키: restrictedPatterns, domainBannedPackages, restrictedSyntax,
 *     boundaryElements, boundaryRules, boundaryPatches, boundaryIgnores, customConfig
 */
export const nextjsStacks = {
  "design-system/antd": {
    restrictedPatterns: antdRestrictedPatterns,
    domainBannedPackages: antdDomainBannedPackages,
  },
  "design-system/mantine": {
    restrictedPatterns: mantineRestrictedPatterns,
    domainBannedPackages: mantineDomainBannedPackages,
  },
  "design-system/shadcn": {
    restrictedPatterns: shadcnRestrictedPatterns,
    domainBannedPackages: shadcnDomainBannedPackages,
    boundaryPatches: shadcnBoundaryAllowPatches,
    customConfig: [
      ...shadcnDisableSonarjsForUi,
      ...shadcnAllowSetStateInEffect,
    ],
  },
  "next-proxy": {
    boundaryIgnores: nextProxyBoundaryIgnores,
  },
  nextauth: {
    domainBannedPackages: nextauthDomainBannedPackages,
    boundaryElements: nextauthBoundaryElements,
    boundaryRules: nextauthBoundaryRules,
    boundaryPatches: nextauthBoundaryAllowPatches,
  },
  "tanstack-query": {
    domainBannedPackages: tanstackQueryDomainBannedPackages,
  },
};

/**
 * base 규칙의 `allow` 배열에 스택별 추가 허용 항목을 덧붙인다.
 * patches 예시: [{ from: 'http-repository', allow: { to: { type: 'db' } } }]
 */
function patchBoundaryRules(rules, patches) {
  return rules.map((rule) => {
    const matching = patches.filter((p) => p.from === rule.from?.type);
    if (matching.length === 0) return rule;
    return {
      ...rule,
      allow: [...(rule.allow || []), ...matching.map((p) => p.allow)],
    };
  });
}

/** kelo.lint.json에서 nextjs가 추가로 받는 금지 목록 키 (추가만, 기존 목록 제거 불가). */
const NEXTJS_LINT_CONFIG_KEYS = ["domainBannedPackages", "restrictedPatterns"];

/**
 * kelo 관리 블록만 조립한다 (project override/ignore 제외).
 * `nextjs()`와 CLI(`kelo-lint-nextjs`)가 공유한다.
 */
function buildKeloBlocks(root, lintConfig) {
  const stacks = resolveStacks(nextjsStacks, lintConfig.stacks ?? [], "nextjs");
  const pick = (key) => pickFromStacks(stacks, key);

  // 전역 + 도메인 순수성 양쪽에서 공통으로 사용되는 import 금지 패턴
  const allRestrictedPatterns = [
    ...baseRestrictedPatterns,
    ...pick("restrictedPatterns"),
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

    // [3] 전역 import 제한 (base + 스택)
    ...buildRestrictedImports(allRestrictedPatterns),

    // [4] 도메인 순수성 — 프레임워크/브라우저 글로벌 차단
    ...buildDomainPurity(
      [
        ...baseDomainBannedPackages,
        ...pick("domainBannedPackages"),
        ...(lintConfig.domainBannedPackages ?? []),
      ],
      allRestrictedPatterns,
    ),

    // [5] AST selector 기반 금지 구문 — Server Component 룰보다 먼저 (warn)
    {
      rules: {
        "no-restricted-syntax": [
          "warn",
          ...baseRestrictedSyntax,
          ...pick("restrictedSyntax"),
        ],
      },
    },

    // [6] Server Component 전용 — src/app/** 에서 Hook 호출 금지 (error)
    ...baseServerComponentRules,

    // [7] 아키텍처 경계 — base + 스택 + kelo.lint.json 확장
    ...buildArchitectureBoundaries(
      [
        ...baseBoundaryElements,
        ...pick("boundaryElements"),
        ...(lintConfig.boundaryElements ?? []),
      ],
      patchBoundaryRules(
        [
          ...baseBoundaryRules,
          ...pick("boundaryRules"),
          ...(lintConfig.boundaryRules ?? []),
        ],
        pick("boundaryPatches"),
      ),
      [
        ...baseBoundaryIgnores,
        ...pick("boundaryIgnores"),
        ...(lintConfig.boundaryIgnores ?? []),
      ],
    ),

    // [8] 프로젝트 공용 custom 룰 (conventions.md 강제)
    ...baseCustomRules,

    // [8-1] 스택별 custom config (per-path rule override 등)
    ...pick("customConfig"),
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
