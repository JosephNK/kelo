/**
 * Boundary 검사 제외 — 테스트, DI 조립(*.module.ts), 부트스트랩(main/app),
 * 헬스체크, 모듈 내부 common, 빌드/유틸 스크립트(scripts/), 모노레포 sibling
 * workspace로 resolve된 import.
 */
export const baseBoundaryIgnores = [
  "**/*.spec.ts",
  "**/*.test.ts",
  "**/*.module.ts",
  "src/main.ts",
  "src/app.*.ts",
  "src/test/**",
  "src/modules/health/**",
  "src/modules/**/common/**",
  "test/**",
  "scripts/**",
  ".kelo/**",
  // 모노레포 sibling workspace로 resolve된 import는 element 분류 제외
  // (resolve된 path가 cwd 밖 `../../packages/...` 형태로 들어오므로 leading `**` 필요)
  "**/packages/**",
];
