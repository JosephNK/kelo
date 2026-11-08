// =============================================================================
// Rule: no-inline-style-tokens
// -----------------------------------------------------------------------------
// JSX 인라인 `style={{ ... }}` 객체의 토큰 key(폰트/라운드/그림자/색상 계열)에
// Literal 값 하드코딩을 차단한다. stylelint가 커버하지 못하는 .tsx 인라인
// 스타일 공백을 메우는 룰.
//
// 이유:
// - stylelint는 CSS kebab-case(`border-radius` 등)만 가드한다. 프로젝트에서
//   `style={{ borderRadius: 12 }}` 형태로 JSX 인라인 스타일을 쓰면 기존 토큰
//   가드가 모두 우회된다.
//
// 허용:
// - MemberExpression: `theme.radius.sm`, `theme.colors.primary[6]`, `token.colorPrimary`
// - `var(...)` 문자열: `'var(--shadow-sm)'` — negative lookahead로 통과
// - TemplateLiteral: `\`${x}px\`` — 동적 값 escape
// - Identifier: `radiusVar` — 변수 참조
//
// 차단:
// - numeric Literal: `borderRadius: 12`
// - non-`var()` string Literal: `fontFamily: 'Inter'`, `color: '#ff0000'`
//
// 한계:
// - Inline `style` prop 내부만 커버. 객체 리터럴이 별도 변수(`const cfg = { ... }`)로
//   분리되어 style에 spread되는 케이스는 AST로 안정적으로 스코프할 수 없음.
// - CSS 파일(`.css`, `.module.css`)의 토큰 하드코딩은 stylelint 영역.
// =============================================================================

// 색상/레이아웃 토큰 key 목록 (camelCase). Identifier key와 string-literal key
// 양쪽 selector에 공통으로 사용하기 위해 상수로 분리.
const TOKEN_KEYS =
  "fontFamily|borderRadius|boxShadow|color|backgroundColor|background|borderColor|outlineColor|fill|stroke";

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow hardcoded literal values for design tokens in JSX inline style prop",
    },
    messages: {
      identifierKey:
        "Do not hardcode inline style tokens in JSX style prop. Use theme references (e.g., theme.radius.*, theme.colors.*, theme.shadows.*, var(--*)) instead of raw literals.",
      stringLiteralKey:
        "Do not hardcode inline style tokens in JSX style prop (string-literal key). Use theme references.",
    },
    schema: [],
  },
  create(context) {
    return {
      // (a) 표준 케이스: identifier key (JSX 관용)
      [`JSXAttribute[name.name='style'] Property[key.type='Identifier'][key.name=/^(${TOKEN_KEYS})$/][value.type='Literal'][value.value=/^(?!var\\()/]`](
        node,
      ) {
        context.report({ node, messageId: "identifierKey" });
      },
      // (b) 엣지 케이스: string-literal key (`{ 'fontFamily': 'x' }`)
      [`JSXAttribute[name.name='style'] Property[key.type='Literal'][key.value=/^(${TOKEN_KEYS})$/][value.type='Literal'][value.value=/^(?!var\\()/]`](
        node,
      ) {
        context.report({ node, messageId: "stringLiteralKey" });
      },
    };
  },
};
