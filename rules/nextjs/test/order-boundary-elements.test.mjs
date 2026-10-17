// node --test rules/nextjs/test
// boundary element 순서 회귀 테스트 — catch-all(`page`)이 스택·프로젝트 element를 가리지 않아야 한다.
import assert from "node:assert/strict";
import { matchesGlob } from "node:path";
import { test } from "node:test";

import { baseBoundaryElements } from "../base/eslint-rules/boundaries/boundary-elements.mjs";
import { orderBoundaryElements } from "../base/eslint-rules/builders/order-boundary-elements.mjs";
import { splitBoundaryElements } from "../base/eslint-rules/builders/to-boundaries-policies.mjs";
import { nextauthBoundaryElements } from "../nextauth/eslint.rules.mjs";

// tanuki apps/web/kelo.lint.json 사례
const projectElements = [
  { type: "page-component", pattern: ["src/app/**/_components"] },
  { type: "route-handler", pattern: ["src/middleware.ts"], mode: "full" },
  { type: "page-provider", pattern: ["src/app/**/_providers"] },
];

/** 폴더 element first-match 분류 (v7: pattern은 폴더, 그 아래 파일이 속한다). */
function classify(folderElements, file) {
  const hit = folderElements.find((e) =>
    [e.pattern].flat().some((p) => matchesGlob(file, `${p}/**`)),
  );
  return hit?.type ?? null;
}

const ordered = () =>
  orderBoundaryElements([
    ...baseBoundaryElements,
    ...nextauthBoundaryElements,
    ...projectElements,
  ]);

test("fallback element는 맨 뒤, 나머지는 입력 순서 유지", () => {
  const out = ordered();
  assert.equal(out.at(-1).type, "page");
  const nonFallback = [
    ...baseBoundaryElements.filter((e) => !e.fallback),
    ...nextauthBoundaryElements,
    ...projectElements,
  ].map((e) => e.type);
  assert.deepEqual(
    out.slice(0, -1).map((e) => e.type),
    nonFallback,
  );
});

test("fallback 키는 플러그인 설정에 남지 않는다", () => {
  assert.ok(ordered().every((e) => !("fallback" in e)));
});

test("base catch-all `page`가 fallback으로 표시돼 있다", () => {
  const page = baseBoundaryElements.find((e) => e.type === "page");
  assert.equal(page.fallback, true);
  assert.deepEqual(page.pattern, ["src/app"]);
});

test("프로젝트 element가 catch-all보다 먼저 매칭된다", () => {
  const { folderElements } = splitBoundaryElements(ordered());
  assert.equal(
    classify(folderElements, "src/app/_components/app-nav.tsx"),
    "page-component",
  );
  assert.equal(
    classify(folderElements, "src/app/settings/_providers/query.tsx"),
    "page-provider",
  );
  assert.equal(classify(folderElements, "src/app/settings/page.tsx"), "page");
  // base의 구체 element는 여전히 우선
  assert.equal(
    classify(folderElements, "src/app/[locale]/home/_components/hero.tsx"),
    "page-component",
  );
});

test("route.ts는 page 폴더 안에서도 route-handler 카테고리로 제외된다", () => {
  const { fileDescriptors, classification } = splitBoundaryElements(ordered());
  const routeHandler = fileDescriptors.filter(
    (d) => d.category === "route-handler",
  );
  assert.deepEqual(
    routeHandler.flatMap((d) => d.pattern),
    ["src/app/**/route.ts", "src/middleware.ts"],
  );
  assert.ok(
    classification.excludedCategories.get("page").includes("route-handler"),
  );
});
