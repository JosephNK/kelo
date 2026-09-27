// =============================================================================
// Kelo Next.js — Mantine UI 스택 규칙
//
// {{STACK_IMPORTS}} / {{RESTRICTED_PATTERNS}} / {{DOMAIN_BANNED}}에 주입.
// =============================================================================

/**
 * 다른 런타임 CSS-in-JS 차단 — Mantine의 Emotion과 이중 설정 발생 방지.
 */
export const mantineRestrictedPatterns = [
  {
    group: ["@emotion/*", "styled-components", "styled-jsx", "styled-jsx/**"],
    message:
      "CSS-in-JS libraries are not allowed. Use Mantine style props or CSS Modules.",
  },
];

/** 도메인 레이어에서 Mantine 전체 차단 — 도메인은 UI 프레임워크 비의존. */
export const mantineDomainBannedPackages = ["@mantine/**"];
