// 오케스트레이션 모드: gen-orchestration.mjs 동작과 kelo.yaml `orchestration` 검증·적용.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GEN = path.join(ROOT, "scripts/gen-orchestration.mjs");
const KELO = path.join(ROOT, "scripts/kelo.mjs");
const RULE = ".claude/rules/kelo-orchestration.md";
const SETTINGS = ".claude/settings.json";
const STATE_RE = /^<!-- kelo-orchestration-state: (.*) -->$/;

const tmpDirs = [];
after(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

// gen-orchestration.mjs는 git 루트(.git 존재)를 요구한다
function project(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kelo-orch-"));
  tmpDirs.push(dir);
  fs.mkdirSync(path.join(dir, ".git"));
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), content);
  }
  return dir;
}

function run(script, args, cwd) {
  const res = spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, PWD: cwd },
  });
  return { code: res.status, out: res.stdout, err: res.stderr };
}

const gen = (dir, ...args) => run(GEN, ["-p", ".", ...args], dir);
const read = (dir, file) => fs.readFileSync(path.join(dir, file), "utf8");
const exists = (dir, file) => fs.existsSync(path.join(dir, file));
const settings = (dir) => JSON.parse(read(dir, SETTINGS));
const state = (dir) =>
  JSON.parse(STATE_RE.exec(read(dir, RULE).split("\n")[1])[1]);

// ─── gen-orchestration.mjs ──────────────────────────────────────────────────

test("gen: 처음 설정 — 규칙 파일 2번째 줄에 상태 기록, model 설정", () => {
  const dir = project();
  const r = gen(dir);
  assert.equal(r.code, 0, r.err);
  const lines = read(dir, RULE).split("\n");
  assert.match(lines[0], /Managed by kelo/);
  assert.match(lines[1], STATE_RE);
  const s = state(dir);
  assert.equal(typeof s.model, "string");
  assert.ok(s.model);
  assert.equal(s.previousModel, null);
  assert.deepEqual(settings(dir), { model: s.model });
});

test("gen: 다른 settings 키와 키 순서를 보존한다", () => {
  const dir = project({
    [SETTINGS]: JSON.stringify({ a: 1, model: "sonnet", z: { y: 2 } }),
  });
  assert.equal(gen(dir, "--model", "opus").code, 0);
  const s = settings(dir);
  assert.deepEqual(Object.keys(s), ["a", "model", "z"]);
  assert.deepEqual(s, { a: 1, model: "opus", z: { y: 2 } });
  assert.deepEqual(state(dir), { model: "opus", previousModel: "sonnet" });
});

test("gen: --model로 재실행해도 previousModel은 유지된다", () => {
  const dir = project({ [SETTINGS]: JSON.stringify({ model: "sonnet" }) });
  assert.equal(gen(dir, "--model", "opus").code, 0);
  assert.equal(gen(dir, "--model", "haiku").code, 0);
  assert.deepEqual(state(dir), { model: "haiku", previousModel: "sonnet" });
  assert.equal(settings(dir).model, "haiku");
});

test("gen: --remove는 이전 model을 같은 위치에 복원한다", () => {
  const dir = project({
    [SETTINGS]: JSON.stringify({ a: 1, model: "sonnet", b: 2 }),
  });
  assert.equal(gen(dir, "--model", "opus").code, 0);
  const r = gen(dir, "--remove");
  assert.equal(r.code, 0, r.err);
  assert.equal(exists(dir, RULE), false);
  const s = settings(dir);
  assert.deepEqual(Object.keys(s), ["a", "model", "b"]);
  assert.equal(s.model, "sonnet");
});

test("gen: --remove는 원래 없던 model 키를 지운다", () => {
  const dir = project({ [SETTINGS]: JSON.stringify({ a: 1 }) });
  assert.equal(gen(dir).code, 0);
  assert.equal(gen(dir, "--remove").code, 0);
  assert.deepEqual(settings(dir), { a: 1 });
});

test("gen: --no-model은 settings.json을 바이트 단위로 그대로 둔다", () => {
  const original = '{"model":"sonnet",   "a":1}';
  const dir = project({ [SETTINGS]: original });
  assert.equal(gen(dir, "--no-model").code, 0);
  assert.ok(exists(dir, RULE));
  assert.equal(read(dir, SETTINGS), original);
  assert.doesNotMatch(read(dir, RULE).split("\n")[1], STATE_RE);
});

test("gen: --model --remove, --model ''는 오류이며 아무것도 쓰지 않는다", () => {
  for (const args of [
    ["--model", "opus", "--remove"],
    ["--model", ""],
  ]) {
    const dir = project();
    const r = gen(dir, ...args);
    assert.notEqual(r.code, 0, args.join(" "));
    assert.equal(exists(dir, ".claude"), false, args.join(" "));
  }
});

