#!/usr/bin/env node
// =============================================================================
// kelo 셋업 실행기 — /kelo:setup 이 호출한다.
//
//   kelo.mjs detect   [-p <dir>]                       설정이 없을 때 감지 결과(JSON)
//   kelo.mjs validate [-p <dir>]                       kelo.yaml 검증
//   kelo.mjs setup    [-p <dir>] [--move-app] [--dry-run] [--no-install] [--analysis-path <dir>]
//                     --no-install: 의존성 설치 단계(install·peers·exec) 생략
//                     --analysis-path: (개발용) Flutter kelo_analysis를 로컬 체크아웃 path 의존성으로
//
// 입력
//   <dir>/kelo.yaml                 프로젝트 설정 (단일 프로젝트 또는 workspaces)
//   rules/<framework>/stacks.yaml   스택 정의
//   rules/<framework>/pipeline.yaml 실행 단계
// =============================================================================

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const PLUGIN_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const FRAMEWORKS = ["nextjs", "nestjs", "flutter"];
const CONFIG_FILE = "kelo.yaml";
const PACKAGE_MANAGERS = ["npm", "yarn", "pnpm", "bun"];
const DOCS = [
  "docs/GIT.md",
  "docs/ARCHITECTURE.md",
  "docs/CONVENTIONS.md",
  "docs/LINT.md",
];

const PROJECT_KEYS = ["framework", "name", "stacks", "agents", "entryDir"];
const SINGLE_KEYS = [...PROJECT_KEYS, "packageManager"];
const WORKSPACE_KEYS = ["path", ...PROJECT_KEYS];
const ROOT_WS_KEYS = ["packageManager", "workspaces"];

const HELP = `Usage:
  kelo.mjs detect   [-p <dir>]
  kelo.mjs validate [-p <dir>]
  kelo.mjs setup    [-p <dir>] [--move-app] [--dry-run] [--no-install] [--analysis-path <dir>]
`;

class KeloError extends Error {}

// ─── 입력 파일 ────────────────────────────────────────────────────────────────

function readYaml(file) {
  try {
    return YAML.parse(fs.readFileSync(file, "utf8")) ?? {};
  } catch (err) {
    throw new KeloError(`${file} 파싱 실패: ${err.message}`);
  }
}

const stackCache = new Map();
function loadStacks(framework) {
  if (!stackCache.has(framework)) {
    const file = path.join(PLUGIN_ROOT, "rules", framework, "stacks.yaml");
    stackCache.set(framework, fs.existsSync(file) ? readYaml(file) : {});
  }
  return stackCache.get(framework);
}

function loadPipeline(framework) {
  const file = path.join(PLUGIN_ROOT, "rules", framework, "pipeline.yaml");
  const steps = readYaml(file).steps;
  if (!Array.isArray(steps))
    throw new KeloError(`${file}: steps 배열이 없습니다`);
  return steps;
}

// ─── kelo.yaml 검증 ───────────────────────────────────────────────────────────

function assertKeys(where, obj, allowed) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    throw new KeloError(`${where}: 객체여야 합니다`);
  }
  const unknown = Object.keys(obj).filter((k) => !allowed.includes(k));
  if (unknown.length) {
    throw new KeloError(
      `${where}: 알 수 없는 키 ${unknown.join(", ")} (허용: ${allowed.join(", ")})`,
    );
  }
}

function normalizeProject(where, raw, dir) {
  if (!FRAMEWORKS.includes(raw.framework)) {
    throw new KeloError(
      `${where}: framework는 ${FRAMEWORKS.join(" | ")} 중 하나여야 합니다 (현재: ${raw.framework})`,
    );
  }
  const stacks = raw.stacks ?? [];
  if (!Array.isArray(stacks) || stacks.some((s) => typeof s !== "string")) {
    throw new KeloError(`${where}: stacks는 문자열 배열이어야 합니다`);
  }
  const defined = loadStacks(raw.framework);
  const unknown = stacks.filter((s) => !(s in defined));
  if (unknown.length) {
    throw new KeloError(
      `${where}: 알 수 없는 ${raw.framework} 스택 ${unknown.join(", ")} (사용 가능: ${Object.keys(defined).join(", ") || "없음"})`,
    );
  }
  if (raw.entryDir !== undefined && raw.framework !== "flutter") {
    throw new KeloError(`${where}: entryDir는 flutter에서만 씁니다`);
  }
  if (raw.agents !== undefined && typeof raw.agents !== "boolean") {
    throw new KeloError(`${where}: agents는 true/false여야 합니다`);
  }
  return {
    framework: raw.framework,
    name: raw.name ?? path.basename(dir),
    stacks: [...new Set(stacks)],
    agents: raw.agents ?? true,
    entryDir: raw.framework === "flutter" ? (raw.entryDir ?? "app") : undefined,
    dir,
  };
}

