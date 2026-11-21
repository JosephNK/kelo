#!/usr/bin/env node
// =============================================================================
// example/ 프로젝트의 kelo ESLint 설정 의존성을 지정 버전으로 맞추고 lockfile을
// 각 패키지 매니저로 다시 만든다. deploy.mjs가 npm publish 직후 호출한다.
//
// Usage:
//   node scripts/sync-example-versions.mjs <version>
// =============================================================================

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const HELP = `Usage: node scripts/sync-example-versions.mjs <version>

Pins eslint-config-kelo-{nextjs,nestjs} in example/ to <version> and regenerates
the lockfiles (lifecycle scripts are never run):
  - example/nextjs       package.json + package-lock.json  (npm --package-lock-only)
  - example/nestjs       package.json + yarn.lock          (yarn, node_modules in a temp dir)
  - example/nx-monorepo  apps/{admin,api}/package.json + pnpm-lock.yaml
                         (scripts/pack-kelo-local.sh, then pnpm --lockfile-only)

<version> must already be on the npm registry, and rules/{nextjs,nestjs}/package.json
must be at <version> (nx-monorepo packs the local checkout).
On failure every file this script touched is restored. Nothing is committed.
`;

const NEXTJS = "eslint-config-kelo-nextjs";
const NESTJS = "eslint-config-kelo-nestjs";

export const EXAMPLE_TARGETS = [
  {
    dir: "example/nextjs",
    manager: "npm",
    manifests: [{ file: "package.json", pkg: NEXTJS }],
    lockfile: "package-lock.json",
  },
  {
    dir: "example/nestjs",
    manager: "yarn",
    manifests: [{ file: "package.json", pkg: NESTJS }],
    lockfile: "yarn.lock",
  },
  {
    dir: "example/nx-monorepo",
    manager: "pnpm",
    manifests: [
      { file: "apps/admin/package.json", pkg: NEXTJS },
      { file: "apps/api/package.json", pkg: NESTJS },
    ],
    lockfile: "pnpm-lock.yaml",
  },
];

// nx-monorepo는 로컬 체크아웃을 tarball로 묶어 설치한다 (pnpm-workspace.yaml overrides).
const LOCAL_PACKAGE_DIRS = {
  [NEXTJS]: "rules/nextjs",
  [NESTJS]: "rules/nestjs",
};

const DEP_FIELDS = ["dependencies", "devDependencies", "optionalDependencies"];
const VERSION_RE = /^\d+\.\d+\.\d+$/;

