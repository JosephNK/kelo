// kelo doctor: 미분류 파일 → 제안 위치 힌트(rules/<fw>/doctor.yaml)가 의도대로 매칭되는지.
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { globToRegExp, loadHints } from "../scripts/kelo-doctor.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const suggestFor = (fw, file) =>
  loadHints(ROOT, fw).find((h) => h.re.test(file))?.suggest;

test("glob: ** 는 여러 세그먼트, * 는 한 세그먼트", () => {
  assert.ok(
    globToRegExp("src/modules/**/services/**").test(
      "src/modules/a/b/services/x.ts",
    ),
  );
  assert.ok(!globToRegExp("src/http/*").test("src/http/user/hook.ts"));
  assert.ok(globToRegExp("src/http/*").test("src/http/index.ts"));
});

test("Next.js 힌트", () => {
  assert.match(
    suggestFor("nextjs", "src/services/user.ts"),
    /domain\/<feature>\/service\.ts/,
  );
  assert.match(suggestFor("nextjs", "src/http/index.ts"), /client\.ts만/);
  assert.match(
    suggestFor("nextjs", "src/lib/dictionaries/en.ts"),
    /i18n\/dictionaries/,
  );
});

test("NestJS 힌트 (복수 폴더명·infrastructure 기준)", () => {
  assert.match(
    suggestFor("nestjs", "src/modules/order/services/a.service.ts"),
    /^service\//,
  );
  assert.match(
    suggestFor("nestjs", "src/modules/admin/member/entities/m.ts"),
    /orm-entity/,
  );
  assert.match(
    suggestFor("nestjs", "src/infrastructure/queue/q.ts"),
    /infrastructure-shared/,
  );
});

test("확신 없는 경로는 힌트 없음 (기본 안내로)", () => {
  assert.equal(suggestFor("nextjs", "src/weird/x.ts"), undefined);
});
