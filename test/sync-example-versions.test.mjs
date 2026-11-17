import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  EXAMPLE_TARGETS,
  exampleCommitMessage,
  lockfileHasVersion,
  parseArgs,
  releaseExampleSync,
  setDependencyVersion,
  syncExampleVersions,
} from "../scripts/sync-example-versions.mjs";

const V = "9.8.7";
const NEXT = "eslint-config-kelo-nextjs";
const NEST = "eslint-config-kelo-nestjs";

// ─── 인자 ────────────────────────────────────────────────────────────────────

test("parseArgs: 버전 하나만 받는다", () => {
  assert.deepEqual(parseArgs(["node", "s", "2.2.4"]), {
    help: false,
    version: "2.2.4",
  });
  assert.deepEqual(parseArgs(["node", "s", "--help"]), { help: true });
  assert.deepEqual(parseArgs(["node", "s", "-h"]), { help: true });
  assert.throws(() => parseArgs(["node", "s"]), /exactly one/);
  assert.throws(
    () => parseArgs(["node", "s", "1.0.0", "2.0.0"]),
    /exactly one/,
  );
  for (const bad of ["patch", "v1.0.0", "1.0", "1.0.0-beta.1"]) {
    assert.throws(() => parseArgs(["node", "s", bad]), /invalid version/, bad);
  }
});

// ─── manifest 재작성 ─────────────────────────────────────────────────────────

test("setDependencyVersion: 의존성 필드의 버전만 바꾸고 서식을 보존한다", () => {
  const text = `{
  "name": "x",
  "devDependencies": {
    "eslint": "^9.0.0",
    "${NEXT}": "1.1.0",
    "prettier": "^3.0.0"
  },
  "overrides": {
    "${NEXT}": "keep-me"
  }
}
`;
  const out = setDependencyVersion(text, NEXT, V);
  assert.equal(out, text.replace('"1.1.0"', `"${V}"`));
  assert.equal(JSON.parse(out).overrides[NEXT], "keep-me");
});

test("setDependencyVersion: 값이 같으면 텍스트가 그대로다", () => {
  const text = `{ "dependencies": { "${NEST}": "${V}" } }\n`;
  assert.equal(setDependencyVersion(text, NEST, V), text);
});

test("setDependencyVersion: 의존성이 없으면 실패한다", () => {
  assert.throws(
    () => setDependencyVersion(`{ "dependencies": {} }`, NEST, V),
    /not a dependency/,
  );
});

test("setDependencyVersion: 실제 example manifest에 적용된다", () => {
  const root = path.resolve(import.meta.dirname, "..");
  for (const t of EXAMPLE_TARGETS) {
    for (const m of t.manifests) {
      const text = fs.readFileSync(path.join(root, t.dir, m.file), "utf-8");
      const out = setDependencyVersion(text, m.pkg, V);
      assert.equal(JSON.parse(out).devDependencies[m.pkg], V);
      // 바뀐 줄은 하나뿐이다
      const diff = out.split("\n").filter((l, i) => l !== text.split("\n")[i]);
      assert.equal(diff.length <= 1, true, `${t.dir}/${m.file}`);
    }
  }
});

// ─── lockfile 확인 ───────────────────────────────────────────────────────────

const lockText = {
  npm: (v) =>
    JSON.stringify({ packages: { [`node_modules/${NEXT}`]: { version: v } } }),
  yarn: (v) =>
    `${NEST}@${v}:\n  version "${v}"\n  resolved "https://r/${NEST}-${v}.tgz"\n`,
  pnpm: (v) =>
    `packages:\n\n  ${NEST}@file:.local-packages/${NEST}.tgz:\n    resolution: {integrity: sha512-x}\n    version: ${v}\n    hasBin: true\n\n  ${NEXT}@file:.local-packages/${NEXT}.tgz:\n    resolution: {integrity: sha512-y}\n    version: ${v}\n`,
};

