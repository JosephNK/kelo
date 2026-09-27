// =============================================================================
// Kelo Next.js — Ant Design(antd) UI 스택 규칙
//
// {{STACK_IMPORTS}} / {{RESTRICTED_PATTERNS}} / {{DOMAIN_BANNED}}에 주입.
// =============================================================================

/**
 * 다른 런타임 CSS-in-JS 차단 — antd의 `@ant-design/cssinjs`와 캐시·토큰이 충돌.
 * 해결 경로: `ConfigProvider.theme` + `className`/`style` prop + CSS Modules.
 */
export const antdRestrictedPatterns = [
  {
    group: ["@emotion/*", "styled-components", "styled-jsx", "styled-jsx/**"],
    message:
      "CSS-in-JS libraries are not allowed. antd uses @ant-design/cssinjs internally — use ConfigProvider tokens, component className/style props, or CSS Modules.",
  },
];

/** 도메인 레이어에서 antd 계열 전체 차단 — 도메인은 UI 프레임워크 비의존. */
export const antdDomainBannedPackages = ["antd", "antd/**", "@ant-design/**"];
