// kelo doctor: 미분류 파일 → 제안 위치 힌트(rules/<fw>/doctor.yaml)가 의도대로 매칭되는지.
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  globToRegExp,
  isNotInTsconfigMessage,
  loadHints,
  notInTsconfigLines,
  summarizeNotInTsconfig,
} from "../scripts/kelo-doctor.mjs";

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

test("tsconfig에 없는 파일: ruleId null + projectService 메시지만 감지", () => {
  const msg =
    "Parsing error: /a/src/x.spec.ts was not found by the project service. Consider either including it in the tsconfig.json or including it in allowDefaultProject.";
  assert.ok(isNotInTsconfigMessage({ ruleId: null, message: msg }));
  assert.ok(!isNotInTsconfigMessage({ ruleId: "x/y", message: msg }));
  assert.ok(
    !isNotInTsconfigMessage({
      ruleId: null,
      message: "Parsing error: ';' expected.",
    }),
  );
});

test("tsconfig에 없는 파일: 수·대표 파일·spec tsconfig 유무에 따른 안내", () => {
  assert.equal(summarizeNotInTsconfig([]), undefined);
  const files = ["a.spec.ts", "b.spec.ts", "c.test.ts", "d.test.ts"];
  const withSpec = notInTsconfigLines(
    summarizeNotInTsconfig(files, { specTsconfig: true }),
  ).join("\n");
  assert.match(withSpec, /4개/);
  assert.match(withSpec, /a\.spec\.ts, b\.spec\.ts, c\.test\.ts, …/);
  assert.doesNotMatch(withSpec, /d\.test\.ts/);
  assert.match(withSpec, /exclude/);
  assert.match(withSpec, /references.*tsconfig\.spec\.json.*composite: true/);
  const noSpec = notInTsconfigLines(summarizeNotInTsconfig(files)).join("\n");
  assert.match(noSpec, /tsconfig\.spec\.json을 만들어/);
  assert.doesNotMatch(noSpec, /allowDefaultProject/);
});
