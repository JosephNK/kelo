// =============================================================================
// boundaries/no-unknown-files · no-unknown-dependencies 래퍼
// -----------------------------------------------------------------------------
// 플러그인 규칙은 메시지 옵션이 없어(`context.report({ message })` 고정 문구)
// 에디터에 원문만 보인다. 플러그인 규칙의 `create`를 그대로 호출하되 `report`만
// 가로챈 context를 넘겨 메시지를 ARCHITECTURE.md 안내로 바꾼다. 나머지 context
// (settings·filename·options·sourceCode)는 원본을 프로토타입으로 물려받는다.
//
// rules/nestjs/base/custom-rules/boundaries-unknown.mjs 와
// rules/nextjs/base/custom-rules/boundaries-unknown.mjs 는 동일 내용을 유지한다.
// =============================================================================

import path from "node:path";

import boundaries from "eslint-plugin-boundaries";

const HOW_TO_REGISTER =
  "프로젝트 고유 레이어나 소스가 아닌 보조 파일이면, 사용자 확인 후 kelo.lint.json의 boundaryElements / boundaryIgnores에 추가";

/** 메시지의 상대 경로 기준 — boundaries root-path(소비 프로젝트 루트), 없으면 ESLint cwd. */
function relativePath(context) {
  const root = context.settings?.["boundaries/root-path"] ?? context.cwd;
  return path.relative(root, context.filename).split(path.sep).join("/");
}

function wrap(ruleName, describe) {
  const original = boundaries.rules[ruleName];
  return {
    meta: {
      ...original.meta,
      docs: {
        ...original.meta?.docs,
        description: `${original.meta?.docs?.description ?? ruleName} (kelo 안내 메시지)`,
      },
    },
    create(context) {
      const report = (descriptor) =>
        context.report({ node: descriptor.node, message: describe(context) });
      // ESLint rule context는 freeze돼 있어 Proxy로 report를 바꿀 수 없다 —
      // 원본을 프로토타입으로 둔 새 객체에 report만 덮어쓴다.
      return original.create(
        Object.create(context, { report: { value: report } }),
      );
    },
  };
}

export const noUnknownFiles = wrap(
  "no-unknown-files",
  (context) =>
    `[구조 위반] ${relativePath(context)}는 어떤 레이어 폴더에도 속하지 않습니다. docs/ARCHITECTURE.md 트리의 위치로 옮기세요. (${HOW_TO_REGISTER})`,
);

export const noUnknownDependencies = wrap(
  "no-unknown-dependencies",
  () =>
    `[구조 위반] import 대상 파일이 어떤 레이어 폴더에도 속하지 않습니다. 대상 파일을 docs/ARCHITECTURE.md 트리의 위치로 옮기세요. (${HOW_TO_REGISTER})`,
);
