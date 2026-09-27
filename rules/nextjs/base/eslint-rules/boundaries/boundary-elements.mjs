/**
 * 아키텍처 경계 — 각 레이어 type ↔ 경로 매핑.
 * `mode: 'full'`은 글로브로 전체 경로 매칭 (단일 파일·feature-first per-file glob).
 * 레이어 책임은 `baseLayerSemantics` 참조.
 */
export const baseBoundaryElements = [
  // Domain layer — 프레임워크 비의존 순수 TS. feature-first (`src/domain/<feature>/...`)
  { type: "domain-model", mode: "full", pattern: ["src/domain/*/model.ts"] }, // Entity·VO
  { type: "domain-error", mode: "full", pattern: ["src/domain/*/errors.ts"] }, // 도메인 에러
  { type: "domain-port", mode: "full", pattern: ["src/domain/*/port.ts"] }, // Repository 인터페이스
  {
    type: "domain-service",
    mode: "full",
    pattern: ["src/domain/*/service.ts"],
  }, // UseCase/서비스
  // HTTP adapter layer — feature-first, transport 명시. `src/http/<feature>/...`
  {
    type: "http-client",
    mode: "full",
    pattern: ["src/http/_generated/client.ts", "src/http/client.ts"],
  }, // HTTP 클라이언트 팩토리 (generated, 이전 위치 `src/http/client.ts` 포함)
  {
    type: "http-endpoint",
    mode: "full",
    pattern: ["src/http/_generated/endpoints.ts"],
  }, // (generated) URL 헬퍼
  { type: "http-dto", mode: "full", pattern: ["src/http/_generated/types.ts"] }, // (generated) DTO 타입
  {
    type: "http-service",
    mode: "full",
    pattern: ["src/http/_generated/services/*.ts"],
  }, // (generated) tag별 API 서비스 클래스
  { type: "http-mapper", mode: "full", pattern: ["src/http/*/mapper.ts"] }, // DTO ↔ Domain 변환
  {
    type: "http-repository",
    mode: "full",
    pattern: ["src/http/*/repository.ts"],
  }, // Port 구현체
  { type: "http-hook", mode: "full", pattern: ["src/http/*/hook.ts"] }, // TanStack Query 훅
  // Shared lib — layered code(domain/http)는 더 이상 lib 아래 두지 않고, lib는 공용 리소스 전담.
  // barrel은 lib-shared보다 먼저 정의 — 더 구체적인 pattern이 우선 매칭되어야 한다.
  {
    type: "lib-shared-barrel",
    mode: "full",
    pattern: ["src/lib/utils/index.ts"],
  }, // 공용 유틸 barrel (re-export 전용)
  { type: "lib-shared", mode: "full", pattern: ["src/lib/utils/*.ts"] }, // 공용 유틸 함수
  {
    type: "dictionary",
    mode: "full",
    pattern: [
      "src/i18n/dictionaries/*",
      "src/app/\\[locale\\]/dictionaries.ts",
    ],
  }, // i18n 사전 (로케일 메시지 JSON·TS)
  {
    type: "i18n-config",
    mode: "full",
    pattern: ["src/i18n/*.ts"],
  }, // next-intl 런타임 설정 (routing/request/navigation)
  { type: "shared-type", pattern: ["src/lib/types"] }, // 전역 타입
  // DB driver wrapper — 클라이언트 초기화·커넥션 풀·트랜잭션 관리 등 DB 인프라 전담
  // (MongoDB/PostgreSQL/Redis/TypeORM 등 드라이버 무관. 실제 드라이버 선택은 프로젝트 재량)
  { type: "db", pattern: ["src/db"] }, // DB 드라이버 래퍼
  // Shared client hooks — UI/HTTP 비의존 공용 React hook
  { type: "shared-hook", pattern: ["src/hooks"] }, // 전역 재사용 React hook
  // Style layer — 전역 CSS·디자인 토큰 (CSS custom property + TS 토큰)
  { type: "style", pattern: ["src/styles"] }, // 전역 스타일·토큰 리소스
  // Theme layer — 디자인 시스템 테마 설정 (Mantine `createTheme()`, Ant Design `ConfigProvider.theme`, shadcn 토큰 등)
  // 수기 작성한 `theme.ts` + generator 산출물 `theme.generated.ts` 두 파일을 함께 인정.
  {
    type: "theme",
    mode: "full",
    pattern: ["src/theme.ts", "src/theme.generated.ts"],
  }, // 디자인 시스템 테마 설정
  // UI layer
  { type: "shared-ui", pattern: ["src/components"] }, // 전역 재사용 컴포넌트
  { type: "page-component", pattern: ["src/app/\\[locale\\]/**/_components"] }, // 페이지 전용 컴포넌트 ([locale] 아래)
  { type: "page-provider", pattern: ["src/app/\\[locale\\]/**/_providers"] }, // 페이지 전용 Provider ([locale] 아래)
  // Server-rendered templates — 이메일 전송 시 서버에서 렌더링되는 템플릿 전용 공간
  { type: "email-template", pattern: ["src/email-templates"] }, // React Email 등 이메일 템플릿
  // Route Handler — Next.js App Router HTTP 엔드포인트 (GET/POST 등 export)
  { type: "route-handler", mode: "full", pattern: ["src/app/**/route.ts"] }, // API 진입점 (얇은 HTTP 어댑터)
  // Page (catch-all) — 위 패턴에 매칭 안 된 src/app 전부
  { type: "page", pattern: ["src/app"] }, // 최상위 페이지 catch-all
];
