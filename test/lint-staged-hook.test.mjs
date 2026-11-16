// node --test test
// 모노레포 루트 pre-commit의 lint-staged 연결 — 설정이 하나뿐이면 --cwd로 고정해야 한다.
import assert from "node:assert/strict";
import { test } from "node:test";

import { wireLintStagedHook } from "../scripts/common.mjs";

test("설정이 하나뿐이면 인자 없는 lint-staged 줄에 --cwd를 붙인다 (실행기 유지)", () => {
  assert.deepEqual(wireLintStagedHook("npx lint-staged\n", "apps/web", 1), {
    hook: "npx lint-staged --cwd apps/web\n",
    action: "replaced",
  });
  const r = wireLintStagedHook(
    "echo start\npnpm exec lint-staged\nbash apps/app/scripts/kelo-pre-commit.sh\n",
    "apps/web",
    1,
  );
  assert.equal(
    r.hook,
    "echo start\npnpm exec lint-staged --cwd apps/web\nbash apps/app/scripts/kelo-pre-commit.sh\n",
  );
});

test("설정이 2개 이상이면 인자 없는 줄을 그대로 둔다", () => {
  const hook = "npx lint-staged\n";
  assert.deepEqual(wireLintStagedHook(hook, "apps/web", 2), {
    hook,
    action: "unchanged",
  });
});

test("이미 --cwd <rel> 줄이 있으면 그대로 둔다", () => {
  const hook = "pnpm exec lint-staged --cwd apps/web\n";
  assert.equal(wireLintStagedHook(hook, "apps/web", 1).action, "unchanged");
});

test("인자 없는 줄이 없으면 --cwd 줄을 덧붙인다 (다른 워크스페이스 줄은 유지)", () => {
  const r = wireLintStagedHook(
    "npx lint-staged --cwd apps/web\n",
    "apps/admin",
    2,
  );
  assert.equal(r.action, "appended");
  assert.match(r.hook, /^npx lint-staged --cwd apps\/web\n/);
  assert.match(r.hook, /\nnpx lint-staged --cwd apps\/admin\n$/);
});

test("주석 줄과 다른 경로의 --cwd는 연결된 것으로 보지 않는다", () => {
  const r = wireLintStagedHook(
    "# npx lint-staged\nnpx lint-staged --cwd apps/web-admin\n",
    "apps/web",
    1,
  );
  assert.equal(r.action, "appended");
  assert.match(r.hook, /^# npx lint-staged\n/);
});