function loadConfig(root) {
  const file = path.join(root, CONFIG_FILE);
  if (!fs.existsSync(file)) {
    throw new KeloError(`${file}이 없습니다. /kelo:setup을 실행해 작성하세요.`);
  }
  const raw = readYaml(file);
  if (
    raw.packageManager !== undefined &&
    !PACKAGE_MANAGERS.includes(raw.packageManager)
  ) {
    throw new KeloError(
      `${file}: packageManager는 ${PACKAGE_MANAGERS.join(" | ")} 중 하나여야 합니다`,
    );
  }

  if ("workspaces" in raw) {
    assertKeys(file, raw, ROOT_WS_KEYS);
    if (!Array.isArray(raw.workspaces) || raw.workspaces.length === 0) {
      throw new KeloError(
        `${file}: workspaces는 비어 있지 않은 배열이어야 합니다`,
      );
    }
    const workspaces = raw.workspaces.map((ws, i) => {
      const where = `${file} workspaces[${i}]`;
      assertKeys(where, ws, WORKSPACE_KEYS);
      if (typeof ws.path !== "string" || !ws.path)
        throw new KeloError(`${where}: path가 필요합니다`);
      const dir = path.resolve(root, ws.path);
      if (!fs.existsSync(dir))
        throw new KeloError(`${where}: 경로가 없습니다 (${ws.path})`);
      return { ...normalizeProject(where, ws, dir), path: ws.path };
    });
    return {
      mode: "workspaces",
      root,
      packageManager: raw.packageManager,
      workspaces,
    };
  }

  assertKeys(file, raw, SINGLE_KEYS);
  return {
    mode: "single",
    root,
    packageManager: raw.packageManager,
    workspaces: [{ ...normalizeProject(file, raw, root), path: "." }],
  };
}

// ─── 감지 ────────────────────────────────────────────────────────────────────

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function hasDep(pkg, name) {
  return Boolean(pkg?.dependencies?.[name] || pkg?.devDependencies?.[name]);
}

function findFlutterEntry(dir) {
  if (isFlutterPackage(dir)) return ".";
  for (const name of fs.readdirSync(dir)) {
    const sub = path.join(dir, name);
    if (
      !name.startsWith(".") &&
      fs.statSync(sub).isDirectory() &&
      isFlutterPackage(sub)
    )
      return name;
  }
  return null;
}

function isFlutterPackage(dir) {
  const pubspec = path.join(dir, "pubspec.yaml");
  return (
    fs.existsSync(pubspec) &&
    /^\s*flutter\s*:/m.test(fs.readFileSync(pubspec, "utf8"))
  );
}

function detectFramework(dir) {
  if (
    ["js", "mjs", "ts"].some((ext) =>
      fs.existsSync(path.join(dir, `next.config.${ext}`)),
    )
  )
    return "nextjs";
  if (fs.existsSync(path.join(dir, "nest-cli.json"))) return "nestjs";
  const pkg = readJson(path.join(dir, "package.json"));
  if (hasDep(pkg, "next")) return "nextjs";
  if (hasDep(pkg, "@nestjs/core")) return "nestjs";
  if (findFlutterEntry(dir)) return "flutter";
  return null;
}

function workspacePatterns(root) {
  const pkg = readJson(path.join(root, "package.json"));
  const fromPkg = Array.isArray(pkg?.workspaces)
    ? pkg.workspaces
    : pkg?.workspaces?.packages;
  if (Array.isArray(fromPkg) && fromPkg.length) return fromPkg;
  const pnpm = path.join(root, "pnpm-workspace.yaml");
  if (fs.existsSync(pnpm)) return readYaml(pnpm).packages ?? [];
  return [];
}

function describeProject(dir) {
  const framework = detectFramework(dir);
  const out = { framework, name: path.basename(dir) };
  if (framework === "flutter") out.entryDir = findFlutterEntry(dir) ?? "app";
  if (framework === "nextjs") out.appDirNeedsMove = needsAppMove(dir);
  return out;
}