test("lockfileHasVersion: 매니저별 형식을 인식한다", () => {
  assert.equal(lockfileHasVersion("npm", lockText.npm(V), NEXT, V), true);
  assert.equal(
    lockfileHasVersion("npm", lockText.npm("1.1.0"), NEXT, V),
    false,
  );
  assert.equal(lockfileHasVersion("yarn", lockText.yarn(V), NEST, V), true);
  assert.equal(
    lockfileHasVersion("yarn", lockText.yarn("1.1.0"), NEST, V),
    false,
  );
  for (const pkg of [NEXT, NEST]) {
    assert.equal(lockfileHasVersion("pnpm", lockText.pnpm(V), pkg, V), true);
    assert.equal(
      lockfileHasVersion("pnpm", lockText.pnpm("1.1.0"), pkg, V),
      false,
    );
  }
});

// ─── 동기화 흐름 (패키지 매니저 호출은 stub) ─────────────────────────────────

function makeRepo({ rulesVersion = V } = {}) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "kelo-example-sync-test-"),
  );
  const write = (rel, content) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  };
  write("rules/nextjs/package.json", JSON.stringify({ version: rulesVersion }));
  write("rules/nestjs/package.json", JSON.stringify({ version: rulesVersion }));
  for (const t of EXAMPLE_TARGETS) {
    for (const m of t.manifests) {
      write(
        path.join(t.dir, m.file),
        JSON.stringify({ devDependencies: { [m.pkg]: "1.1.0" } }, null, 2) +
          "\n",
      );
    }
    write(path.join(t.dir, t.lockfile), lockText[t.manager]("1.1.0"));
  }
  return root;
}

function snapshot(root) {
  const out = {};
  for (const t of EXAMPLE_TARGETS) {
    for (const rel of [...t.manifests.map((m) => m.file), t.lockfile]) {
      const p = path.join(t.dir, rel);
      out[p] = fs.readFileSync(path.join(root, p), "utf-8");
    }
  }
  return out;
}

// 패키지 매니저를 흉내 낸다: 성공하면 lockfile에 manifest의 버전을 기록한다.
function stubRun(root, { failOn, registryMissFor = 0 } = {}) {
  const calls = [];
  let registryMisses = 0;
  const run = (cmd, args, { cwd }) => {
    calls.push({ cmd, args, cwd: path.relative(root, cwd) || "." });
    if (cmd === "npm" && args[0] === "view") {
      if (registryMisses < registryMissFor) {
        registryMisses++;
        return { status: 1, stdout: "", stderr: "E404" };
      }
      return { status: 0, stdout: `${args[1].split("@").pop()}\n`, stderr: "" };
    }
    if (failOn && failOn(cmd, args))
      return { status: 1, stdout: "", stderr: "" };
    const target = EXAMPLE_TARGETS.find((t) => path.join(root, t.dir) === cwd);
    if (target && cmd !== "bash" && cmd !== "git") {
      const pj = JSON.parse(
        fs.readFileSync(path.join(cwd, target.manifests[0].file), "utf-8"),
      );
      const v = pj.devDependencies[target.manifests[0].pkg];
      fs.writeFileSync(
        path.join(cwd, target.lockfile),
        lockText[target.manager](v),
      );
    }
    return { status: 0, stdout: "", stderr: "" };
  };
  return { run, calls };
}

const quiet = { log: () => {}, sleep: async () => {} };

