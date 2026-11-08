import { defineConfig } from "eslint/config";

import { baseImportResolverSettings } from "../settings/import-resolver-settings.mjs";

/**
 * import/no-cycle — 순환 의존성 감지 (warn).
 * 옵션: maxDepth 10 (성능 균형), ignoreExternal (node_modules 제외). `import` 플러그인은 eslint-config-next가 등록한 것을 쓴다.
 */
export const baseImportCycleRules = defineConfig({
  files: ["src/**/*.{ts,tsx}"],
  ignores: ["**/*.spec.{ts,tsx}", "**/*.test.{ts,tsx}"],
  settings: {
    ...baseImportResolverSettings,
  },
  rules: {
    "import/no-cycle": ["warn", { maxDepth: 10, ignoreExternal: true }],
  },
});