test("gen: --remove는 비게 된 .claude/rules/를 지우고 .claude/는 남긴다", () => {
  const dir = project();
  assert.equal(gen(dir, "--no-model").code, 0);
  const r = gen(dir, "--remove");
  assert.equal(r.code, 0, r.err);
  assert.equal(exists(dir, ".claude/rules"), false);
  assert.ok(exists(dir, ".claude"));
});

test("gen: --remove는 다른 파일이 있는 .claude/rules/를 남긴다", () => {
  const dir = project({ ".claude/rules/other.md": "x\n" });
  assert.equal(gen(dir, "--no-model").code, 0);
  assert.equal(gen(dir, "--remove").code, 0);
  assert.equal(exists(dir, RULE), false);
  assert.equal(read(dir, ".claude/rules/other.md"), "x\n");
});

test("gen: 잘못된 settings.json이면 아무것도 쓰지 않고 실패한다", () => {
  const dir = project({ [SETTINGS]: "{ not json" });
  const r = gen(dir);
  assert.notEqual(r.code, 0);
  assert.match(r.err, /not valid JSON/);
  assert.equal(exists(dir, RULE), false);
  assert.equal(read(dir, SETTINGS), "{ not json");
});

// ─── kelo.mjs validate / setup ──────────────────────────────────────────────

function keloProject(yaml) {
  return project({
    "kelo.yaml": `framework: nextjs\npackageManager: npm\n${yaml}\n`,
    "package.json": '{"name":"p","version":"1.0.0"}\n',
  });
}

for (const value of [
  "",
  "orchestration: true",
  "orchestration: false",
  "orchestration: {}",
  "orchestration: { model: opus }",
  "orchestration: { model: false }",
]) {
  test(`validate 허용: ${value || "(키 없음)"}`, () => {
    const dir = keloProject(value);
    const r = run(KELO, ["validate", "-p", "."], dir);
    assert.equal(r.code, 0, r.err);
  });
}

for (const [value, message] of [
  ['orchestration: { model: "" }', /orchestration\.model/],
  ["orchestration: { model: 1 }", /orchestration\.model/],
  ["orchestration: { foo: 1 }", /알 수 없는 키 foo/],
  ['orchestration: "yes"', /orchestration은 true\/false/],
  ["orchestration: 1", /orchestration은 true\/false/],
  ["orchestration: []", /orchestration은 true\/false/],
  ["orchestration: { model: true }", /orchestration\.model/],
  ['orchestration: { model: "-x" }', /orchestration\.model/],
  ['orchestration: { model: " opus" }', /orchestration\.model/],
]) {
  test(`validate 거부: ${value}`, () => {
    const dir = keloProject(value);
    const r = run(KELO, ["validate", "-p", "."], dir);
    assert.equal(r.code, 1);
    assert.match(r.err, message);
  });
}

test("validate: 워크스페이스 항목의 orchestration은 알 수 없는 키", () => {
  const dir = project({
    "kelo.yaml":
      "packageManager: npm\nworkspaces:\n  - path: .\n    framework: nextjs\n    orchestration: true\n",
  });
  const r = run(KELO, ["validate", "-p", "."], dir);
  assert.equal(r.code, 1);
  assert.match(r.err, /workspaces\[0\]: 알 수 없는 키 orchestration/);
});

test("validate: 모노레포 루트의 orchestration은 허용", () => {
  const dir = project({
    "kelo.yaml":
      "packageManager: npm\norchestration: { model: opus }\nworkspaces:\n  - path: .\n    framework: nextjs\n",
  });
  const r = run(KELO, ["validate", "-p", "."], dir);
  assert.equal(r.code, 0, r.err);
});

test("setup --dry-run: orchestration 단계를 출력만 하고 .claude/는 만들지 않는다", () => {
  const dir = keloProject("orchestration: true");
  const r = run(KELO, ["setup", "-p", ".", "--dry-run"], dir);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /▶ \[root\] gen-orchestration\.mjs -p \.\n/);
  assert.match(r.out, /\(dry-run\) .*gen-orchestration\.mjs -p \. /);
  assert.equal(exists(dir, ".claude"), false);
});

for (const [value, args] of [
  ["orchestration: true", "-p ."],
  ["orchestration: {}", "-p ."],
  ["orchestration: { model: false }", "-p . --no-model"],
  ["orchestration: false", "-p . --remove"],
  ["orchestration: { model: sonnet }", "-p . --model sonnet"],
]) {
  test(`setup --dry-run 인자: ${value} → ${args}`, () => {
    const dir = keloProject(value);
    const r = run(KELO, ["setup", "-p", ".", "--dry-run"], dir);
    assert.equal(r.code, 0, r.err);
    const lines = r.out
      .split("\n")
      .filter((l) => l.startsWith("▶ [root] gen-orchestration.mjs"));
    assert.deepEqual(lines, [`▶ [root] gen-orchestration.mjs ${args}`]);
  });
}

