// stacks.yaml 메타(conflicts) 검증과 kelo.yaml 스택 선택 검증.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

import {
  checkStackDefinitions,
  checkStackSelection,
} from "../scripts/stacks.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("저장소의 stacks.yaml은 모두 유효하다", () => {
  for (const fw of ["nextjs", "nestjs", "flutter"]) {
    const file = path.join(ROOT, "rules", fw, "stacks.yaml");
    assert.deepEqual(
      checkStackDefinitions(YAML.parse(fs.readFileSync(file, "utf8"))),
      [],
      fw,
    );
  }
});

test("정의 오류: 알 수 없는 키, 없는 스택, 자기 자신, description 누락", () => {
  const errors = checkStackDefinitions({
    a: { description: "A", conflicts: ["a", "zzz"], typo: 1 },
    b: {},
  });
  assert.equal(errors.length, 4);
  assert.ok(errors.some((e) => /알 수 없는 키 typo/.test(e)));
  assert.ok(errors.some((e) => /zzz는 정의되지 않은/.test(e)));
  assert.ok(errors.some((e) => /자기 자신/.test(e)));
  assert.ok(errors.some((e) => /^b: description/.test(e)));
});

test("선택 검증: conflicts는 한쪽 선언만으로 양방향 적용, 한 번만 보고", () => {
  const defined = {
    x: { description: "X", conflicts: ["y"] },
    y: { description: "Y" },
    z: { description: "Z" },
  };
  assert.deepEqual(checkStackSelection(defined, ["x", "z"]), []);
  assert.deepEqual(checkStackSelection(defined, ["y", "x"]), [
    "y와 x는 함께 선택할 수 없습니다",
  ]);
  assert.match(checkStackSelection(defined, ["q"])[0], /알 수 없는 스택 q/);
});
