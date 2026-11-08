// =============================================================================
// kelo doctor — setup 이후 각 프로젝트의 lint를 돌려 요약한다 (kelo.mjs doctor).
//
// - Next.js/NestJS: `kelo-lint-<fw> --format json` → 오류·경고 수, 경계 위반 수,
//   상위 규칙, 미분류 파일(local/no-unknown-files)을 폴더별로 묶고
//   rules/<fw>/doctor.yaml의 힌트로 옮길 위치를 제안한다 (파일은 옮기지 않는다).
// - Flutter: `dart analyze --format=machine` → 심각도별 수와 상위 코드.
// =============================================================================

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import YAML from "yaml";

const BOUNDARY_RULES = new Set([
  "boundaries/dependencies",
  "local/no-unknown-dependencies",
]);
const UNKNOWN_FILE_RULE = "local/no-unknown-files";
const TOP_N = 5;
const DEFAULT_HINT =
  "docs/ARCHITECTURE.md 트리에서 맞는 레이어 위치를 찾으세요";

/** `**`(여러 세그먼트)·`*`(한 세그먼트)만 쓰는 간단한 glob → RegExp. */
export function globToRegExp(glob) {
  const body = glob
    .split("**")
    .map((part) =>
      part
        .split("*")
        .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
        .join("[^/]*"),
    )
    .join(".*");
  return new RegExp(`^${body}$`);
}

export function loadHints(pluginRoot, framework) {
  const file = path.join(pluginRoot, "rules", framework, "doctor.yaml");
  if (!fs.existsSync(file)) return [];
  const { hints = [] } = YAML.parse(fs.readFileSync(file, "utf8")) ?? {};
  return hints.map((h) => ({ ...h, re: globToRegExp(h.match) }));
}

function topCounts(counter) {
  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N)
    .map(([id, count]) => ({ id, count }));
}

function runEslintProject(project, hints) {
  const bin = `kelo-lint-${project.framework}`;
  const res = spawnSync("npx", ["--no-install", bin, "--format", "json"], {
    cwd: project.dir,
    encoding: "utf8",
    env: { ...process.env, PWD: project.dir },
    maxBuffer: 256 * 1024 * 1024,
  });
  let results;
  try {
    results = JSON.parse(res.stdout);
  } catch {
    return {
      failed: `${bin} 실행 실패 (exit ${res.status}): ${(res.stderr || res.stdout || "").trim().split("\n").slice(-3).join(" / ")}`,
    };
  }

  let errors = 0;
  let warnings = 0;
  let boundary = 0;
  const rules = new Map();
  const unknownByDir = new Map();
  for (const result of results) {
    const rel = path
      .relative(project.dir, result.filePath)
      .split(path.sep)
      .join("/");
    for (const m of result.messages) {
      if (m.severity === 2) errors++;
      else warnings++;
      const id = m.ruleId ?? "(parse)";
      rules.set(id, (rules.get(id) ?? 0) + 1);
      if (BOUNDARY_RULES.has(id)) boundary++;
      if (id === UNKNOWN_FILE_RULE) {
        const dir = path.posix.dirname(rel);
        const entry = unknownByDir.get(dir) ?? { dir, files: [] };
        entry.files.push(rel);
        unknownByDir.set(dir, entry);
      }
    }
  }
  const unknown = [...unknownByDir.values()]
    .sort((a, b) => b.files.length - a.files.length)
    .map(({ dir, files }) => ({
      dir,
      count: files.length,
      suggest: hints.find((h) => h.re.test(files[0]))?.suggest ?? DEFAULT_HINT,
    }));
  return {
    errors,
    warnings,
    boundary,
    unknownFiles: unknown.reduce((n, u) => n + u.count, 0),
    topRules: topCounts(rules),
    unknown,
  };
}

function runFlutterProject(project) {
  const dir = path.join(project.dir, project.entryDir ?? ".");
  const res = spawnSync("dart", ["analyze", "--format=machine", "."], {
    cwd: dir,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (res.error) return { failed: `dart 실행 실패: ${res.error.message}` };
  // SEVERITY|TYPE|CODE|FILE|LINE|COL|LEN|MESSAGE (stderr에 출력됨)
  const lines = `${res.stdout}\n${res.stderr}`
    .split("\n")
    .filter((l) => /^(ERROR|WARNING|INFO)\|/.test(l));
  const severity = { ERROR: 0, WARNING: 0, INFO: 0 };
  const codes = new Map();
  for (const line of lines) {
    const [sev, , code] = line.split("|");
    severity[sev]++;
    const id = code.toLowerCase();
    codes.set(id, (codes.get(id) ?? 0) + 1);
  }
  return {
    errors: severity.ERROR,
    warnings: severity.WARNING,
    infos: severity.INFO,
    topRules: topCounts(codes),
  };
}

function formatReport(label, project, r) {
  const out = [`\n▶ ${label} (${project.framework})`];
  if (r.failed) return [...out, `  ✖ ${r.failed}`].join("\n");
  const counts = [`error ${r.errors}`, `warn ${r.warnings}`];
  if (r.infos !== undefined) counts.push(`info ${r.infos}`);
  if (r.boundary !== undefined) counts.push(`경계 위반 ${r.boundary}`);
  if (r.unknownFiles !== undefined)
    counts.push(`미분류 파일 ${r.unknownFiles}`);
  out.push(`  ${counts.join(" · ")}`);
  if (r.topRules.length)
    out.push(
      `  상위 규칙: ${r.topRules.map((t) => `${t.id} ${t.count}`).join(", ")}`,
    );
  if (r.unknown?.length) {
    out.push("  미분류 파일 (폴더별, 제안 위치):");
    for (const u of r.unknown)
      out.push(`    ${u.dir}/ (${u.count}) → ${u.suggest}`);
  }
  return out.join("\n");
}

/**
 * @returns {number} 종료 코드 — 어느 프로젝트든 error가 있거나 실행 실패면 1
 */
export function doctor(config, { json, pluginRoot }) {
  const reports = config.workspaces.map((project) => {
    const label = config.mode === "single" ? project.name : project.path;
    const result =
      project.framework === "flutter"
        ? runFlutterProject(project)
        : runEslintProject(project, loadHints(pluginRoot, project.framework));
    return { label, project, result };
  });

  if (json) {
    process.stdout.write(
      JSON.stringify(
        reports.map(({ label, project, result }) => ({
          path: label,
          framework: project.framework,
          ...result,
        })),
        null,
        2,
      ) + "\n",
    );
  } else {
    process.stdout.write(`kelo doctor — ${config.mode} @ ${config.root}\n`);
    for (const { label, project, result } of reports)
      process.stdout.write(formatReport(label, project, result) + "\n");
  }
  return reports.some(({ result }) => result.failed || result.errors > 0)
    ? 1
    : 0;
}
