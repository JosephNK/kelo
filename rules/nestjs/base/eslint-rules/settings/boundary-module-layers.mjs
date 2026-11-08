/**
 * `src/modules/<domain>/<layer>/` 위치에 들어가는 layer SSOT.
 * boundary-elements는 spread로 인용하고, 커스텀 룰
 * (`no-unknown-domain-folder`, `no-nested-layer-dir`)은 `MODULE_LAYER_DIRS`로
 * 레이어 폴더 이름 집합을 쓴다.
 *
 * `capture: ["module"]`은 `src/modules/` 뒤의 `**`(`<domain>` 또는
 * `<group>/<domain>`)를 모듈 키로 잡는다 — 모듈 간 격리 규칙(`scope`)의 기준.
 *
 * 새 layer 추가 시:
 *   1) 이 배열에 `{ type, pattern, capture, // 설명 }` 추가
 *   2) `boundary-rules.mjs`에 from/to 정책 추가
 *   3) layer-semantics.mjs에 Role/Contains/Example 추가
 */
export const MODULE_LAYERS = [
  { type: "model", pattern: ["src/modules/**/model/**"], capture: ["module"] }, // 도메인 모델
  { type: "port", pattern: ["src/modules/**/port/**"], capture: ["module"] }, // 도메인 Port 인터페이스
  {
    type: "service",
    pattern: ["src/modules/**/service/**"],
    capture: ["module"],
  }, // UseCase
  {
    type: "controller",
    pattern: ["src/modules/**/controller/**"],
    capture: ["module"],
  }, // HTTP 컨트롤러
  {
    type: "strategy",
    pattern: ["src/modules/**/strategy/**"],
    capture: ["module"],
  }, // Inbound 어댑터 (Passport 등 인증 전략) 또는 가변 알고리즘
  {
    type: "provider",
    pattern: ["src/modules/**/provider/**"],
    capture: ["module"],
  }, // Port 구현체
  {
    type: "exception",
    pattern: ["src/modules/**/exception/**"],
    capture: ["module"],
  }, // 도메인 예외
  { type: "dto", pattern: ["src/modules/**/dto/**"], capture: ["module"] }, // 요청/응답 DTO
  {
    type: "module-common",
    pattern: ["src/modules/**/common/**"],
    capture: ["module"],
  }, // 모듈 내부 공용 (같은 모듈에서만 import)
];

/** 레이어 폴더 이름 (`src/modules/**\/<dir>/**`의 `<dir>`) — type과 다를 수 있다 (`module-common` → `common`). */
export const MODULE_LAYER_DIRS = MODULE_LAYERS.map((layer) =>
  layer.pattern[0].split("/").at(-2),
);