function detect(root) {
  const configPath = path.join(root, CONFIG_FILE);
  const stacks = Object.fromEntries(
    FRAMEWORKS.map((fw) => [
      fw,
      Object.entries(loadStacks(fw)).map(([name, def]) => ({
        name,
        description: def.description ?? "",
      })),
    ]),
  );
  const base = {
    root,
    configExists: fs.existsSync(configPath),
    packageManager: detectPackageManager(root),
    stacks,
  };

  const patterns = workspacePatterns(root);
  if (patterns.length) {
    const dirs = [
      ...new Set(
        patterns
          .filter((p) => !p.startsWith("!"))
          .flatMap((p) => fs.globSync(p, { cwd: root }))
          .filter((p) => fs.statSync(path.join(root, p)).isDirectory()),
      ),
    ].sort();
    const workspaces = dirs
      .map((p) => ({ path: p, ...describeProject(path.join(root, p)) }))
      .filter((w) => w.framework);
    return { ...base, mode: "workspaces", workspaces };
  }
  return { ...base, mode: "single", project: describeProject(root) };
}

// ─── 패키지 매니저 ────────────────────────────────────────────────────────────

const LOCKFILES = [
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["bun.lockb", "bun"],
  ["bun.lock", "bun"],
  ["package-lock.json", "npm"],
];

function gitRoot(dir) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: dir,
      encoding: "utf8",
    }).trim();
  } catch {
    return dir;
  }
}

function detectPackageManager(root) {
  // 프로젝트에서 git 루트까지 올라가며 lock 파일 → packageManager 필드 순으로 찾는다
  const top = gitRoot(root);
  for (let dir = root; ; dir = path.dirname(dir)) {
    for (const [file, pm] of LOCKFILES)
      if (fs.existsSync(path.join(dir, file))) return pm;
    const field = readJson(path.join(dir, "package.json"))?.packageManager;
    if (typeof field === "string") return field.split("@")[0];
    if (dir === top || dir === path.dirname(dir)) break;
  }
  for (const pm of ["pnpm", "yarn", "bun"]) {
    if (spawnSync(pm, ["--version"], { stdio: "ignore" }).status === 0)
      return pm;
  }
  return "npm";
}

const PM_COMMANDS = {
  npm: {
    init: ["init", "-y"],
    install: ["install"],
    addDev: ["install", "-D"],
  },
  yarn: { init: ["init", "-y"], install: [], addDev: ["add", "-D"] },
  pnpm: { init: ["init"], install: ["install"], addDev: ["add", "-D"] },
  bun: { init: ["init", "-y"], install: ["install"], addDev: ["add", "-d"] },
};

// ─── 실행 ────────────────────────────────────────────────────────────────────

function needsAppMove(dir) {
  return (
    fs.existsSync(path.join(dir, "app")) &&
    !fs.existsSync(path.join(dir, "src", "app"))
  );
}

function substitute(token, project) {
  return token.replace(/\{(framework|name|entryDir)\}/g, (_, key) => {
    const value = project[key];
    if (value === undefined)
      throw new KeloError(`치환할 값이 없습니다: {${key}}`);
    return value;
  });
}

function stackArgs(step, project) {
  if (!step.stacks) return [];
  const { flag, having } = step.stacks;
  const selected = project.stacks.filter(
    (s) =>
      !having ||
      fs.existsSync(
        path.join(PLUGIN_ROOT, "rules", project.framework, s, having),
      ),
  );
  return selected.length ? [flag, selected.join(",")] : [];
}

function describeStep(step) {
  if (step.run) return step.run;
  if (step.exec) return step.exec;
  return `builtin:${step.builtin}`;
}

class Runner {
  constructor({
    dryRun,
    moveApp,
    noInstall,
    analysisPath,
    packageManager,
    monorepoRoot,
  }) {
    this.dryRun = dryRun;
    this.monorepoRoot = monorepoRoot;
    this.analysisPath = analysisPath;
    this.noInstall = noInstall;
    this.moveApp = moveApp;
    this.pm = packageManager;
  }

  log(label, msg) {
    process.stdout.write(`\n▶ [${label}] ${msg}\n`);
  }

