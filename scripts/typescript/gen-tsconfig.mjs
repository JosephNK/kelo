#!/usr/bin/env node
// =============================================================================
// Patches an existing tsconfig.json with framework-specific settings.
//
// For each patch file (base + selected stacks):
//   - compilerOptions : deep-merge one level (objects spread, scalars replace)
//   - includeAdd      : dedupe-append to `include`
//   - extraFiles      : write sibling JSON files (skip if already present)
//
// Usage:
//   gen-tsconfig.mjs <framework> -p <output-dir> [--with stack1,stack2,...]
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const HELP = `Usage: gen-tsconfig.mjs <framework> -p <output-dir> [--with stack1,stack2,...]

Patches existing tsconfig.json with framework-specific settings.
If tsconfig.json does not exist, reports an error.

Arguments:
  <framework>    Framework name (e.g. nextjs, nestjs)

Options:
  -p <dir>       Project directory containing tsconfig.json (required)
  --with <list>  Comma-separated stack names (e.g. typeorm)
  -h, --help     Show this help

Examples:
  ./scripts/typescript/gen-tsconfig.mjs nextjs -p ./my-project
  ./scripts/typescript/gen-tsconfig.mjs nestjs -p ./my-project --with typeorm
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

function applyPatch(tsconfig, patch, dir) {
  if (patch.compilerOptions) {
    tsconfig.compilerOptions = tsconfig.compilerOptions || {};
    for (const [key, value] of Object.entries(patch.compilerOptions)) {
      if (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value)
      ) {
        tsconfig.compilerOptions[key] = {
          ...tsconfig.compilerOptions[key],
          ...value,
        };
      } else {
        tsconfig.compilerOptions[key] = value;
      }
    }
  }

  if (Array.isArray(patch.includeAdd) && patch.includeAdd.length > 0) {
    tsconfig.include = tsconfig.include || [];
    for (const item of patch.includeAdd) {
      if (!tsconfig.include.includes(item)) {
        tsconfig.include.push(item);
      }
    }
  }

  if (patch.extraFiles) {
    for (const [filename, content] of Object.entries(patch.extraFiles)) {
      const filePath = path.join(dir, filename);
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(content, null, 2) + "\n");
        process.stdout.write(`Created: ${filePath}\n`);
      } else {
        process.stdout.write(`Skipped (exists): ${filePath}\n`);
      }
    }
  }
}

function main() {
  const args = parseArgs(process.argv);

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const pluginRoot = path.resolve(scriptDir, "..", "..");
  const patchFile = path.join(
    pluginRoot,
    "rules",
    args.framework,
    "base",
    "tsconfig.patch.json",
  );
  const tsconfigPath = path.join(args.outputDir, "tsconfig.json");

  if (!fs.existsSync(patchFile)) {
    process.stderr.write(`Error: Patch file not found: ${patchFile}\n`);
    process.exit(1);
  }

  if (!fs.existsSync(tsconfigPath)) {
    process.stderr.write(`Error: tsconfig.json not found: ${tsconfigPath}\n`);
    process.stderr.write(
      "Run your framework's init command first (e.g. npx create-next-app, nest new)\n",
    );
    process.exit(1);
  }

  const patchFiles = [patchFile];
  for (const stack of splitStacks(args.stacks)) {
    const stackPatch = path.join(
      pluginRoot,
      "rules",
      args.framework,
      stack,
      "tsconfig.patch.json",
    );
    if (fs.existsSync(stackPatch)) {
      patchFiles.push(stackPatch);
    } else {
      process.stderr.write(
        `Warning: No tsconfig patch for stack '${stack}', skipping\n`,
      );
    }
  }

  const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, "utf8"));
  const before = JSON.stringify(tsconfig);
  const dir = path.dirname(tsconfigPath);

  for (const pf of patchFiles) {
    const patch = JSON.parse(fs.readFileSync(pf, "utf8"));
    applyPatch(tsconfig, patch, dir);
  }

  // 값이 그대로면 다시 쓰지 않는다 — 다시 쓰면 prettier가 맞춘 서식(한 줄 배열 등)이 setup마다 풀린다.
  if (JSON.stringify(tsconfig) === before) {
    process.stdout.write(`Unchanged: ${tsconfigPath}\n`);
    return;
  }

  fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2) + "\n");
  process.stdout.write(`Patched: ${tsconfigPath}\n`);
}

main();
