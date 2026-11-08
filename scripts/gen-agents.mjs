#!/usr/bin/env node
// =============================================================================
// Generates AGENTS.md from rules/<framework>/base/agents.template.md and
// writes CLAUDE.md that imports it (`@AGENTS.md`) — a plain file, not a
// symlink, so it also works where git checks symlinks out as text (Windows).
//
// Usage:
//   gen-agents.mjs <framework> -p <output-dir> [-n <project-name>] [--docs-dir <dir>]
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { ensureGitRepo, normalizePath } from "./common.mjs";

const HELP = `Usage: gen-agents.mjs <framework> -p <output-dir> [-n <project-name>] [--docs-dir <dir>]

Generates AGENTS.md and CLAUDE.md (@AGENTS.md import).

Arguments:
  <framework>    Framework name (e.g. nextjs, nestjs, flutter)

Options:
  -p <dir>           Output directory (required)
  -n <name>          Project name (default: directory name)
  --docs-dir <dir>   Docs directory prefix for reference paths (default: root)
  -h, --help         Show this help

Examples:
  ./scripts/gen-agents.mjs nextjs -p . -n "My Project"
  ./scripts/gen-agents.mjs nextjs -p . -n "My Project" --docs-dir docs
  ./scripts/gen-agents.mjs nestjs -p .
  ./scripts/gen-agents.mjs flutter -p .
`;

function usage(code = 1) {
  (code === 0 ? process.stdout : process.stderr).write(HELP);
  process.exit(code);
}

function parseArgs(argv) {
  const args = {
    framework: "",
    outputDir: "",
    projectName: "",
    docsDir: "",
  };
  const rest = argv.slice(2);

  if (rest.length >= 1 && !rest[0].startsWith("-")) {
    args.framework = rest.shift();
  }

  while (rest.length > 0) {
    const a = rest.shift();
    switch (a) {
      case "-p":
        if (!rest.length) {
          process.stderr.write("-p requires a directory\n");
          usage();
        }
        args.outputDir = rest.shift();
        break;
      case "-n":
        if (!rest.length) {
          process.stderr.write("-n requires a project name\n");
          usage();
        }
        args.projectName = rest.shift();
        break;
      case "--docs-dir":
        if (!rest.length) {
          process.stderr.write("--docs-dir requires a directory\n");
          usage();
        }
        args.docsDir = rest.shift();
        break;
      case "-h":
      case "--help":
        usage(0);
        break;
      default:
        process.stderr.write(`Unknown option: ${a}\n`);
        usage();
    }
  }

  if (!args.framework) {
    process.stderr.write("Error: framework is required\n");
    usage();
  }
  if (!args.outputDir) {
    process.stderr.write("Error: -p <output-dir> is required\n");
    usage();
  }

  return args;
}

function renderTemplate(template, { projectName, docsDir }) {
  return template
    .replaceAll("{{PROJECT_NAME}}", projectName)
    .replaceAll("{{DOCS_DIR}}", docsDir);
}

function renderProjectTemplate({ projectName }) {
  return `# ${projectName} — Project-specific

> 프로젝트 가이드를 작성하세요.

### Required Reading

<!-- 예:
- [Doc Title](docs/PATH.md) — **MUST read when <조건>**
-->
`;
}

// CLAUDE.md는 AGENTS.md를 import하는 한 줄짜리 파일. 기존 파일·심볼릭 링크는
// 먼저 지운다 (링크 위에 쓰면 링크 대상인 AGENTS.md가 덮어써진다).
function writeClaudeImport(filePath) {
  if (fs.lstatSync(filePath, { throwIfNoEntry: false })) {
    fs.rmSync(filePath, { force: true });
  }
  fs.writeFileSync(filePath, "@AGENTS.md\n");
}

function main() {
  const args = parseArgs(process.argv);

  // -p must point at a git repo root. AGENTS.md/CLAUDE.md live at the project
  // root — refuse to write them into a subdirectory.
  try {
    ensureGitRepo(args.outputDir);
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }

  let outputDir;
  try {
    outputDir = normalizePath(args.outputDir);
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }

  const docsDir = args.docsDir ? `${args.docsDir.replace(/\/+$/, "")}/` : "";
  const projectName = args.projectName || path.basename(outputDir);

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const pluginRoot = path.resolve(scriptDir, "..");
  const templatePath = path.join(
    pluginRoot,
    "rules",
    args.framework,
    "base",
    "agents.template.md",
  );

  if (!fs.existsSync(templatePath)) {
    process.stderr.write(`Error: Template not found: ${templatePath}\n`);
    process.exit(1);
  }

  fs.mkdirSync(outputDir, { recursive: true });

  const outputFile = path.join(outputDir, "AGENTS.md");
  const template = fs.readFileSync(templatePath, "utf8");
  const rendered = renderTemplate(template, { projectName, docsDir });
  fs.writeFileSync(outputFile, rendered);

  const claudeFile = path.join(outputDir, "CLAUDE.md");
  writeClaudeImport(claudeFile);

  process.stdout.write(`Generated: ${outputFile}\n`);
  process.stdout.write(`Generated: ${claudeFile} (@AGENTS.md)\n`);

  // AGENTS.PROJECT.md is user-owned. Create it only when missing so subsequent
  // runs preserve user edits.
  const projectFile = path.join(outputDir, "AGENTS.PROJECT.md");
  if (fs.existsSync(projectFile)) {
    process.stdout.write(`Preserved: ${projectFile} (user-owned, untouched)\n`);
  } else {
    fs.writeFileSync(projectFile, renderProjectTemplate({ projectName }));
    process.stdout.write(`Generated: ${projectFile} (user-owned)\n`);
  }
}

main();
