// =============================================================================
// Kelo Next.js Stylelint preset
// -----------------------------------------------------------------------------
// 소비 프로젝트의 stylelint.config.mjs:
//
//   export { default } from "eslint-config-kelo-nextjs/stylelint";
//
// 룰 원본은 ./stylelint.rules.mjs (reference 문서 생성 대상). 이 파일은 거기에
// Tailwind CSS v4 호환 설정과 ignore 경로를 더한 최종 config만 조립한다.
// =============================================================================

import { stylelintBaseConfig } from "./stylelint.rules.mjs";

/** @type {import('stylelint').Config} */
const config = {
  ...stylelintBaseConfig,
  rules: {
    ...stylelintBaseConfig.rules,
    // Tailwind CSS v4 at-rules 화이트리스트 — stylelint-config-standard의
    // `at-rule-no-unknown: true`가 Tailwind directive를 차단하므로 보강.
    "at-rule-no-unknown": [
      true,
      {
        ignoreAtRules: [
          "theme",
          "tailwind",
          "apply",
          "layer",
          "variants",
          "screen",
          "config",
          "plugin",
          "source",
          "utility",
          "custom-variant",
          "reference",
        ],
      },
    ],
    // Tailwind v4는 `@import "tailwindcss"` 문자열 형식 사용 — stylelint-config-standard의
    // `import-notation: "url"` 강제와 충돌하므로 해제.
    "import-notation": "string",
  },
  ignoreFiles: [
    "**/node_modules/**",
    "**/.next/**",
    "**/dist/**",
    "**/build/**",
    "**/coverage/**",
    "**/public/**",
  ],
};

export default config;
