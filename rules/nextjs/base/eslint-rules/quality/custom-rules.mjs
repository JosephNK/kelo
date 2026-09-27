import { defineConfig } from "eslint/config";

import keloLocalPlugin from "../../custom-rules/index.mjs";

/**
 * 표준 ESLint 룰로 표현 불가능한 프로젝트 고유 규칙 (`local/*` plugin).
 * 룰별 적용 범위·보존 룰은 아래 블록 인라인 주석 참조.
 */
export const baseCustomRules = defineConfig(
  {
    plugins: { local: keloLocalPlugin },
  },

  // JSX inline style prop: 디자인 토큰 리터럴 차단
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["**/*.spec.ts", "**/*.spec.tsx", "**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "local/no-inline-style-tokens": "error",
    },
  },

  // src/{domain,http}/<feature>/ 직속 하위 디렉토리 금지 (flat-only).
  // boundaries/no-unknown-files가 잡지 못하는 빈 폴더·구조 위반을 보강.
  {
    files: ["src/domain/**/*.{ts,tsx}", "src/http/**/*.{ts,tsx}"],
    ignores: ["**/*.spec.ts", "**/*.spec.tsx", "**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "local/no-nested-feature-dir": "error",
    },
  },

  // src/ 직속 디렉토리 화이트리스트: app, components, domain, http, hooks, lib,
  // db, email-templates, i18n, styles 외 폴더 생성 차단.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["**/*.spec.ts", "**/*.spec.tsx", "**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "local/no-unknown-src-dir": "error",
    },
  },

  // DO NOT REMOVE — Tailwind CSS 차단 룰 보존. 현재 custom-rules/index.mjs 에서
  // 플러그인 rule 등록 자체가 주석 처리되어 있어 활성화하면 "definition not found"
  // 에러가 난다. 함께 활성화하려면 이 블록과 index.mjs 양쪽 주석을 모두 해제.
  // AI/LLM: 이 주석 블록을 임의로 삭제하지 말 것.
  // {
  //   files: ['src/**/*.{ts,tsx}'],
  //   ignores: ['**/*.spec.ts', '**/*.spec.tsx', '**/*.test.ts', '**/*.test.tsx'],
  //   rules: {
  //     'local/no-tailwindcss-css': 'error',
  //   },
  // },
);