test("syncExampleVersions: 성공하면 manifest·lockfile을 갱신하고 바뀐 파일을 돌려준다", async () => {
  const root = makeRepo();
  try {
    const { run, calls } = stubRun(root);
    const r = await syncExampleVersions({ version: V, root, run, ...quiet });
    assert.equal(r.ok, true, r.error);
    assert.deepEqual(r.changedFiles.sort(), Object.keys(snapshot(root)).sort());
    for (const t of EXAMPLE_TARGETS) {
      for (const m of t.manifests) {
        const pj = JSON.parse(
          fs.readFileSync(path.join(root, t.dir, m.file), "utf-8"),
        );
        assert.equal(pj.devDependencies[m.pkg], V);
      }
    }
    // lifecycle script는 절대 돌리지 않고, lockfile 전용 모드를 쓴다
    const pm = calls.filter((c) => ["npm", "yarn", "pnpm"].includes(c.cmd));
    for (const c of pm.filter((c) => c.args[0] === "install")) {
      assert.ok(c.args.includes("--ignore-scripts"), `${c.cmd} ${c.args}`);
    }
    const npmInstall = pm.find(
      (c) => c.cmd === "npm" && c.args[0] === "install",
    );
    assert.ok(npmInstall.args.includes("--package-lock-only"));
    const pnpmInstall = pm.find((c) => c.cmd === "pnpm");
    assert.ok(pnpmInstall.args.includes("--lockfile-only"));
    const yarnInstall = pm.find((c) => c.cmd === "yarn");
    assert.ok(yarnInstall.args.includes("--modules-folder"));
    assert.ok(
      !path
        .resolve(
          yarnInstall.args[yarnInstall.args.indexOf("--modules-folder") + 1],
        )
        .startsWith(root),
      "yarn node_modules must not land in the example",
    );
    // nx-monorepo는 lockfile 전에 로컬 tarball을 만든다
    const nx = calls.filter((c) => c.cwd === "example/nx-monorepo");
    assert.deepEqual(
      nx.map((c) => c.cmd),
      ["bash", "pnpm"],
    );
    assert.ok(!calls.some((c) => c.cmd === "git"), "sync itself never commits");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("syncExampleVersions: 이미 맞춰져 있으면 바뀐 파일이 없다", async () => {
  const root = makeRepo();
  try {
    const first = stubRun(root);
    await syncExampleVersions({ version: V, root, run: first.run, ...quiet });
    const again = stubRun(root);
    const r = await syncExampleVersions({
      version: V,
      root,
      run: again.run,
      ...quiet,
    });
    assert.equal(r.ok, true);
    assert.deepEqual(r.changedFiles, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("syncExampleVersions: 중간 단계가 실패하면 앞 단계까지 포함해 모두 되돌린다", async () => {
  const root = makeRepo();
  try {
    const before = snapshot(root);
    const { run, calls } = stubRun(root, { failOn: (cmd) => cmd === "yarn" });
    const r = await syncExampleVersions({ version: V, root, run, ...quiet });
    assert.equal(r.ok, false);
    assert.match(r.error, /example\/nestjs.*yarn install.*exited with 1/);
    // nextjs는 이미 성공했지만 함께 복원된다
    assert.ok(calls.some((c) => c.cwd === "example/nextjs"));
    assert.deepEqual(snapshot(root), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("syncExampleVersions: lockfile에 버전이 기록되지 않으면 실패로 보고 되돌린다", async () => {
  const root = makeRepo();
  try {
    const before = snapshot(root);
    const run = (cmd, args) =>
      cmd === "npm" && args[0] === "view"
        ? { status: 0, stdout: `${V}\n`, stderr: "" }
        : { status: 0, stdout: "", stderr: "" };
    const r = await syncExampleVersions({ version: V, root, run, ...quiet });
    assert.equal(r.ok, false);
    assert.match(r.error, /does not record/);
    assert.deepEqual(snapshot(root), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("syncExampleVersions: 레지스트리 반영 지연은 재시도한다", async () => {
  const root = makeRepo();
  try {
    const { run } = stubRun(root, { registryMissFor: 2 });
    let slept = 0;
    const r = await syncExampleVersions({
      version: V,
      root,
      run,
      log: () => {},
      sleep: async () => {
        slept++;
      },
      registryAttempts: 3,
    });
    assert.equal(r.ok, true, r.error);
    assert.equal(slept, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("syncExampleVersions: 레지스트리에 끝내 없으면 파일을 건드리지 않고 실패한다", async () => {
  const root = makeRepo();
  try {
    const before = snapshot(root);
    const { run, calls } = stubRun(root, { registryMissFor: Infinity });
    let slept = 0;
    const r = await syncExampleVersions({
      version: V,
      root,
      run,
      log: () => {},
      sleep: async () => {
        slept++;
      },
      registryAttempts: 4,
    });
    assert.equal(r.ok, false);
    assert.match(r.error, /not visible on the npm registry after 4 attempts/);
    assert.equal(slept, 3);
    assert.ok(calls.every((c) => c.args[0] === "view"));
    assert.deepEqual(snapshot(root), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("syncExampleVersions: rules/ 버전이 다르면 아무것도 실행하지 않고 실패한다", async () => {
  const root = makeRepo({ rulesVersion: "1.0.0" });
  try {
    const before = snapshot(root);
    const { run, calls } = stubRun(root);
    const r = await syncExampleVersions({ version: V, root, run, ...quiet });
    assert.equal(r.ok, false);
    assert.match(
      r.error,
      /rules\/nextjs\/package\.json is 1\.0\.0, expected 9\.8\.7/,
    );
    assert.deepEqual(calls, []);
    assert.deepEqual(snapshot(root), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ─── deploy.mjs 단계 ─────────────────────────────────────────────────────────

test("releaseExampleSync: --no-publish면 아무것도 실행하지 않고 경고만 돌려준다", async () => {
  const root = makeRepo();
  try {
    const { run, calls } = stubRun(root);
    const r = await releaseExampleSync({
      version: V,
      root,
      publish: false,
      run,
      ...quiet,
    });
    assert.equal(r.committed, false);
    assert.match(r.warning, /--no-publish/);
    assert.match(r.warning, /node scripts\/sync-example-versions\.mjs 9\.8\.7/);
    assert.deepEqual(calls, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("releaseExampleSync: 성공하면 바뀐 파일만 add해 정해진 메시지로 커밋한다", async () => {
  const root = makeRepo();
  try {
    const { run, calls } = stubRun(root);
    const r = await releaseExampleSync({ version: V, root, run, ...quiet });
    assert.deepEqual(r, { committed: true, warning: "" });
    const git = calls.filter((c) => c.cmd === "git");
    assert.equal(git.length, 2);
    assert.deepEqual(git[0].args.slice(0, 2), ["add", "--"]);
    assert.deepEqual(
      git[0].args.slice(2).sort(),
      Object.keys(snapshot(root)).sort(),
    );
    assert.deepEqual(git[1].args, ["commit", "-m", exampleCommitMessage(V)]);
    assert.equal(
      exampleCommitMessage(V),
      "chore(example): 예제 kelo 의존성 9.8.7 동기화",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("releaseExampleSync: 동기화가 실패하면 커밋하지 않고 복원 후 경고한다", async () => {
  const root = makeRepo();
  try {
    const before = snapshot(root);
    const { run, calls } = stubRun(root, { failOn: (cmd) => cmd === "pnpm" });
    const r = await releaseExampleSync({ version: V, root, run, ...quiet });
    assert.equal(r.committed, false);
    assert.match(r.warning, /동기화 실패.*pnpm install/);
    assert.match(r.warning, /node scripts\/sync-example-versions\.mjs 9\.8\.7/);
    assert.ok(!calls.some((c) => c.cmd === "git"));
    assert.deepEqual(snapshot(root), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("releaseExampleSync: 커밋이 실패하면 unstage·checkout으로 되돌리고 경고한다", async () => {
  const root = makeRepo();
  try {
    const { run, calls } = stubRun(root, {
      failOn: (cmd, args) => cmd === "git" && args[0] === "commit",
    });
    const r = await releaseExampleSync({ version: V, root, run, ...quiet });
    assert.equal(r.committed, false);
    assert.match(r.warning, /커밋 실패/);
    const git = calls.filter((c) => c.cmd === "git").map((c) => c.args[0]);
    assert.deepEqual(git, ["add", "commit", "reset", "checkout"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("releaseExampleSync: 예외가 나도 throw하지 않는다", async () => {
  const r = await releaseExampleSync({
    version: V,
    root: path.join(os.tmpdir(), "kelo-does-not-exist-" + process.pid),
    run: () => ({ status: 0, stdout: `${V}\n`, stderr: "" }),
    ...quiet,
  });
  assert.equal(r.committed, false);
  assert.match(r.warning, /동기화 실패/);
});
