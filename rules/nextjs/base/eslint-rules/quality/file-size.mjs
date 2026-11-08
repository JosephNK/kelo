import { defineConfig } from "eslint/config";

/**
 * 파일당 800줄 제한 (warn) — 단일 책임 위반 신호.
 * 테스트 파일과 코드 생성 산출물(`src/http/_generated/**`, `*.generated.ts`)은 제외.
 */
export const baseFileSizeRules = defineConfig({
  files: ["src/**/*.{ts,tsx}"],
  ignores: [
    "**/*.{test,spec}.{ts,tsx}",
    "src/http/_generated/**",
    "**/*.generated.ts",
  ],
  rules: {
    "max-lines": [
      "warn",
      { max: 800, skipBlankLines: true, skipComments: true },
    ],
  },
});
