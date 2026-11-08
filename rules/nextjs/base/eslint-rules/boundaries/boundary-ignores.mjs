/**
 * Boundary 검사 제외 (boundaries/no-unknown-files 오탐 방지).
 * 테스트/스펙/설정, 루트 메타 파일, 프레임워크 진입점(`src/proxy.ts`), scripts/e2e 빌드 유틸, 전역 타입,
 * 모노레포 sibling workspace로 resolve된 import 등.
 */
export const baseBoundaryIgnores = [
  "**/*.test.ts",
  "**/*.test.tsx",
  "**/*.spec.ts",
  "**/*.spec.tsx",
  "*.config.*",
  "*.ts",
  "*.d.ts",
  // Next.js 16 `src/proxy.ts`(구 middleware) — 프레임워크 진입점이라 레이어에 속하지 않음
  "src/proxy.ts",
  "types/**",
  "src/lib/types/**",
  ".kelo/**",
  "scripts/**",
  "e2e/**",
  "specs/**",
  // 모노레포 sibling workspace로 resolve된 import는 element 분류 제외
  // (resolve된 path가 cwd 밖 `../../packages/...` 형태로 들어오므로 leading `**` 필요)
  "**/packages/**",
];
