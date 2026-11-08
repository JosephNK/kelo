#!/usr/bin/env node
// =============================================================================
// Concatenates rules/<framework>/base/lint-rules-reference.md and
// lint-rules-structure-reference.md (and stylelint-rules-reference.md for
// Next.js), then appends each `--with` stack's lint-rules-reference.md, into
// <output-dir>/LINT.md.
//
// Missing stack files produce a warning; the run does not fail.
//
// Usage:
//   gen-lint.mjs <framework> -p <output-dir> [--with stack1,stack2,...]
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { ensureGitRepo, normalizePath } from "./common.mjs";

const HELP = `Usage: gen-lint.mjs <framework> -p <output-dir> [--with stack1,stack2,...]

Concatenates base/lint-rules-reference.md + lint-rules-structure-reference.md
(+ stylelint-rules-reference.md for nextjs) and each --with stack's
lint-rules-reference.md into <output-dir>/LINT.md.

Arguments:
  <framework>    Framework name (nextjs, nestjs, flutter)

Options:
  -p <dir>       Output directory (required)
  --with <list>  Comma-separated stack names with lint-rules-reference.md (Flutter: leaf-kit, freezed)
  -h, --help     Show this help

Examples:
  ./scripts/gen-lint.mjs nextjs -p ./my-project/docs
  ./scripts/gen-lint.mjs nestjs -p ./my-project/docs
  ./scripts/gen-lint.mjs flutter -p ./my-project/docs --with leaf-kit,freezed
`;

function usage(code = 1) {
  (code === 0 ? process.stdout : process.stderr).write(HELP);
  process.exit(code);
}

function parseArgs(argv) {
  const args = { framework: "", outputDir: "", stacks: "" };
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
      case "--with":
        if (!rest.length) {
          process.stderr.write("--with requires a stack list\n");
          usage();
        }
        args.stacks = rest.shift();
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

function splitStacks(raw) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function stripGeneratorBanner(content) {
  const lines = content.split("\n");
  let i = 0;
  while (i < lines.length && /^<!--.*-->\s*$/.test(lines[i])) i++;
  while (i < lines.length && lines[i].trim() === "") i++;
  return lines.slice(i).join("\n");
}

function main() {
  const args = parseArgs(process.argv);

  try {
    ensureGitRepo(".");
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }

  fs.mkdirSync(args.outputDir, { recursive: true });

  let outputDir;
  try {
    outputDir = normalizePath(args.outputDir);
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const pluginRoot = path.resolve(scriptDir, "..");
  const rulesDir = path.join(pluginRoot, "rules", args.framework);
  const baseDir = path.join(rulesDir, "base");

  const baseSources = [
    "lint-rules-reference.md",
    "lint-rules-structure-reference.md",
  ];
  if (args.framework === "nextjs") {
    baseSources.push("stylelint-rules-reference.md");
  }

  for (const name of baseSources) {
    const p = path.join(baseDir, name);
    if (!fs.existsSync(p)) {
      process.stderr.write(`Error: source not found: ${p}\n`);
      process.exit(1);
    }
  }

  const outputFile = path.join(outputDir, "LINT.md");
  const [first, ...rest] = baseSources;
  fs.writeFileSync(
    outputFile,
    stripGeneratorBanner(fs.readFileSync(path.join(baseDir, first), "utf8")),
  );

  for (const name of rest) {
    fs.appendFileSync(outputFile, "\n");
    fs.appendFileSync(
      outputFile,
      stripGeneratorBanner(fs.readFileSync(path.join(baseDir, name), "utf8")),
    );
  }

  const appendedStacks = [];
  for (const stack of splitStacks(args.stacks)) {
    const stackRef = path.join(rulesDir, stack, "lint-rules-reference.md");
    if (!fs.existsSync(stackRef)) {
      process.stderr.write(
        `Warning: lint-rules-reference.md not found for stack '${stack}': ${stackRef}\n`,
      );
      continue;
    }
    fs.appendFileSync(outputFile, "\n");
    fs.appendFileSync(
      outputFile,
      stripGeneratorBanner(fs.readFileSync(stackRef, "utf8")),
    );
    appendedStacks.push(stack);
  }

  process.stdout.write(`Generated: ${outputFile}\n`);
  process.stdout.write(`Base sources: ${baseSources.join(", ")}\n`);
  if (appendedStacks.length) {
    process.stdout.write(`Stacks: ${appendedStacks.join(", ")}\n`);
  }
}

main();
