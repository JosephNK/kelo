// =============================================================================
// Kelo NestJS ESLint shareable config — factory
// -----------------------------------------------------------------------------
// 소비 프로젝트의 eslint.config.mjs:
//
//   import { nestjs } from "eslint-config-kelo-nestjs";
//   import projectConfig from "./eslint.project.config.mjs";
//   export default nestjs({ root: import.meta.dirname, project: projectConfig });
//
// 스택과 프로젝트별 확장(boundary element/rule/ignore, 전역 ignore)은
// `<root>/kelo.lint.json`에서 읽는다. 블록 순서는 뒤가 앞을 override하므로
// 아래 조립 순서를 바꾸지 않는다.
// =============================================================================

import {
  anthropicFrameworkBannedPackages,
  anthropicInfraBannedPackages,
} from "./anthropic-ai/eslint.rules.mjs";
import {
  baseBoundaryElements,
  baseBoundaryIgnores,
  baseBoundaryRules,
  baseConfig,
  baseCustomRules,
  baseFileSizeRules,
  baseFrameworkBannedPackages,
  baseIgnores,
  baseImmutabilityRules,
  baseImportCycleRules,
  buildArchitectureBoundaries,
  buildLayerRestrictions,
  resolvePathAliasPattern,
} from "./base/eslint.rules.mjs";
import {
  gcpFrameworkBannedPackages,
  gcpInfraBannedPackages,
} from "./gcp/eslint.rules.mjs";
import {
  assertProjectConfig,
  loadLintConfig,
  lockInlineConfigBlock,
  pickFromStacks,
  projectIgnoresBlock,
  resolveStacks,
} from "./lib/factory-helpers.mjs";
import { typeormFrameworkBannedPackages } from "./typeorm/eslint.rules.mjs";

/**
 * 스택 등록표 — `kelo.lint.json`의 `stacks` 이름 → 스택이 기여하는 데이터.
 * 키: frameworkBannedPackages, infraBannedPackages, boundaryElements,
 *     boundaryRules, boundaryIgnores, customConfig
 */
export const nestjsStacks = {
  "anthropic-ai": {
    frameworkBannedPackages: anthropicFrameworkBannedPackages,
    infraBannedPackages: anthropicInfraBannedPackages,
  },
  gcp: {
    frameworkBannedPackages: gcpFrameworkBannedPackages,
    infraBannedPackages: gcpInfraBannedPackages,
  },
  typeorm: {
    frameworkBannedPackages: typeormFrameworkBannedPackages,
  },
};

/** kelo.lint.json에서 nestjs가 추가로 받는 금지 목록 키 (추가만, 기존 목록 제거 불가). */
const NESTJS_LINT_CONFIG_KEYS = [
  "frameworkBannedPackages",
  "infraBannedPackages",
];

/**
 * kelo 관리 블록만 조립한다 (project override/ignore 제외).
 * `nestjs()`와 CLI(`kelo-lint-nestjs`)가 공유한다.
 */
function buildKeloBlocks(root, lintConfig) {
  const stacks = resolveStacks(nestjsStacks, lintConfig.stacks ?? [], "nestjs");
  const pick = (key) => pickFromStacks(stacks, key);

  return [
    // [1] 베이스 (ESLint + TS + Prettier + 공통 스타일 + 테스트 완화)
    ...baseConfig,

    // [2] tsconfigRootDir를 소비 프로젝트 루트로 재지정
    {
      languageOptions: {
        parserOptions: {
          tsconfigRootDir: root,
        },
      },
    },

    // [3] 헥사고날 레이어별 import 제한 — path alias 검사는
    //     package.json `kelo-rules.pathAliasCheck`로 토글
    //     kelo.lint.json의 frameworkBannedPackages·infraBannedPackages는 뒤에 추가만 된다
    ...buildLayerRestrictions(
      [
        ...baseFrameworkBannedPackages,
        ...pick("frameworkBannedPackages"),
        ...(lintConfig.frameworkBannedPackages ?? []),
      ],
      [
        ...pick("infraBannedPackages"),
        ...(lintConfig.infraBannedPackages ?? []),
      ],
      resolvePathAliasPattern(root),
    ),

    // [4] 불변성 — Entity와 DTO 필드에 readonly 강제
    ...baseImmutabilityRules,

    // [5] 아키텍처 경계 — base + 스택 + kelo.lint.json 확장
    ...buildArchitectureBoundaries(
      [
        ...baseBoundaryElements,
        ...pick("boundaryElements"),
        ...(lintConfig.boundaryElements ?? []),
      ],
      [
        ...baseBoundaryRules,
        ...pick("boundaryRules"),
        ...(lintConfig.boundaryRules ?? []),
      ],
      [
        ...baseBoundaryIgnores,
        ...pick("boundaryIgnores"),
        ...(lintConfig.boundaryIgnores ?? []),
      ],
    ),

    // [6] 파일 크기 제한 (800 라인)
    ...baseFileSizeRules,

    // [7] 프로젝트 공용 custom 룰 (conventions.md 강제)
    ...baseCustomRules,

    // [7-1] 순환 의존성 감지
    ...baseImportCycleRules,

    // [7-2] 스택별 custom config
    ...pick("customConfig"),
  ];
}

/**
 * NestJS ESLint flat config를 만든다.
 *
 * @param {object} options
 * @param {string} options.root 소비 프로젝트 루트 (`import.meta.dirname`)
 * @param {import("eslint").Linter.Config[]} [options.project]
 *   `eslint.project.config.mjs` — 새 규칙 추가만 허용, kelo 규칙 변경 시 에러
 */
export function nestjs({ root, project = [] } = {}) {
  if (!root) {
    throw new Error(
      "[kelo] nestjs({ root })가 필요합니다 — eslint.config.mjs에서 `root: import.meta.dirname`을 전달하세요.",
    );
  }
  const lintConfig = loadLintConfig(root, NESTJS_LINT_CONFIG_KEYS);
  const keloBlocks = buildKeloBlocks(root, lintConfig);
  assertProjectConfig(project, keloBlocks);

  return [
    ...keloBlocks,

    // 프로젝트 전용 추가 규칙 (eslint.project.config.mjs)
    ...project,

    // inline disable 주석 무시
    lockInlineConfigBlock,

    // [8] 전역 ignore (빌드 산출물 등) + kelo.lint.json `ignores`
    baseIgnores,
    ...projectIgnoresBlock(lintConfig.ignores),
  ];
}
