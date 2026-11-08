import { defineConfig } from "eslint/config";
import eslint from "@eslint/js";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import unusedImports from "eslint-plugin-unused-imports";
import globals from "globals";
import tseslint from "typescript-eslint";

import { baseSonarjsConfig } from "./sonarjs.mjs";

/**
 * NestJS 공용 ESLint 베이스. 블록 순서대로 뒤가 앞을 override.
 * 각 블록 의도는 인라인 주석 참조.
 */
export const baseConfig = defineConfig(
  // [1~3] 공식 권장 설정 체인
  eslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,

  // [4] 환경 설정 — Node.js + Jest 글로벌 활성화
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: "commonjs", // NestJS CLI 기본이 CommonJS
      parserOptions: {
        projectService: true, // tsconfig 자동 매칭
        tsconfigRootDir: import.meta.dirname, // 프로젝트에서 override 됨
      },
    },
  },

  // [5] Import 정렬 + 미사용 import 자동 제거
  {
    plugins: {
      "simple-import-sort": simpleImportSort,
      "unused-imports": unusedImports,
    },
    rules: {
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        // _ prefix는 의도적 미사용 허용
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
    },
  },

  // [5-1] SonarJS — 버그·보안 성격은 error, 개선 제안은 warn
  ...baseSonarjsConfig,

  // [6] 프로젝트 공통 스타일 룰
  {
    rules: {
      "prefer-const": "error",
      // NestJS 데코레이터/런타임 리플렉션과 any 사용이 잦아 off
      "@typescript-eslint/no-explicit-any": "off",
      // Promise 반환 누락 감지 (warn) — fire-and-forget은 명시적 void 처리 권장
      "@typescript-eslint/no-floating-promises": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
      // unused-imports 플러그인이 담당하므로 중복 방지
      "@typescript-eslint/no-unused-vars": "off",
      // 타입 import는 `import type` 강제 (런타임 번들 축소)
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      // TODO/FIXME/HACK 추적 (warn, 차단하지 않음)
      "no-warning-comments": ["warn", { terms: ["TODO", "FIXME", "HACK"] }],
      // 줄바꿈 LF/CRLF OS별 자동 매칭 (Windows 팀원 호환)
      "prettier/prettier": ["error", { endOfLine: "auto" }],
      // TypeScript 5.x가 `Error`를 lib.es5.d.ts + lib.es2022.error.d.ts 두 파일에
      // declaration merging으로 분산 정의하면서, typescript-eslint 8.x의 builtin symbol
      // 인식 로직이 이 multi-declaration 패턴을 완전히 처리하지 못한다. 결과:
      // 모든 `throw new Error(...)`가 차단됨. `allow`로 Error 글로벌을 명시 허용해
      // 룰 의도(non-Error throw 차단)는 유지하면서 환경 이슈만 우회.
      "@typescript-eslint/only-throw-error": [
        "error",
        { allow: [{ from: "lib", name: "Error" }] },
      ],
    },
  },

  // [7] 테스트 파일 완화
  // 단위 테스트에서 mock/stub으로 타입 안전성을 의도적으로 깨뜨리는 패턴을 허용
  {
    files: ["**/*.spec.ts", "test/**/*.ts"],
    rules: {
      "@typescript-eslint/unbound-method": "off", // Jest spy 사용 시 빈번
      "@typescript-eslint/no-require-imports": "off", // require() mock
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
    },
  },
);
