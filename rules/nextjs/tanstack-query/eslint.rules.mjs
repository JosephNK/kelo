// =============================================================================
// Kelo Next.js — TanStack Query (React Query) 스택 규칙
// =============================================================================

/**
 * 도메인 레이어에서 TanStack 차단 — React 런타임 결합 hook 라이브러리.
 * 사용 위치: `src/http/<feature>/hook.ts` (http-hook 레이어).
 */
export const tanstackQueryDomainBannedPackages = ["@tanstack/**"];
