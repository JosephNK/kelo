// node --test test
// ARCHITECTURE.md "프로젝트 확장" 섹션 — kelo.lint.json 확장이 문서에 드러나야 한다.
import assert from "node:assert/strict";
import { test } from "node:test";

import { renderProjectExtensions } from "../scripts/architecture-extensions.mjs";

test("확장이 없으면 섹션을 만들지 않는다", () => {
  assert.equal(renderProjectExtensions(null), "");
  assert.equal(renderProjectExtensions({}), "");
  assert.equal(renderProjectExtensions({ ignores: ["dist/**"] }), "");
});

test("추가 레이어·규칙·제외를 표로 보여 준다", () => {
  const md = renderProjectExtensions({
    boundaryElements: [
      { type: "server-core", pattern: ["src/lib/server"] },
      { type: "auth", mode: "full", pattern: ["src/auth.ts"] },
    ],
    boundaryRules: [
      {
        from: { type: ["page", "route-handler"] },
        allow: [{ to: { type: "server-core" } }],
      },
      { from: { type: "server-core" }, allow: [] },
    ],
    boundaryIgnores: ["src/legacy/**"],
  });
  assert.match(md, /^## 프로젝트 확장/);
  assert.match(md, /\| `server-core` \| `src\/lib\/server` \| 폴더 \|/);
  assert.match(md, /\| `auth` \| `src\/auth.ts` \| 파일 \|/);
  assert.match(md, /\| `page`, `route-handler` \| `server-core` \|/);
  assert.match(md, /\| `server-core` \| \(없음\) \|/);
  assert.match(md, /- `src\/legacy\/\*\*`/);
});
