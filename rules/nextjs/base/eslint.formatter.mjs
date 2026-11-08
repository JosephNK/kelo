// =============================================================================
// Kelo ESLint Message Formatter (Next.js base)
// -----------------------------------------------------------------------------
// 일부 룰의 기본 에러 메시지를 프로젝트 컨텍스트에 맞는 가이드 문구로 재작성한
// 뒤, ESLint 기본 stylish formatter로 렌더링한다. 다른 룰의 메시지는 원본 그대로
// 통과하므로 전체 lint 출력을 망가뜨리지 않는다.
//
// 사용법 (프로젝트 root 기준):
//   pnpm eslint --format eslint-config-kelo-nextjs/formatter
//   또는 package.json:
//     "lint": "eslint --format eslint-config-kelo-nextjs/formatter ."
//
// 추가 룰 메시지 커스터마이징이 필요하면 MESSAGE_OVERRIDES에 항목 추가.
//   - key   : ESLint ruleId
//   - value : (message, result) => string
// 미등록 룰은 원본 메시지 그대로 통과한다.
// =============================================================================

import path from "node:path";

import { ESLint } from "eslint";

const HOW_TO_REGISTER =
  "프로젝트 고유 레이어나 소스가 아닌 보조 파일이면, 사용자 확인 후 kelo.lint.json의 boundaryElements / boundaryIgnores에 추가";

const MESSAGE_OVERRIDES = {
  "boundaries/no-unknown-files": (_message, result) =>
    `[구조 위반] ${path.relative(process.cwd(), result.filePath)}는 어떤 레이어 폴더에도 속하지 않습니다. docs/ARCHITECTURE.md 트리의 위치로 옮기세요. (${HOW_TO_REGISTER})`,

  "boundaries/no-unknown-dependencies": () =>
    `[구조 위반] import 대상 파일이 어떤 레이어 폴더에도 속하지 않습니다. 대상 파일을 docs/ARCHITECTURE.md 트리의 위치로 옮기세요. (${HOW_TO_REGISTER})`,
};

export default async function keloEslintFormatter(results) {
  for (const result of results) {
    for (const message of result.messages) {
      const override = MESSAGE_OVERRIDES[message.ruleId];
      if (override) {
        message.message = override(message, result);
      }
    }
  }
  const eslint = new ESLint();
  const stylish = await eslint.loadFormatter("stylish");
  return stylish.format(results);
}
