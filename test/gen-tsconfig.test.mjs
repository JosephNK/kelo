import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts/typescript/gen-tsconfig.mjs");

function run(dir) {
  return execFileSync("node", [script, "nextjs", "-p", dir], {
    encoding: "utf8",
  });
}

function makeProject(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kelo-tsconfig-"));
  fs.writeFileSync(path.join(dir, "tsconfig.json"), content);
  return dir;
}

test("gen-tsconfig: 패치할 값이 있으면 tsconfig.json을 다시 쓴다", () => {
  const dir = makeProject('{ "compilerOptions": {}, "include": ["src"] }\n');
  try {
    assert.match(run(dir), /Patched:/);
    const patch = JSON.parse(
      fs.readFileSync(
        path.join(root, "rules/nextjs/base/tsconfig.patch.json"),
        "utf8",
      ),
    );
    const result = JSON.parse(
      fs.readFileSync(path.join(dir, "tsconfig.json"), "utf8"),
    );
    for (const key of Object.keys(patch.compilerOptions ?? {})) {
      assert.ok(key in result.compilerOptions, key);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("gen-tsconfig: 값이 그대로면 파일을 건드리지 않아 기존 서식이 유지된다", () => {
  const dir = makeProject('{ "compilerOptions": {}, "include": ["src"] }\n');
  try {
    run(dir);
    const file = path.join(dir, "tsconfig.json");
    // prettier가 맞춘 것처럼 한 줄 서식으로 바꿔 둔다 (값은 동일).
    const compact = JSON.stringify(JSON.parse(fs.readFileSync(file, "utf8")));
    fs.writeFileSync(file, compact);

    assert.match(run(dir), /Unchanged:/);
    assert.equal(fs.readFileSync(file, "utf8"), compact);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
