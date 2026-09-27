// =============================================================================
// Kelo Next.js — Stylelint Baseline Rules
// -----------------------------------------------------------------------------
// 모든 Next.js 프로젝트가 공통 적용하는 stylelint 규칙 묶음.
// 사용자 프로젝트의 `stylelint.config.mjs`는 `stylelintBaseConfig`를 spread로 흡수한다.
// =============================================================================

/** Accessibility-critical 속성 목록 — `var()` 값에 fallback 필수인 대상. */
const FALLBACK_REQUIRED_PROPS = [
  "outline",
  "outline-color",
  "box-shadow",
  "color",
  "background",
  "background-color",
  "border",
  "border-color",
  "border-top",
  "border-right",
  "border-bottom",
  "border-left",
].join("|");

/** 디자인 토큰 하드코딩 금지 속성 (컨벤션 C13 대상). */
const STRICT_VALUE_PROPS = [
  "/color$/",
  "fill",
  "stroke",
  "font-family",
  "border-radius",
  "box-shadow",
];

/** strict-value 리터럴 허용 예외 — `var()`, CSS 키워드, 기본값 해제. */
const STRICT_VALUE_IGNORES = [
  "/^var\\(/",
  "transparent",
  "inherit",
  "currentColor",
  "unset",
  "initial",
  "none",
  "0",
  "auto",
];

/**
 * Stylelint baseline — Next.js 공통 규약.
 * Bundles: `stylelint-config-standard`, `stylelint-declaration-strict-value`.
 * 사용자 프로젝트는 `stylelint.config.mjs`에서 spread + 추가 rules로 override.
 */
export const stylelintBaseConfig = {
  extends: ["stylelint-config-standard"],
  plugins: ["stylelint-declaration-strict-value"],
  rules: {
    /**
     * Accessibility-critical 속성의 `var()` 값은 fallback 필수 (severity: warning).
     *
     * Why: fallback 없는 `var()`가 미정의되면 선언 전체가 `invalid-at-computed-value`가 되어
     * 브라우저 기본 outline·색까지 무효화 → 포커스 링 소실·FOUC. WCAG 2.4.7 리스크.
     * Theme provider 하이드레이션 이전 경로(SSR 초기 페인트, error.tsx, not-found.tsx)에서 재현.
     *
     * Bad: `outline: 2px solid var(--mantine-primary-color-filled);`
     * Good: `outline: 2px solid var(--mantine-primary-color-filled, #005da7);`
     */
    "declaration-property-value-disallowed-list": [
      {
        [`/^(${FALLBACK_REQUIRED_PROPS})$/`]: ["/var\\(--[^,)]+\\)$/"],
      },
      {
        message:
          "CSS variables in accessibility-critical declarations must include a fallback value. " +
          "Use `var(--token, <fallback>)`. A single undefined var() invalidates the entire " +
          "declaration, removing browser default focus rings and causing FOUC on pre-hydration paths.",
        severity: "warning",
      },
    ],
    /**
     * 디자인 토큰 리터럴 차단 — `var(--token)` 또는 design-token 참조만 허용 (컨벤션 C13).
     *
     * Why: 리터럴 색/radius/shadow가 섞이면 `src/theme.ts` 토큰 정책이 무력화되고
     * 다크/라이트 테마 전환이 깨진다. JSX 인라인 style의 동일 정책은 ESLint custom rule
     * `no-inline-style-tokens`가 대칭 커버.
     *
     * Bad: `color: #ff0000; border-radius: 12px;`
     * Good: `color: var(--mantine-color-text, #1a1a1a); border-radius: var(--mantine-radius-md, 8px);`
     *
     * Note: `ignoreFunctions`는 `boolean | { [prop]: boolean }`, `message`는 `${property}`
     * `${value}` `${types}` placeholder를 받는 string. 배열/함수 형태는 v1.11 이후
     * "Invalid Option" 경고와 함께 exit code 2를 유발한다.
     */
    "scale-unlimited/declaration-strict-value": [
      STRICT_VALUE_PROPS,
      {
        ignoreValues: STRICT_VALUE_IGNORES,
        ignoreFunctions: true,
        message:
          "Expected `var(--token, <fallback>)` or design-token reference for ${property}. " +
          "Hardcoded ${value} bypasses theme tokens (src/theme.ts) and breaks dark/light switching.",
      },
    ],
  },
};
