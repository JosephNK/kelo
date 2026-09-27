import { globalIgnores } from "eslint/config";

/**
 * ESLint가 아예 읽지 않을 경로 (자체 설정, kelo 주입 룰, 빌드 산출물).
 * 루트 flat-config `.mjs`(eslint/prettier/commitlint)는 tsconfig include 밖이라
 * type-aware 파싱(projectService) 대상에서 제외 — lint-staged `*.mjs` glob이
 * basename 매칭으로 잡아도 parsing error가 나지 않게 한다.
 * TypeORM 마이그레이션 파일은 generated 성격이라 boundary/룰 검사에서 제외한다.
 */
export const baseIgnores = globalIgnores([
  "eslint.config.mjs",
  "eslint.project.config.mjs",
  "prettier.config.mjs",
  "commitlint.config.mjs",
  "eslint-rules/**",
  "dist/**",
  "coverage/**",
  ".kelo/**",
  "migrations/**",
]);
