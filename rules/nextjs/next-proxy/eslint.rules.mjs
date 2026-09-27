// =============================================================================
// Kelo Next.js — Next Proxy 스택 규칙
//
// Next.js 16 `src/proxy.ts`(구 middleware) 단일 진입점을 boundary 검사에서 제외.
// =============================================================================

/** `src/proxy.ts`는 프레임워크 진입점이라 레이어에 속하지 않으므로 boundary 검사에서 제외. */
export const nextProxyBoundaryIgnores = ["src/proxy.ts"];
