import { globalIgnores } from "eslint/config";

/**
 * ESLint가 아예 읽지 않을 경로 (빌드 산출물, 자동 생성 타입, 툴체인 작업 공간).
 * 루트 flat-config `.mjs`(eslint/prettier/commitlint)는 tsconfig include 밖이라
 * type-aware 파싱(projectService) 대상에서 제외 — lint-staged `*.mjs` glob이
 * basename 매칭으로 잡아도 parsing error가 나지 않게 한다.
 * `src/http/_generated/**`·`specs/**`·`src/theme.generated.ts`는 generator가 매 실행
 * 시 덮어쓰는 산출물이라 lint 대상에서 제외 (다른 파일이 import할 때 boundary
 * 패턴 매칭은 그대로 유효 — globalIgnores는 대상 파일 자체의 lint만 끈다).
 */
export const baseIgnores = globalIgnores([
  "eslint.config.mjs",
  "eslint.project.config.mjs",
  "prettier.config.mjs",
  "commitlint.config.mjs",
  ".next/**",
  "out/**",
  "build/**",
  "coverage/**",
  "next-env.d.ts",
  ".kelo/**",
  "src/http/_generated/**",
  "src/theme.generated.ts",
  "specs/**",
]);
