// node --test test/*.test.mjs
// 경계 위반 안내 정책: 레이어별 허용 목록이 규칙에서 정확히 계산되는지.
import assert from "node:assert/strict";
import { test } from "node:test";

import { baseBoundaryElements as nestElements } from "../rules/nestjs/base/eslint-rules/boundaries/boundary-elements.mjs";
import { baseBoundaryRules as nestRules } from "../rules/nestjs/base/eslint-rules/boundaries/boundary-rules.mjs";
import {
  guidancePolicies,
  splitBoundaryElements,
} from "../rules/nextjs/base/eslint-rules/builders/to-boundaries-policies.mjs";
import { baseBoundaryElements as nextElements } from "../rules/nextjs/base/eslint-rules/boundaries/boundary-elements.mjs";
import { baseBoundaryRules as nextRules } from "../rules/nextjs/base/eslint-rules/boundaries/boundary-rules.mjs";

const messageFor = (elements, rules, type) => {
  const { classification } = splitBoundaryElements(elements);
  const policies = guidancePolicies(rules, elements, classification);
  const types = [...new Set(elements.map((e) => e.type))];
  return policies[types.indexOf(type)].message;
};

test("Next.js: 배열 형태 allow에서 같은/다른 모듈 허용 목록 계산", () => {
  const msg = messageFor(nextElements, nextRules, "domain-service");
  assert.match(
    msg,
    /domain-service가 import할 수 있는 레이어 — 같은 모듈: domain-error, domain-model, domain-port, domain-service \/ 다른 모듈: domain-model, domain-port\./,
  );
  // 모듈 레이어가 아닌 from은 기존 형식 (모듈 레이어 대상은 어느 모듈이든)
  assert.match(
    messageFor(nextElements, nextRules, "route-handler"),
    /route-handler가 import할 수 있는 레이어: domain-error, domain-model, domain-service, http-factory, i18n-config, shared-type\./,
  );
  assert.match(
    messageFor(nextElements, nextRules, "http-client"),
    /http-client는 다른 레이어를 import할 수 없습니다/,
  );
});

test("NestJS: 객체 allow + type 배열에서 같은 모듈 / 다른 모듈 / 공유 구분", () => {
  const msg = messageFor(nestElements, nestRules, "service");
  assert.match(
    msg,
    /service가 import할 수 있는 레이어 — 같은 모듈: exception, model, module-common, port \/ 다른 모듈: model, port \/ 공유: common, common-pure, infrastructure-shared\./,
  );
  assert.match(
    messageFor(nestElements, nestRules, "exception"),
    /같은 모듈: exception, module-common \/ 다른 모듈: 없음 \/ 공유: common, common-pure\./,
  );
  assert.match(
    messageFor(nestElements, nestRules, "libs"),
    /libs가 import할 수 있는 레이어: common, common-pure, infrastructure, infrastructure-shared, libs\./,
  );
});

test("모든 레이어가 안내 정책을 갖고, 정책은 금지(disallow)만 한다", () => {
  for (const [elements, rules] of [
    [nextElements, nextRules],
    [nestElements, nestRules],
  ]) {
    const { classification } = splitBoundaryElements(elements);
    const policies = guidancePolicies(rules, elements, classification);
    assert.equal(policies.length, new Set(elements.map((e) => e.type)).size);
    assert.ok(
      policies.every(
        (p) => p.disallow && !p.allow && p.message.startsWith("[경계 위반]"),
      ),
    );
  }
});
