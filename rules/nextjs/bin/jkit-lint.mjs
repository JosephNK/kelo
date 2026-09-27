#!/usr/bin/env node
// jkit-lint-nextjs — 프로젝트의 eslint.config.mjs를 무시하고 jkit 규칙으로 검사 (CI/pre-commit용)

import { fileURLToPath } from "node:url";

import { nextjs } from "../index.mjs";
import { runLintCli } from "../lib/run-lint-cli.mjs";

await runLintCli({
  binName: "jkit-lint-nextjs",
  factory: nextjs,
  formatterPath: fileURLToPath(
    new URL("../base/eslint.formatter.mjs", import.meta.url),
  ),
});
