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

import { ESLint } from "eslint";

const MESSAGE_OVERRIDES = {
  "boundaries/no-unknown-files": () =>
    [
      "[구조 위반] baseBoundaryElements에 등록되지 않은 파일입니다.",
      "  대응 순서:",
      "    1. lint-rules-structure-reference.md에 정의된 레이어인지 확인",
      "    2. 프로젝트 고유 레이어라면 kelo.lint.json의 boundaryElements에 추가 (사용자 확인 필요)",
      "    3. 소스가 아닌 보조 파일이라면 kelo.lint.json의 boundaryIgnores에 추가 (사용자 확인 필요)",
    ].join("\n"),

  "boundaries/no-unknown-dependencies": () =>
    [
      "[import 위반] 등록되지 않은 레이어에서 import 했습니다.",
      "  → lint-rules-reference.md의 의존성 규칙 표 참고",
    ].join("\n"),
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
