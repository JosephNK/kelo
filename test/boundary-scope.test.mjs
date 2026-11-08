// node --test test/*.test.mjs
// 모듈 격리: 규칙의 `scope`가 boundaries v7 정책의 `captured` 조건으로 변환되는지.
import assert from "node:assert/strict";
import { test } from "node:test";

import { baseBoundaryElements as nestElements } from "../rules/nestjs/base/eslint-rules/boundaries/boundary-elements.mjs";
import { baseBoundaryRules as nestRules } from "../rules/nestjs/base/eslint-rules/boundaries/boundary-rules.mjs";
import {
  guidancePolicies,
  splitBoundaryElements,
  toBoundariesPolicies,
} from "../rules/nextjs/base/eslint-rules/builders/to-boundaries-policies.mjs";
import { baseBoundaryElements as nextElements } from "../rules/nextjs/base/eslint-rules/boundaries/boundary-elements.mjs";
import { baseBoundaryRules as nextRules } from "../rules/nextjs/base/eslint-rules/boundaries/boundary-rules.mjs";

const FILE_MODULE = "{{from.file.captured.module}}";
const ELEMENT_MODULE = "{{from.element.captured.module}}";

const elements = [
  {
    type: "svc",
    mode: "full",
    pattern: ["src/d/*/svc.ts"],
    capture: ["module"],
  },
  {
    type: "mdl",
    mode: "full",
    pattern: ["src/d/*/mdl.ts"],
    capture: ["module"],
  },
  { type: "shared", mode: "full", pattern: ["src/shared/*.ts"] },
  { type: "layer", pattern: ["src/m/**/layer/**"], capture: ["module"] },
  { type: "lib", pattern: ["src/lib"] },
];

const convert = (rules) => {
  const { classification } = splitBoundaryElements(elements);
  return toBoundariesPolicies(rules, classification);
};

test("capture가 file descriptor·폴더 element에 그대로 전달되고 모듈 레이어로 분류된다", () => {
  const { folderElements, fileDescriptors, classification } =
    splitBoundaryElements(elements);
  assert.deepEqual(fileDescriptors.find((d) => d.category === "svc").capture, [
    "module",
  ]);
  assert.deepEqual(folderElements.find((e) => e.type === "layer").capture, [
    "module",
  ]);
  assert.deepEqual([...classification.moduleTypes].sort(), [
    "layer",
    "mdl",
    "svc",
  ]);
});

test("scope: module — 모듈 레이어 대상만 from의 모듈로 묶고 scope 키는 제거", () => {
  const [policy] = convert([
    {
      from: { type: "svc" },
      allow: [{ to: { type: ["mdl", "shared", "layer", "lib"] } }],
      scope: "module",
    },
  ]);
  assert.equal("scope" in policy, false);
  assert.deepEqual(policy.from, { file: { categories: ["svc"] } });
  assert.deepEqual(policy.allow[0].to, [
    {
      element: { type: "layer", captured: { module: FILE_MODULE } },
      file: { categories: { noneOf: ["svc", "mdl", "shared"] } },
    },
    {
      element: { type: "lib" },
      file: { categories: { noneOf: ["svc", "mdl", "shared"] } },
    },
    { file: { categories: ["shared"] } },
    { file: { categories: ["mdl"], captured: { module: FILE_MODULE } } },
  ]);
});

test("scope: module — 폴더 레이어 from은 element의 captured를 쓰고, from type 배열은 type별로 나뉜다", () => {
  const policies = convert([
    {
      from: { type: ["layer", "svc"] },
      allow: { to: { type: "mdl" } },
      scope: "module",
    },
  ]);
  assert.equal(policies.length, 2);
  assert.deepEqual(policies[0].allow.to, {
    file: { categories: ["mdl"], captured: { module: ELEMENT_MODULE } },
  });
  assert.deepEqual(policies[1].allow.to, {
    file: { categories: ["mdl"], captured: { module: FILE_MODULE } },
  });
});