export function parseArgs(argv) {
  const rest = argv.slice(2);
  if (rest.includes("-h") || rest.includes("--help")) return { help: true };
  if (rest.length !== 1) {
    throw new Error("exactly one <version> argument is required");
  }
  const [version] = rest;
  if (!VERSION_RE.test(version)) {
    throw new Error(`invalid version "${version}" (expected x.y.z)`);
  }
  return { help: false, version };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// package.json 텍스트에서 dependency 필드의 `pkg` 버전만 바꾼다 (나머지 서식 보존).
export function setDependencyVersion(text, pkg, version) {
  const data = JSON.parse(text);
  const fields = DEP_FIELDS.filter((f) => data[f] && pkg in data[f]);
  if (fields.length === 0) {
    throw new Error(`${pkg} is not a dependency`);
  }
  let out = text;
  for (const field of fields) {
    const section = new RegExp(
      `("${escapeRe(field)}"\\s*:\\s*\\{[^}]*?"${escapeRe(pkg)}"\\s*:\\s*")[^"]*(")`,
    );
    if (!section.test(out)) {
      throw new Error(`could not locate ${field}.${pkg}`);
    }
    out = out.replace(section, `$1${version}$2`);
  }
  const check = JSON.parse(out);
  for (const field of fields) {
    if (check[field][pkg] !== version) {
      throw new Error(`failed to set ${field}.${pkg}`);
    }
  }
  return out;
}

// lockfile에 `pkg`가 `version`으로 기록됐는지 확인한다.
export function lockfileHasVersion(manager, text, pkg, version) {
  const p = escapeRe(pkg);
  const v = escapeRe(version);
  if (manager === "npm") {
    return (
      JSON.parse(text).packages?.[`node_modules/${pkg}`]?.version === version
    );
  }
  if (manager === "yarn") {
    return new RegExp(`^"?${p}@[^\\n]*:\\n\\s+version "${v}"$`, "m").test(text);
  }
  if (manager === "pnpm") {
    return new RegExp(
      `^  '?${p}@[^\\n]*:\\n(?:    [^\\n]*\\n)*?    version: ${v}$`,
      "m",
    ).test(text);
  }
  throw new Error(`unknown package manager: ${manager}`);
}

function defaultRun(cmd, args, { cwd, capture = false } = {}) {
  const env = { ...process.env, PWD: cwd };
  // 패키지 매니저 호출에는 HUSKY=0을 --ignore-scripts의 이중 안전장치로 건다.
  // git commit은 저장소 hook(lint-staged)을 거쳐야 하므로 제외한다.
  if (cmd !== "git") env.HUSKY = "0";
  const r = spawnSync(cmd, args, {
    cwd,
    encoding: "utf-8",
    env,
    stdio: capture
      ? ["ignore", "pipe", "pipe"]
      : ["ignore", "inherit", "inherit"],
  });
  return {
    status: r.error ? 1 : r.status,
    stdout: r.stdout ?? "",
    stderr: r.error ? String(r.error.message) : (r.stderr ?? ""),
  };
}

function lockfileSteps(target, { tmpDir }) {
  switch (target.manager) {
    case "npm":
      return [
        [
          "npm",
          [
            "install",
            "--package-lock-only",
            "--ignore-scripts",
            "--prefer-online",
            "--no-audit",
            "--no-fund",
          ],
        ],
      ];
    case "yarn":
      // yarn 1에는 lockfile-only 모드가 없다 — node_modules는 임시 폴더에 받는다.
      return [
        [
          "yarn",
          [
            "install",
            "--ignore-scripts",
            "--non-interactive",
            "--no-progress",
            "--modules-folder",
            path.join(tmpDir, "yarn-node_modules"),
          ],
        ],
      ];
    case "pnpm":
      return [
        ["bash", ["scripts/pack-kelo-local.sh"]],
        [
          "pnpm",
          [
            "install",
            "--lockfile-only",
            "--ignore-scripts",
            "--no-frozen-lockfile",
          ],
        ],
      ];
    default:
      throw new Error(`unknown package manager: ${target.manager}`);
  }
}

/**
 * example/ 의존성을 `version`으로 동기화한다. 예외를 던지지 않고 결과를 돌려준다.
 * 실패하면 이 함수가 바꾼 파일을 모두 원래 내용으로 되돌린다.
 * @returns {Promise<{ok: true, changedFiles: string[]} | {ok: false, error: string, changedFiles: []}>}
 */
export async function syncExampleVersions({
  version,
  root,
  targets = EXAMPLE_TARGETS,
  run = defaultRun,
  log = (msg) => process.stdout.write(`${msg}\n`),
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  registryAttempts = 30,
  registryDelayMs = 10_000,
} = {}) {
  if (!VERSION_RE.test(version ?? "")) {
    return {
      ok: false,
      error: `invalid version "${version}"`,
      changedFiles: [],
    };
  }

  const files = targets.flatMap((t) => [
    ...t.manifests.map((m) => path.join(t.dir, m.file)),
    path.join(t.dir, t.lockfile),
  ]);
  const snapshot = new Map();
  for (const rel of files) {
    const abs = path.join(root, rel);
    snapshot.set(rel, fs.existsSync(abs) ? fs.readFileSync(abs) : null);
  }
  const restore = () => {
    for (const [rel, content] of snapshot) {
      const abs = path.join(root, rel);
      if (content === null) fs.rmSync(abs, { force: true });
      else fs.writeFileSync(abs, content);
    }
  };

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kelo-example-sync-"));
  try {
    const pkgs = [
      ...new Set(targets.flatMap((t) => t.manifests.map((m) => m.pkg))),
    ];

    // nx-monorepo는 로컬 rules/를 pack하므로 체크아웃 버전이 일치해야 한다.
    if (targets.some((t) => t.manager === "pnpm")) {
      for (const pkg of pkgs) {
        const pj = path.join(root, LOCAL_PACKAGE_DIRS[pkg], "package.json");
        const local = JSON.parse(fs.readFileSync(pj, "utf-8")).version;
        if (local !== version) {
          throw new Error(
            `${LOCAL_PACKAGE_DIRS[pkg]}/package.json is ${local}, expected ${version}`,
          );
        }
      }
    }

    // 방금 publish한 버전이 레지스트리에 보일 때까지 잠시 기다린다.
    for (const pkg of pkgs) {
      for (let attempt = 1; ; attempt++) {
        const r = run(
          "npm",
          ["view", `${pkg}@${version}`, "version", "--prefer-online"],
          {
            cwd: root,
            capture: true,
          },
        );
        if (r.status === 0 && r.stdout.trim() === version) break;
        if (attempt >= registryAttempts) {
          throw new Error(
            `${pkg}@${version} is not visible on the npm registry after ${attempt} attempts`,
          );
        }
        log(
          `  ${pkg}@${version} not on the registry yet — retrying in ${Math.round(registryDelayMs / 1000)}s (${attempt}/${registryAttempts})`,
        );
        await sleep(registryDelayMs);
      }
    }

    for (const target of targets) {
      const cwd = path.join(root, target.dir);
      for (const m of target.manifests) {
        const abs = path.join(cwd, m.file);
        const before = fs.readFileSync(abs, "utf-8");
        const after = setDependencyVersion(before, m.pkg, version);
        if (after !== before) fs.writeFileSync(abs, after);
      }
      for (const [cmd, args] of lockfileSteps(target, { tmpDir })) {
        log(`  [${target.dir}] ${cmd} ${args.join(" ")}`);
        const r = run(cmd, args, { cwd });
        if (r.status !== 0) {
          throw new Error(
            `[${target.dir}] '${cmd} ${args.join(" ")}' exited with ${r.status}` +
              (r.stderr?.trim() ? ` (${r.stderr.trim()})` : ""),
          );
        }
      }
      const lock = fs.readFileSync(path.join(cwd, target.lockfile), "utf-8");
      for (const m of target.manifests) {
        if (!lockfileHasVersion(target.manager, lock, m.pkg, version)) {
          throw new Error(
            `[${target.dir}] ${target.lockfile} does not record ${m.pkg}@${version}`,
          );
        }
      }
    }

    const changedFiles = files.filter((rel) => {
      const abs = path.join(root, rel);
      const now = fs.existsSync(abs) ? fs.readFileSync(abs) : null;
      const was = snapshot.get(rel);
      return now === null || was === null ? now !== was : !now.equals(was);
    });
    return { ok: true, changedFiles };
  } catch (err) {
    restore();
    return { ok: false, error: err.message, changedFiles: [] };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export const exampleCommitMessage = (version) =>
  `chore(example): 예제 kelo 의존성 ${version} 동기화`;

/**
 * deploy.mjs 단계: npm publish 뒤에 예제를 동기화하고 따로 커밋한다.
 * 릴리스를 막지 않도록 절대 throw하지 않는다 — 문제가 있으면 `warning`을 돌려준다.
 * @returns {Promise<{committed: boolean, warning: string}>}
 */
export async function releaseExampleSync({
  version,
  root,
  publish = true,
  run = defaultRun,
  ...syncOptions
}) {
  const later = `'node scripts/sync-example-versions.mjs ${version}' 실행 후 커밋하세요`;
  if (!publish) {
    return {
      committed: false,
      warning: `example/ 의존성 동기화를 건너뜀 (--no-publish: ${version}이 레지스트리에 없음). 배포 후 ${later}.`,
    };
  }
  let sync;
  try {
    sync = await syncExampleVersions({ version, root, run, ...syncOptions });
  } catch (err) {
    sync = { ok: false, error: err.message };
  }
  if (!sync.ok) {
    return {
      committed: false,
      warning: `example/ 의존성 동기화 실패 (${sync.error}). 예제 파일은 되돌렸습니다. 나중에 ${later}.`,
    };
  }
  if (sync.changedFiles.length === 0) return { committed: false, warning: "" };

  // 범프 커밋과 같은 방식 — hook(lint-staged)을 거친다.
  const files = sync.changedFiles;
  const add = run("git", ["add", "--", ...files], { cwd: root });
  const commit =
    add.status === 0
      ? run("git", ["commit", "-m", exampleCommitMessage(version)], {
          cwd: root,
        })
      : add;
  if (commit.status === 0) return { committed: true, warning: "" };
  run("git", ["reset", "-q", "--", ...files], { cwd: root });
  run("git", ["checkout", "--", ...files], { cwd: root });
  return {
    committed: false,
    warning: `example/ 동기화 커밋 실패. 예제 파일은 되돌렸습니다. 나중에 ${later}.`,
  };
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv);
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n\n${HELP}`);
    process.exit(1);
  }
  if (args.help) {
    process.stdout.write(HELP);
    return;
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const r = await syncExampleVersions({ version: args.version, root });
  if (!r.ok) {
    process.stderr.write(
      `Error: ${r.error}\n       Example files were restored.\n`,
    );
    process.exit(1);
  }
  process.stdout.write(
    r.changedFiles.length
      ? `Updated:\n${r.changedFiles.map((f) => `  ${f}`).join("\n")}\n`
      : `Examples already at ${args.version} — nothing changed.\n`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