test("setup --dry-run: orchestration 키가 없으면 단계도 없다", () => {
  const dir = keloProject("");
  const r = run(KELO, ["setup", "-p", ".", "--dry-run"], dir);
  assert.equal(r.code, 0, r.err);
  assert.doesNotMatch(r.out, /gen-orchestration/);
});

test("setup --no-install: { model: opus } 적용 → false로 해제", () => {
  const dir = keloProject("orchestration: { model: opus }");
  fs.writeFileSync(path.join(dir, "tsconfig.json"), "{}\n");
  fs.mkdirSync(path.join(dir, ".claude"));
  fs.writeFileSync(
    path.join(dir, SETTINGS),
    JSON.stringify({ a: 1, model: "sonnet" }),
  );

  let r = run(KELO, ["setup", "-p", ".", "--no-install"], dir);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /▶ \[root\] gen-orchestration\.mjs -p \. --model opus/);
  assert.deepEqual(settings(dir), { a: 1, model: "opus" });
  assert.deepEqual(state(dir), { model: "opus", previousModel: "sonnet" });

  fs.writeFileSync(
    path.join(dir, "kelo.yaml"),
    "framework: nextjs\npackageManager: npm\norchestration: false\n",
  );
  r = run(KELO, ["setup", "-p", ".", "--no-install"], dir);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /▶ \[root\] gen-orchestration\.mjs -p \. --remove/);
  assert.equal(exists(dir, RULE), false);
  assert.deepEqual(settings(dir), { a: 1, model: "sonnet" });
});

// orchestration 단계는 정확히 한 번, 모든 pipeline 단계(▶ 줄) 뒤에 온다
function assertOrchestrationLast(out) {
  const steps = out.split("\n").filter((l) => l.startsWith("▶ "));
  const orch = steps.filter((l) => l.includes("gen-orchestration.mjs"));
  assert.equal(orch.length, 1, out);
  assert.ok(steps.length > 1, out);
  assert.equal(steps.at(-1), orch[0], out);
}

test("setup --no-install(단일): orchestration 단계는 마지막에 한 번", () => {
  const dir = keloProject("orchestration: { model: opus }");
  fs.writeFileSync(path.join(dir, "tsconfig.json"), "{}\n");
  const r = run(KELO, ["setup", "-p", ".", "--no-install"], dir);
  assert.equal(r.code, 0, r.err);
  assertOrchestrationLast(r.out);
  assert.ok(exists(dir, RULE));
});

test("setup --no-install(모노레포): 규칙 파일은 루트에만, 단계는 마지막에 한 번", () => {
  const dir = project({
    "kelo.yaml":
      "packageManager: npm\norchestration: { model: opus }\nworkspaces:\n  - path: apps/web\n    framework: nextjs\n  - path: apps/api\n    framework: nestjs\n",
    "package.json":
      '{"name":"m","version":"1.0.0","private":true,"workspaces":["apps/*"]}\n',
    "apps/web/package.json": '{"name":"web","version":"1.0.0"}\n',
    "apps/web/tsconfig.json": "{}\n",
    "apps/api/package.json": '{"name":"api","version":"1.0.0"}\n',
    "apps/api/tsconfig.json": "{}\n",
  });
  const r = run(KELO, ["setup", "-p", ".", "--no-install"], dir);
  assert.equal(r.code, 0, r.err);
  assertOrchestrationLast(r.out);
  assert.match(r.out, /▶ \[root\] gen-orchestration\.mjs -p \. --model opus\n/);
  assert.ok(exists(dir, RULE));
  assert.deepEqual(settings(dir), { model: "opus" });
  for (const ws of ["apps/web", "apps/api"]) {
    assert.ok(exists(dir, `${ws}/eslint.config.mjs`), ws);
    assert.equal(exists(dir, `${ws}/.claude`), false, ws);
  }
});

test("setup --no-install: 잘못된 settings.json이면 실패하고 규칙 파일을 쓰지 않는다", () => {
  const dir = keloProject("orchestration: true");
  fs.writeFileSync(path.join(dir, "tsconfig.json"), "{}\n");
  fs.mkdirSync(path.join(dir, ".claude"));
  fs.writeFileSync(path.join(dir, SETTINGS), "{ not json");
  const r = run(KELO, ["setup", "-p", ".", "--no-install"], dir);
  assert.notEqual(r.code, 0);
  assert.match(r.err, /not valid JSON/);
  assert.equal(exists(dir, RULE), false);
  assert.equal(read(dir, SETTINGS), "{ not json");
});