test("scope: cross-module·scope 없음 — captured 없이 변환, cross-module은 뒤로", () => {
  const policies = convert([
    {
      from: { type: "svc" },
      allow: { to: { type: "mdl" } },
      scope: "cross-module",
    },
    { from: { type: "lib" }, allow: { to: { type: "mdl" } } },
  ]);
  assert.deepEqual(policies[0].from.element.type, "lib");
  assert.deepEqual(policies[0].allow.to, { file: { categories: ["mdl"] } });
  assert.deepEqual(policies[1].from, { file: { categories: ["svc"] } });
  assert.deepEqual(policies[1].allow.to, { file: { categories: ["mdl"] } });
  assert.ok(policies.every((p) => !("scope" in p)));
});

test("guidance: 모듈 레이어 from은 같은 모듈 / 다른 모듈 / 공유로 나눠 안내", () => {
  const rules = [
    {
      from: { type: "svc" },
      allow: [{ to: { type: ["svc", "shared"] } }],
      scope: "module",
    },
    {
      from: { type: "svc" },
      allow: [{ to: { type: "mdl" } }],
      scope: "cross-module",
    },
    { from: { type: "lib" }, allow: [{ to: { type: "mdl" } }] },
  ];
  const { classification } = splitBoundaryElements(elements);
  const [svc, , , , lib] = guidancePolicies(rules, elements, classification);
  assert.match(
    svc.message,
    /svc가 import할 수 있는 레이어 — 같은 모듈: mdl, svc \/ 다른 모듈: mdl \/ 공유: shared\./,
  );
  assert.match(lib.message, /lib가 import할 수 있는 레이어: mdl\./);
});

test("kelo.lint.json 규칙(scope 없음)은 모듈 레이어 대상이어도 captured 없이 변환", () => {
  const { classification } = splitBoundaryElements(nestElements);
  const project = {
    from: { type: "libs" },
    allow: { to: { type: ["service", "common"] } },
  };
  const policies = toBoundariesPolicies(
    [...nestRules, project],
    classification,
  );
  const converted = policies.find(
    (p) =>
      p.from?.element?.type === "libs" &&
      JSON.stringify(p).includes('"service"'),
  );
  assert.deepEqual(converted.allow.to, [
    { element: { type: "service" } },
    { element: { type: "common" } },
  ]);
});

test("kelo.lint.json element의 capture·rule의 scope도 base와 같이 모듈 레이어로 변환", () => {
  // factory는 kelo.lint.json을 JSON.parse한 값을 base 뒤에 그대로 붙인다 (index.mjs [5])
  const lint = JSON.parse(
    JSON.stringify({
      boundaryElements: [
        {
          type: "job",
          pattern: "src/modules/**/job/**",
          capture: ["module"],
        },
      ],
      boundaryRules: [
        {
          from: { type: "job" },
          allow: { to: { type: ["service", "common"] } },
          scope: "module",
        },
      ],
    }),
  );
  const elements = [...nestElements, ...lint.boundaryElements];
  const { classification } = splitBoundaryElements(elements);
  assert.ok(classification.moduleTypes.has("job"));
  const [policy] = toBoundariesPolicies(lint.boundaryRules, classification);
  assert.deepEqual(policy.allow.to, [
    {
      element: {
        type: "service",
        captured: { module: ELEMENT_MODULE },
      },
    },
    { element: { type: "common" } },
  ]);
  const job = guidancePolicies(
    [...nestRules, ...lint.boundaryRules],
    elements,
    classification,
  ).at(-1);
  assert.match(
    job.message,
    /job가 import할 수 있는 레이어 — 같은 모듈: service/,
  );
});

test("base 규칙: scope가 있는 규칙은 모두 모듈 레이어 from이고, 정책에 scope가 남지 않는다", () => {
  for (const [els, rules] of [
    [nextElements, nextRules],
    [nestElements, nestRules],
  ]) {
    const { classification } = splitBoundaryElements(els);
    for (const rule of rules.filter((r) => r.scope)) {
      const types = [rule.from.type].flat();
      for (const t of types)
        assert.ok(
          classification.moduleTypes.has(t),
          `${t}는 모듈 레이어가 아님`,
        );
    }
    const policies = toBoundariesPolicies(rules, classification);
    assert.ok(policies.every((p) => !("scope" in p)));
    assert.ok(JSON.stringify(policies).includes("captured"));
  }
});
