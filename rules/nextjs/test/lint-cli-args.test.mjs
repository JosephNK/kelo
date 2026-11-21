import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { parseArgs, resolveCacheLocation } from "../lib/lint-cli-args.mjs";

test("parseArgs: 캐시 옵션이 없으면 ESLint 기본값과 같다", () => {
  const args = parseArgs(["--fix", "src"], "kelo-lint-nextjs");
  assert.equal(args.cache, false);
  assert.equal(args.cacheLocation, undefined);
  assert.equal(args.cacheStrategy, "metadata");
  assert.deepEqual(args.patterns, ["src"]);
});

test("parseArgs: 캐시 옵션을 읽는다", () => {
  const args = parseArgs(
    [
      "--cache",
      "--cache-location",
      ".eslintcache",
      "--cache-strategy",
      "content",
    ],
    "kelo-lint-nextjs",
  );
  assert.equal(args.cache, true);
  assert.equal(args.cacheLocation, ".eslintcache");
  assert.equal(args.cacheStrategy, "content");
  assert.deepEqual(args.patterns, []);
});

test("resolveCacheLocation: 생략하면 ESLint 기본값에 맡긴다", () => {
  assert.equal(
    resolveCacheLocation({
      location: undefined,
      cwd: "/repo",
      root: "/repo/apps/web",
      rootCount: 2,
    }),
    undefined,
  );
});

test("resolveCacheLocation: 파일 경로는 호출 위치 기준으로 풀고, 루트가 하나면 그대로 쓴다", () => {
  assert.equal(
    resolveCacheLocation({
      location: ".eslintcache",
      cwd: "/repo/apps/web",
      root: "/repo/apps/web",
      rootCount: 1,
    }),
    path.resolve("/repo/apps/web/.eslintcache"),
  );
});

test("resolveCacheLocation: 루트가 여럿이면 파일 경로에 루트별 접미사를 붙인다", () => {
  const resolve = (root) =>
    resolveCacheLocation({
      location: ".eslintcache",
      cwd: "/repo",
      root,
      rootCount: 2,
    });
  const web = resolve("/repo/apps/web");
  const api = resolve("/repo/apps/api");
  assert.match(web, /\.eslintcache\.[0-9a-f]{8}$/);
  assert.notEqual(web, api);
  assert.equal(web, resolve("/repo/apps/web"));
});

test("resolveCacheLocation: 디렉터리는 구분자를 붙여 넘긴다 (ESLint가 루트별 파일 생성)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kelo-cache-"));
  try {
    const expected = dir + path.sep;
    for (const location of [dir, "cache/"]) {
      const out = resolveCacheLocation({
        location,
        cwd: location === dir ? "/repo" : dir,
        root: "/repo/apps/web",
        rootCount: 2,
      });
      assert.equal(
        out,
        location === dir ? expected : path.join(dir, "cache") + path.sep,
      );
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
