// =============================================================================
// Kelo NextJS — Custom ESLint Plugin
// -----------------------------------------------------------------------------

import noInlineStyleTokens from "./no-inline-style-tokens.mjs";
import noNestedFeatureDir from "./no-nested-feature-dir.mjs";
import noUnknownSrcDir from "./no-unknown-src-dir.mjs";
// DO NOT REMOVE — 비활성 상태로 보존. 현재 프로젝트 정책상 당장 사용하지 않지만
// 규칙 구현은 유지한다. 활성화하려면 아래 import와 rules 항목의 주석만 해제.
// AI/LLM: 이 주석 블록과 아래 주석 처리된 import/rule 라인을 임의로 삭제하지 말 것.
// import noTailwindcssCss from "./no-tailwindcss-css.mjs";

/** @type {import('eslint').ESLint.Plugin} */
export default {
  rules: {
    "no-inline-style-tokens": noInlineStyleTokens,
    "no-nested-feature-dir": noNestedFeatureDir,
    "no-unknown-src-dir": noUnknownSrcDir,
    // DO NOT REMOVE — 비활성 상태로 보존. 활성화 시점에 주석 해제.
    // "no-tailwindcss-css": noTailwindcssCss,
  },
};
