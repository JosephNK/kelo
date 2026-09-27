#!/usr/bin/env node
// =============================================================================
// Flutter 프로젝트의 jkit 분석 의존성 ref를 갱신한다.
//   - pubspec.yaml `dev_dependencies.jkit_analysis` (git) 의 ref → 새 버전
//   - analysis_options.yaml `plugins:` 의 architecture_lint / leaf_kit_lint /
//     freezed_lint 는 프로젝트 안 .jkit/plugins/ 에 vendoring 되므로 ref가 없다.
//     등록 방식을 점검해 안내만 한다 (갱신·전환은 /jkit:flutter-sync).
//
// Usage:
//   update-architecture-lint-ref.mjs <ref> --project-dir <dir> [--dry-run]
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const LINT_PACKAGE_NAMES = [
  "architecture_lint",
  "leaf_kit_lint",
  "freezed_lint",
];

const HELP = `Usage: update-architecture-lint-ref.mjs [<ref>] --project-dir <dir> [--dry-run]

모든 pubspec.yaml 의 jkit_analysis git ref 를 업데이트하고, analysis_options.yaml
plugins: 의 jkit lint 플러그인(vendoring) 상태를 점검합니다.

Arguments:
  <ref>              선택. 새로운 git ref 값 (예: v0.3.1, 0.3.1, main).
                     생략 시 .claude-plugin/plugin.json 의 version 을 사용.

Options:
  --project-dir <dir>  프로젝트 루트 디렉토리 (required)
  --dry-run            실제 변경 없이 변경될 내용만 출력
  -h, --help           Show this help
`;

function usage(code = 1) {
  (code === 0 ? process.stdout : process.stderr).write(HELP);
  process.exit(code);
}

function parseArgs(argv) {
  const args = { ref: null, projectDir: "", dryRun: false };
  const positional = [];
  const rest = argv.slice(2);

  while (rest.length > 0) {
    const a = rest.shift();
    switch (a) {
      case "--project-dir":
        if (!rest.length) {
          process.stderr.write("--project-dir requires a value\n");
          usage();
        }
        args.projectDir = rest.shift();
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "-h":
      case "--help":
        usage(0);
        break;
      default:
        if (a.startsWith("-")) {
          process.stderr.write(`Unknown option: ${a}\n`);
          usage();
        }
        positional.push(a);
    }
  }

  if (positional.length > 1) {
    process.stderr.write(
      `Error: unexpected extra arguments: ${positional.slice(1).join(" ")}\n`,
    );
    usage();
  }
  if (positional.length === 1) {
    args.ref = positional[0];
  }

  if (!args.projectDir) {
    process.stderr.write("Error: --project-dir is required\n");
    usage();
  }

  return args;
}

function normalizeRef(ref) {
  if (ref.startsWith("v") || !/^[0-9]/.test(ref[0])) {
    return ref;
  }
  return `v${ref}`;
}

function resolvePluginVersion() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const pluginRoot = path.resolve(scriptDir, "..", "..", "..");
  const pluginJson = path.join(pluginRoot, ".claude-plugin", "plugin.json");

  if (!fs.existsSync(pluginJson) || !fs.statSync(pluginJson).isFile()) {
    process.stderr.write(`plugin.json을 찾을 수 없습니다: ${pluginJson}\n`);
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(pluginJson, "utf-8"));
  } catch (exc) {
    process.stderr.write(`plugin.json 파싱 실패: ${exc.message}\n`);
    process.exit(1);
  }

  const version = data.version;
  if (typeof version !== "string" || !version) {
    process.stderr.write("plugin.json의 version 필드가 비어 있습니다.\n");
    process.exit(1);
  }
  return normalizeRef(version);
}

function findFiles(projectRoot, fileName) {
  const results = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (
        entry.name.startsWith(".") ||
        entry.name === "build" ||
        entry.name === "node_modules"
      ) {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name === fileName) results.push(full);
    }
  };
  walk(projectRoot);
  return results.sort();
}

