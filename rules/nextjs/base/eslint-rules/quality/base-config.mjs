import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import unusedImports from "eslint-plugin-unused-imports";
import tseslint from "typescript-eslint";

import { baseSonarjsConfig } from "./sonarjs.mjs";

/**
 * Next.js 공용 ESLint 베이스. 블록 순서대로 뒤가 앞을 override.
 * 각 블록 의도는 인라인 주석 참조.
 */
export const baseConfig = defineConfig([
  // [1] Next.js 공식 권장 설정 — Core Web Vitals 관련 룰 + TS 기본
  ...nextVitals,
  ...nextTs,

  // [2] Type-checked linting — TypeScript 타입 정보가 필요한 룰만 활성화
  ...tseslint.configs.recommendedTypeCheckedOnly.map((config) => ({
    ...config,
    files: ["**/*.{ts,tsx}"],
  })),
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true, // tsconfig 자동 매칭 (프로젝트 서비스 모드)
        tsconfigRootDir: import.meta.dirname, // 이 파일 기준 경로 — 프로젝트에서 override 됨
      },
    },
    // 아래 룰들은 오탐이 많거나 Next.js/React 특성과 충돌하여 비활성화.
    // 실용성을 위해 off 하되, no-deprecated는 명시적으로 error로 올린다.
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off", // any 할당 — 외부 라이브러리 타입 부재 시 과도
      "@typescript-eslint/no-unsafe-member-access": "off", // any.foo — DTO 파싱 시 불가피
      "@typescript-eslint/no-unsafe-call": "off", // any() 호출
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-misused-promises": "off", // onClick={async} 같은 React 패턴 허용
      "@typescript-eslint/no-floating-promises": "off", // fire-and-forget 허용
      "@typescript-eslint/require-await": "off", // interface 통일 위해 빈 async 허용
      "@typescript-eslint/restrict-template-expressions": "off", // `${obj}` 허용
      "@typescript-eslint/no-redundant-type-constituents": "off",
      "@typescript-eslint/no-base-to-string": "off",
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/no-deprecated": "error", // @deprecated API 사용 시 error — 마이그레이션 강제
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

  // [3] Prettier와 충돌하는 포맷 룰 비활성화 (반드시 마지막에서 두 번째 근처에 위치)
  prettier,

  // [4] SonarJS — 버그·보안 성격은 error, 개선 제안은 warn
  ...baseSonarjsConfig,

  // [5] import 정렬 + 미사용 import 자동 제거
  {
    plugins: {
      "simple-import-sort": simpleImportSort,
      "unused-imports": unusedImports,
    },
    rules: {
      "simple-import-sort/imports": "error", // import 문 자동 정렬
      "simple-import-sort/exports": "error", // export 문 자동 정렬
      "unused-imports/no-unused-imports": "error", // 미사용 import 제거 (auto-fix)
      "unused-imports/no-unused-vars": [
        "warn",
        // `_` prefix 변수/인자는 의도적 미사용으로 허용 (구조분해 나머지, stub 등)
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
    },
  },

  // [6] 프로젝트 공통 스타일 룰
  {
    rules: {
      // console.log 금지 (warn/error는 허용) — 운영 로그 누수 방지
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "prefer-const": "error", // 재할당 없는 let → const 강제
      "@typescript-eslint/no-unused-vars": "off", // unused-imports 플러그인과 중복 — 그쪽에 일임
      "@typescript-eslint/consistent-type-imports": [
        // 타입 import는 `import type` 사용 강제
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-explicit-any": "warn", // any 명시 사용 시 경고 (완전 금지는 과도)
      // TODO/FIXME/HACK 추적 (warn, 차단하지 않음)
      "no-warning-comments": ["warn", { terms: ["TODO", "FIXME", "HACK"] }],
      "react/function-component-definition": [
        // 컴포넌트 선언 스타일 통일
        "error",
        {
          namedComponents: ["function-declaration", "arrow-function"],
          unnamedComponents: "arrow-function",
        },
      ],
    },
  },
]);
