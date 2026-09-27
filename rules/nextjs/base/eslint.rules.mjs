// =============================================================================
// JKit Next.js ESLint Base Rules — Barrel
// -----------------------------------------------------------------------------
// 각 export는 ./eslint-rules/ 하위 관심사 폴더의 단일 파일로 분리되어 있다.
// 이 파일은 외부 소비자(패키지 factory `../index.mjs`, reference generator)에
// 단일 진입점을 제공하기 위한 re-export 전용 barrel이다.
//
// 폴더 구조:
//   - settings/   : 공유 설정/raw 데이터 (resolver, restricted patterns/syntax,
//                   domain banned packages)
//   - boundaries/ : eslint-plugin-boundaries 데이터 (elements/rules/ignores)
//   - quality/    : 즉시 적용 가능한 defineConfig 룰 (base/server-component/
//                   custom/ignores)
//   - builders/   : 스택별 데이터를 받아 config를 생성하는 팩토리
//   - docs/       : ESLint 미참조 — generator가 md 보강용으로만 읽음
//                   (structure-annotations, layer-semantics)
//
// 룰을 추가/수정하려면 해당 sub-파일을 직접 편집하고
// `node scripts/typescript/gen-eslint-reference.mjs` 로 md를 재생성한다.
// =============================================================================

// ─── Settings ────────────────────────────────────────────────────────────────
export { baseRestrictedPatterns } from "./eslint-rules/settings/restricted-patterns.mjs";
export { baseImportResolverSettings } from "./eslint-rules/settings/import-resolver-settings.mjs";
export { baseDomainBannedPackages } from "./eslint-rules/settings/domain-banned-packages.mjs";
export { baseRestrictedSyntax } from "./eslint-rules/settings/restricted-syntax.mjs";

// ─── Boundaries ──────────────────────────────────────────────────────────────
export { baseBoundaryElements } from "./eslint-rules/boundaries/boundary-elements.mjs";
export { baseBoundaryRules } from "./eslint-rules/boundaries/boundary-rules.mjs";
export { baseBoundaryIgnores } from "./eslint-rules/boundaries/boundary-ignores.mjs";

// ─── Quality ─────────────────────────────────────────────────────────────────
export { baseConfig } from "./eslint-rules/quality/base-config.mjs";
export { baseServerComponentRules } from "./eslint-rules/quality/server-component.mjs";
export { baseCustomRules } from "./eslint-rules/quality/custom-rules.mjs";
export { baseIgnores } from "./eslint-rules/quality/ignores.mjs";

// ─── Builders ────────────────────────────────────────────────────────────────
export { buildRestrictedImports } from "./eslint-rules/builders/build-restricted-imports.mjs";
export { buildDomainPurity } from "./eslint-rules/builders/build-domain-purity.mjs";
export { buildArchitectureBoundaries } from "./eslint-rules/builders/build-architecture-boundaries.mjs";

// ─── Docs (ESLint 미참조, generator 전용) ─────────────────────────────────────
export { baseStructureAnnotations } from "./eslint-rules/docs/structure-annotations.mjs";
export { baseLayerSemantics } from "./eslint-rules/docs/layer-semantics.mjs";