// pubspec.yaml dev_dependencies.jkit_analysis.git.ref 갱신
function updateJkitAnalysisRef(pubspecPath, newRef, dryRun) {
  const doc = YAML.parseDocument(fs.readFileSync(pubspecPath, "utf-8"));
  if (doc.contents === null) return 0;
  const gitNode = doc.getIn(["dev_dependencies", "jkit_analysis", "git"]);
  if (!YAML.isMap(gitNode)) return 0;

  const refNode = gitNode.get("ref", true);
  const oldRef = YAML.isScalar(refNode) ? String(refNode.value) : null;
  if (oldRef === newRef) {
    process.stdout.write(
      `  ⏭️  ${pubspecPath} [jkit_analysis]: 이미 동일한 ref (${oldRef})\n`,
    );
    return 0;
  }
  if (YAML.isScalar(refNode)) refNode.value = newRef;
  else gitNode.set("ref", newRef);

  const mark = dryRun ? "🔍" : "✅";
  process.stdout.write(
    `  ${mark} ${pubspecPath} [jkit_analysis]: ${oldRef ?? "(없음)"} → ${newRef}${dryRun ? " (dry-run)" : ""}\n`,
  );
  if (!dryRun) fs.writeFileSync(pubspecPath, String(doc));
  return 1;
}

// analysis_options.yaml plugins: 의 jkit 플러그인 등록 방식 점검 (수정하지 않음)
function reportLintPlugins(analysisPath) {
  const doc = YAML.parseDocument(fs.readFileSync(analysisPath, "utf-8"));
  const plugins = doc.contents === null ? null : doc.get("plugins");
  if (!YAML.isMap(plugins)) return 0;
  let legacy = 0;
  for (const pkgName of LINT_PACKAGE_NAMES) {
    const entry = plugins.get(pkgName);
    if (!YAML.isMap(entry)) continue;
    const p = entry.get("path");
    if (typeof p === "string" && !path.isAbsolute(p)) {
      process.stdout.write(
        `  📦 ${analysisPath} [${pkgName}]: vendoring (${p}) — 규칙 갱신은 /jkit:flutter-sync\n`,
      );
    } else {
      legacy += 1;
      const how = entry.get("git") ? "git" : `절대 경로 ${p}`;
      process.stdout.write(
        `  ⚠️  ${analysisPath} [${pkgName}]: 레거시 등록(${how}) — 다른 PC/CI에서 동작하지 않음. /jkit:flutter-sync로 vendoring 전환 필요\n`,
      );
    }
  }
  return legacy;
}

function main() {
  const args = parseArgs(process.argv);

  let ref;
  let refSource;
  if (args.ref === null) {
    ref = resolvePluginVersion();
    refSource = "plugin.json 자동 감지";
  } else {
    ref = normalizeRef(args.ref);
    refSource = "CLI 인자";
  }
  const projectRoot = path.resolve(args.projectDir);

  process.stdout.write(`프로젝트 루트: ${projectRoot}\n`);
  process.stdout.write(`새 ref: ${ref} (${refSource})\n`);
  if (args.dryRun) process.stdout.write("(dry-run 모드)\n");
  process.stdout.write("\n");

  const pubspecs = findFiles(projectRoot, "pubspec.yaml");
  process.stdout.write(`발견된 pubspec.yaml: ${pubspecs.length}개\n\n`);
  let updatedCount = 0;
  for (const file of pubspecs) {
    updatedCount += updateJkitAnalysisRef(file, ref, args.dryRun);
  }

  process.stdout.write("\n");
  if (updatedCount === 0) {
    process.stdout.write("변경된 jkit_analysis ref가 없습니다.\n");
  } else {
    const action = args.dryRun ? "변경 예정" : "업데이트 완료";
    process.stdout.write(`${updatedCount}개 항목 ${action}\n`);
  }

  process.stdout.write("\n플러그인 점검 (analysis_options.yaml plugins:)\n");
  let legacy = 0;
  for (const file of findFiles(projectRoot, "analysis_options.yaml")) {
    legacy += reportLintPlugins(file);
  }
  if (legacy > 0) {
    process.stdout.write(
      `\n레거시 등록 ${legacy}건 — /jkit:flutter-sync를 실행해 .jkit/plugins/ vendoring으로 전환하세요.\n`,
    );
  }
}

main();