  spawn(cmd, args, cwd) {
    if (this.dryRun) {
      process.stdout.write(`  (dry-run) ${cmd} ${args.join(" ")}  @ ${cwd}\n`);
      return;
    }
    // 생성 스크립트의 normalizePath()는 상대 경로를 PWD 기준으로 푼다 — cwd와 맞춘다
    const res = spawnSync(cmd, args, {
      cwd,
      stdio: "inherit",
      env: { ...process.env, PWD: cwd },
    });
    if (res.error)
      throw new KeloError(`${cmd} 실행 실패: ${res.error.message}`);
    if (res.status !== 0)
      throw new KeloError(
        `${cmd} ${args.join(" ")} 실패 (exit ${res.status}) @ ${cwd}`,
      );
  }

  pmRun(kind, extra, cwd) {
    this.spawn(this.pm, [...PM_COMMANDS[this.pm][kind], ...extra], cwd);
  }

  runStep(step, project, label) {
    const cwd = project.dir;
    if (step.if && !project[step.if]) return;
    if (
      this.noInstall &&
      (step.exec || step.builtin === "install" || step.builtin === "peers")
    ) {
      process.stdout.write(
        `\n▶ [${label}] ${describeStep(step)} — --no-install, 건너뜀\n`,
      );
      return;
    }
    this.log(label, describeStep(step));

    if (step.run) {
      const [script, ...args] = step.run
        .split(/\s+/)
        .map((t) => substitute(t, project));
      const devArgs =
        step.analysisPathFlag && this.analysisPath
          ? [step.analysisPathFlag, this.analysisPath]
          : [];
      const monorepoArgs =
        step.monorepoRootFlag && this.monorepoRoot
          ? [step.monorepoRootFlag, this.monorepoRoot]
          : [];
      this.spawn(
        process.execPath,
        [
          path.join(PLUGIN_ROOT, "scripts", script),
          ...args,
          ...stackArgs(step, project),
          ...devArgs,
          ...monorepoArgs,
        ],
        cwd,
      );
      return;
    }
    if (step.exec) {
      const [cmd, ...args] = step.exec
        .split(/\s+/)
        .map((t) => substitute(t, project));
      this.spawn(
        cmd,
        args,
        path.resolve(cwd, substitute(step.cwd ?? ".", project)),
      );
      return;
    }
    switch (step.builtin) {
      case "ensure-package-json":
        if (!fs.existsSync(path.join(cwd, "package.json")))
          this.pmRun("init", [], cwd);
        return;
      case "move-app-to-src":
        if (!needsAppMove(cwd)) return;
        if (!this.moveApp) {
          throw new KeloError(
            `${cwd}: app/ 이 있고 src/app/ 이 없습니다. kelo 규칙은 src/app/ 을 가정합니다 — 이동에 동의하면 --move-app 으로 다시 실행하세요.`,
          );
        }
        if (this.dryRun)
          return process.stdout.write("  (dry-run) app/ → src/app/\n");
        fs.mkdirSync(path.join(cwd, "src"), { recursive: true });
        try {
          execFileSync("git", ["mv", "app", "src/app"], {
            cwd,
            stdio: "ignore",
          });
        } catch {
          fs.renameSync(path.join(cwd, "app"), path.join(cwd, "src", "app"));
        }
        process.stdout.write("  Moved: app/ → src/app/\n");
        return;
      case "install":
        this.pmRun("install", [], cwd);
        return;
      case "peers": {
        const missing = this.dryRun
          ? step.packages
          : execFileSync(
              process.execPath,
              [
                path.join(PLUGIN_ROOT, "scripts/typescript/missing-peers.mjs"),
                "-p",
                ".",
                ...step.packages,
              ],
              { cwd, encoding: "utf8", env: { ...process.env, PWD: cwd } },
            )
              .split(/\s+/)
              .filter(Boolean);
        if (missing.length) this.pmRun("addDev", missing, cwd);
        else process.stdout.write("  peer 모두 설치됨\n");
        return;
      }
      case "format-docs": {
        const files = DOCS.filter((f) => fs.existsSync(path.join(cwd, f)));
        if (!files.length || this.dryRun) return;
        // 프로젝트 prettier 설정으로 맞춘다 — lint:ci의 prettier --check 대비 (prettier가 없으면 건너뜀)
        spawnSync("npx", ["--no-install", "prettier", "--write", ...files], {
          cwd,
          stdio: "ignore",
          env: { ...process.env, PWD: cwd },
        });
        return;
      }
      default:
        throw new KeloError(`알 수 없는 builtin: ${step.builtin}`);
    }
  }
}

