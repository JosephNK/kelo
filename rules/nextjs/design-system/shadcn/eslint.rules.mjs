// =============================================================================
// Kelo Next.js — shadcn/ui 스택 규칙
//
// {{STACK_IMPORTS}} / {{RESTRICTED_PATTERNS}} / {{DOMAIN_BANNED}} /
// {{BOUNDARY_PATCHES}} / {{CUSTOM_CONFIG}}에 주입.
// =============================================================================

import { defineConfig } from "eslint/config";
import sonarjs from "eslint-plugin-sonarjs";

/**
 * 다른 런타임 CSS-in-JS 차단 — shadcn은 Tailwind utility class + CSS 변수 기반이라
 * CSS-in-JS와 섞으면 클래스 우선순위·SSR hydration·테마 토큰이 어긋난다.
 * 해결 경로: Tailwind utility + `cn()` (`@/lib/utils`의 `clsx` + `tailwind-merge`) 또는 CSS Modules.
 */
export const shadcnRestrictedPatterns = [
  {
    group: ["@emotion/*", "styled-components", "styled-jsx", "styled-jsx/**"],
    message:
      "CSS-in-JS libraries are not allowed. shadcn/ui composes Tailwind utility classes — use the cn() helper from @/lib/utils or CSS Modules instead.",
  },
];

/**
 * 도메인 레이어에서 shadcn 기반 UI 의존 전체 차단 — 도메인은 UI 프레임워크 비의존.
 * shadcn 컴포넌트가 의존하는 underlying primitives(Radix·lucide-react·CVA·class helpers)는
 * presentation 레이어 전용. 도메인이 className/variant 조립을 시도하면 UI 책임이 누수된다.
 */
export const shadcnDomainBannedPackages = [
  "@radix-ui/**",
  "lucide-react",
  "class-variance-authority",
  "clsx",
  "tailwind-merge",
];

/**
 * `shared-ui` → `lib-shared`(+barrel) 허용 패치 — shadcn 컴포넌트(`src/components/ui/*`)가
 * `cn()` 헬퍼(`src/lib/utils/cn.ts`, `clsx` + `tailwind-merge` 래퍼)를 leaf 또는 barrel
 * (`@/lib/utils`) 경로로 import할 수 있도록 base의 `shared-ui` allow-list를 확장한다.
 * shadcn CLI가 생성하는 모든 컴포넌트가 `cn()`을 사용하므로 이 패치 없이는 boundary 위반.
 */
export const shadcnBoundaryAllowPatches = [
  { from: "shared-ui", allow: { to: { type: "lib-shared" } } },
  { from: "shared-ui", allow: { to: { type: "lib-shared-barrel" } } },
];

/**
 * `src/components/ui/**` 경로의 모든 `sonarjs/*` 룰 비활성화 — shadcn CLI가 생성·동기화하는
 * 외부 컴포넌트(Radix wrapper, CVA variants 등)는 SonarJS 코드 스멜 규칙을 자주 위반한다
 * (인지 복잡도, 중첩 분기, 큰 함수 등). 사용자 코드가 아니므로 해당 경로에서만 일괄 off.
 * 프로젝트 작성 코드(`src/components/<own>/**`)에는 영향이 없다.
 */
export const shadcnDisableSonarjsForUi = defineConfig({
  files: ["src/components/ui/**/*.{ts,tsx}"],
  rules: Object.fromEntries(
    Object.keys(sonarjs.rules).map((name) => [`sonarjs/${name}`, "off"]),
  ),
});

/**
 * shadcn CLI 생성 경로의 `react-hooks/set-state-in-effect` 비활성화 — carousel, sidebar의
 * `use-mobile` 훅 등 shadcn이 생성·동기화하는 코드는 effect 안에서 setState를 호출한다.
 * 사용자 코드가 아니므로 CLI 소유 경로(`src/components/ui/**`, `src/hooks/use-mobile.ts`)에서만 off.
 */
export const shadcnAllowSetStateInEffect = defineConfig({
  files: ["src/components/ui/**/*.{ts,tsx}", "src/hooks/use-mobile.{ts,tsx}"],
  rules: {
    "react-hooks/set-state-in-effect": "off",
  },
});
