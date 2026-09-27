#!/usr/bin/env node
// kelo-lint-nestjs — 프로젝트의 eslint.config.mjs를 무시하고 kelo 규칙으로 검사 (CI/pre-commit용)

import { fileURLToPath } from "node:url";

import { nestjs } from "../index.mjs";
import { runLintCli } from "../lib/run-lint-cli.mjs";

await runLintCli({
  binName: "kelo-lint-nestjs",
  factory: nestjs,
  formatterPath: fileURLToPath(
    new URL("../base/eslint.formatter.mjs", import.meta.url),
  ),
});