function setup(root, { dryRun, moveApp, noInstall, analysisPath }) {
  const config = loadConfig(root);
  const packageManager = config.packageManager ?? detectPackageManager(root);
  const runner = new Runner({
    dryRun,
    moveApp,
    noInstall,
    analysisPath,
    packageManager,
    monorepoRoot: config.mode === "workspaces" ? root : null,
  });
  process.stdout.write(
    `kelo setup — ${config.mode} @ ${root} (packageManager: ${packageManager})\n`,
  );

  if (config.mode === "single") {
    const project = config.workspaces[0];
    for (const step of loadPipeline(project.framework))
      runner.runStep(step, project, project.framework);
    return;
  }

  // 모노레포: [워크스페이스별 install 이전 단계] → [루트 단계 + install] → [워크스페이스별 install 이후 단계]
  const plans = config.workspaces.map((ws) => {
    const steps = loadPipeline(ws.framework);
    const at = steps.findIndex((s) => s.builtin === "install");
    return {
      ws,
      before: at < 0 ? steps : steps.slice(0, at),
      after: at < 0 ? [] : steps.slice(at + 1),
    };
  });
  const rootSteps = new Map();
  for (const { ws, before } of plans) {
    for (const step of before) {
      if (step.scope === "root") {
        const key = step.run ?? step.builtin;
        if (!rootSteps.has(key))
          rootSteps.set(key, { step, framework: ws.framework });
        continue;
      }
      runner.runStep(step, ws, ws.path);
    }
  }
  const rootProject = {
    framework: plans[0].ws.framework,
    name: path.basename(root),
    dir: root,
    stacks: [],
    agents: false,
  };
  for (const { step, framework } of rootSteps.values()) {
    if (
      step.rootIfMissing &&
      fs.existsSync(path.join(root, step.rootIfMissing))
    ) {
      process.stdout.write(
        `\n▶ [root] ${describeStep(step)} — ${step.rootIfMissing} 있음, 건너뜀\n`,
      );
      continue;
    }
    runner.runStep(step, { ...rootProject, framework }, "root");
  }
  runner.runStep({ builtin: "install" }, rootProject, "root");
  for (const { ws, after } of plans)
    for (const step of after) runner.runStep(step, ws, ws.path);
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const [command, ...rest] = argv.slice(2);
  const opts = {
    command,
    dir: ".",
    dryRun: false,
    moveApp: false,
    noInstall: false,
    analysisPath: null,
  };
  while (rest.length) {
    const a = rest.shift();
    if (a === "-p") opts.dir = rest.shift();
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--move-app") opts.moveApp = true;
    else if (a === "--no-install") opts.noInstall = true;
    else if (a === "--analysis-path") {
      const dir = rest.shift();
      if (!dir || !fs.existsSync(dir))
        throw new KeloError(`--analysis-path 디렉터리가 없습니다: ${dir}`);
      opts.analysisPath = path.resolve(dir);
    } else if (a === "-h" || a === "--help") opts.command = "help";
    else throw new KeloError(`알 수 없는 옵션: ${a}\n${HELP}`);
  }
  if (!opts.dir) throw new KeloError(`-p 에 디렉터리가 필요합니다\n${HELP}`);
  opts.dir = path.resolve(opts.dir);
  if (!fs.existsSync(opts.dir))
    throw new KeloError(`디렉터리가 없습니다: ${opts.dir}`);
  return opts;
}

function main() {
  const opts = parseArgs(process.argv);
  switch (opts.command) {
    case "detect":
      process.stdout.write(JSON.stringify(detect(opts.dir), null, 2) + "\n");
      break;
    case "validate": {
      const config = loadConfig(opts.dir);
      process.stdout.write(
        `OK — ${config.mode}, ${config.workspaces.map((w) => `${w.path}(${w.framework})`).join(", ")}\n`,
      );
      break;
    }
    case "setup":
      setup(opts.dir, opts);
      process.stdout.write("\n✔ kelo setup 완료\n");
      break;
    case "help":
      process.stdout.write(HELP);
      break;
    default:
      throw new KeloError(
        `알 수 없는 명령: ${opts.command ?? "(없음)"}\n${HELP}`,
      );
  }
}

try {
  main();
} catch (err) {
  if (!(err instanceof KeloError)) throw err;
  process.stderr.write(`[kelo] ${err.message}\n`);
  process.exit(1);
}
