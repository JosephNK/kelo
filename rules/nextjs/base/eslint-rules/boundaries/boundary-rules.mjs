/**
 * 레이어 간 import 관계 (allow-list). 기본 disallow 정책 위에 아래 조합만 허용.
 * 각 레이어의 역할·책임은 "레이어 글로서리" 섹션 참조.
 */
export const baseBoundaryRules = [
  // Domain: 자기 자신 및 하위 순수 레이어만 참조
  { from: { type: "domain-model" }, allow: [{ to: { type: "domain-model" } }] }, // 모델 간 참조만
  { from: { type: "domain-error" }, allow: [{ to: { type: "domain-error" } }] }, // 에러 간 참조만
  { from: { type: "domain-port" }, allow: [{ to: { type: "domain-model" } }] }, // Port 시그니처는 모델을 사용
  {
    from: { type: "domain-service" },
    allow: [
      { to: { type: "domain-model" } },
      { to: { type: "domain-port" } }, // DI로 Port를 주입받음
      { to: { type: "domain-error" } },
      { to: { type: "domain-service" } },
    ],
  },
  // HTTP 원시 계층: 외부에서만 주입받아 쓰므로 import 0개 (순수 데이터/통신 경계)
  { from: { type: "http-client" }, allow: [] },
  { from: { type: "http-endpoint" }, allow: [] },
  { from: { type: "http-dto" }, allow: [] },
  {
    // Service: tag별 generated API 서비스 클래스. endpoints + DTO만 참조 (KyInstance는 외부 주입).
    from: { type: "http-service" },
    allow: [{ to: { type: "http-endpoint" } }, { to: { type: "http-dto" } }],
  },
  {
    // Mapper: DTO → Domain 변환 전용. 두 타입 모두 참조 필요
    from: { type: "http-mapper" },
    allow: [{ to: { type: "domain-model" } }, { to: { type: "http-dto" } }],
  },
  {
    // Repository: Port 구현체. 모든 원시 통신 요소 + domain 사용.
    // db는 DB 드라이버 래퍼(MongoDB/PostgreSQL/Redis/TypeORM 등 드라이버 무관) — Repository는 실제 DB 호출을 담당하므로 허용.
    // http-service는 generated tag별 클래스 — Repository가 instantiate해서 사용.
    from: { type: "http-repository" },
    allow: [
      { to: { type: "http-client" } },
      { to: { type: "http-endpoint" } },
      { to: { type: "http-dto" } }, // type-safe `client.get<UserDto>(...)` 호출용
      { to: { type: "http-service" } }, // generated 서비스 인스턴스화
      { to: { type: "http-mapper" } },
      { to: { type: "domain-port" } },
      { to: { type: "domain-error" } },
      { to: { type: "domain-model" } },
      { to: { type: "db" } },
    ],
  },
  // Hook: UI에 제공되는 데이터 페칭 훅 + Service 팩토리. 데이터 호출은 domain-service만, http-repository는 Service 팩토리에서 Port 구현체 주입 용도로만, domain-model은 useMutation/useQuery 타입 시그니처용으로 허용.
  {
    from: { type: "http-hook" },
    allow: [
      { to: { type: "domain-service" } },
      { to: { type: "http-repository" } }, // Service 팩토리에서 Port 구현체 주입용 (데이터 호출 금지)
      { to: { type: "domain-model" } }, // useMutation/useQuery 타입 시그니처용
    ],
  },
  // lib-shared: src/lib 루트 공용 유틸. 내부 의존 0개 (순수 유틸만)
  { from: { type: "lib-shared" }, allow: [] },
  // lib-shared-barrel: re-export 전용 (`src/lib/utils/index.ts`). barrel → leaf만 허용.
  // 다른 레이어에서 `@/lib/utils`로 한 번에 import할 수 있게 하되, utility 간 cross-import는 base의 lib-shared 규칙으로 여전히 차단.
  {
    from: { type: "lib-shared-barrel" },
    allow: [{ to: { type: "lib-shared" } }],
  },
  // db: DB 드라이버 래퍼 — 프로젝트 내 어떤 element도 import 하지 않는다 (순수 래퍼).
  // mongodb/pg/redis/typeorm 등 외부 드라이버 패키지는 element 규칙 대상 아님 → allow: [] 로 충분.
  { from: { type: "db" }, allow: [] },
  {
    // 공용 React hook: UI/HTTP 비의존 — domain-service/http-hook 호출 금지.
    // 도메인 모델은 타입 표현용으로만 참조. 다른 공용 hook 조합 허용.
    // style은 TS 디자인 토큰(예: tokens.ts) 참조용으로만 허용.
    from: { type: "shared-hook" },
    allow: [
      { to: { type: "lib-shared" } },
      { to: { type: "lib-shared-barrel" } },
      { to: { type: "shared-type" } },
      { to: { type: "domain-model" } },
      { to: { type: "shared-hook" } },
      { to: { type: "style" } },
    ],
  },
  {
    // 전역 재사용 UI: 도메인 모델은 타입 표현용으로만 참조. API 호출 금지 (domain-service 접근 불가)
    // next-intl navigation(Link/useRouter) 사용을 위해 i18n-config 허용.
    // style은 컴포넌트 스코프 CSS·디자인 토큰 참조용. theme은 디자인 시스템 토큰 참조용.
    from: { type: "shared-ui" },
    allow: [
      { to: { type: "domain-model" } },
      { to: { type: "shared-ui" } },
      { to: { type: "shared-hook" } },
      { to: { type: "shared-type" } },
      { to: { type: "i18n-config" } },
      { to: { type: "style" } },
      { to: { type: "theme" } },
    ],
  },
  {
    // 페이지 전용 컴포넌트: hook으로 데이터 조회 + UI 조합 + 공용 유틸 사용
    // next-intl navigation 사용을 위해 i18n-config 허용.
    from: { type: "page-component" },
    allow: [
      { to: { type: "http-hook" } },
      { to: { type: "shared-ui" } },
      { to: { type: "shared-hook" } },
      { to: { type: "domain-model" } },
      { to: { type: "page-component" } },
      { to: { type: "lib-shared" } },
      { to: { type: "lib-shared-barrel" } },
      { to: { type: "shared-type" } },
      { to: { type: "i18n-config" } },
      { to: { type: "style" } },
      { to: { type: "theme" } },
    ],
  },
  {
    // 페이지 Provider: 설정/컨텍스트 래퍼. 공용 유틸·hook + 테마 토큰 적용용 style/theme 허용.
    from: { type: "page-provider" },
    allow: [
      { to: { type: "lib-shared" } },
      { to: { type: "lib-shared-barrel" } },
      { to: { type: "shared-hook" } },
      { to: { type: "style" } },
      { to: { type: "theme" } },
    ],
  },
  // style: 전역 CSS·디자인 토큰 리소스. 다른 레이어 import 금지 — 동일 레이어 cross-ref만 허용
  // (CSS @import는 ESLint 미검사; TS 토큰 파일 간 조합용).
  { from: { type: "style" }, allow: [{ to: { type: "style" } }] },
  // theme: 디자인 시스템 테마 설정. TS 디자인 토큰(style) + 동일 레이어(theme) 참조만 — 도메인/HTTP/UI 레이어 import 금지.
  // self-allow: `theme.ts`가 generator 산출물 `theme.generated.ts`를 import하는 경우(둘 다 `type: "theme"`)를 위해 필요.
  // 외부 디자인 시스템 패키지(mantine/antd/shadcn 등)는 element 규칙 대상 아님.
  {
    from: { type: "theme" },
    allow: [{ to: { type: "style" } }, { to: { type: "theme" } }],
  },
  {
    // i18n 사전: 타입과 다른 사전 참조만 허용
    from: { type: "dictionary" },
    allow: [{ to: { type: "shared-type" } }, { to: { type: "dictionary" } }],
  },
  {
    // i18n 런타임 설정 (next-intl routing/request/navigation): 사전(dictionary) + 동일 레이어 참조 허용.
    // 도메인/HTTP/UI 레이어 import 금지 — 설정 파일은 외부 패키지(next-intl)와 사전만 다룬다.
    // self-allow: request.ts가 routing.ts의 locales를 참조하는 등 동일 레이어 내 협력이 필수.
    from: { type: "i18n-config" },
    allow: [{ to: { type: "dictionary" } }, { to: { type: "i18n-config" } }],
  },
  // 전역 타입: i18n 키 타입 조회를 위해 dictionary 참조 허용
  { from: { type: "shared-type" }, allow: [{ to: { type: "dictionary" } }] },
  {
    // 이메일 템플릿: i18n 사전과 공통 타입만 접근 가능.
    // 도메인/HTTP 레이어를 직접 import하면 서버 전용 로직이 이메일 렌더 경로로 새게 된다.
    // 필요한 데이터는 호출자(route-handler 등)가 props로 주입해야 한다.
    from: { type: "email-template" },
    allow: [{ to: { type: "dictionary" } }, { to: { type: "shared-type" } }],
  },
  {
    // Route Handler (HTTP 진입점): 얇은 어댑터 — 도메인 서비스 호출에 집중.
    // UI 레이어(shared-ui/page-component) import 금지 (서버 코드 경계 위반).
    // 프록시·핸들러에서 로케일 검증/협상을 위해 i18n-config 허용.
    from: { type: "route-handler" },
    allow: [
      { to: { type: "domain-model" } },
      { to: { type: "domain-error" } },
      { to: { type: "domain-service" } },
      { to: { type: "shared-type" } },
      { to: { type: "i18n-config" } },
    ],
  },
  {
    // Page (최상위 컨슈머): 페이지 조립에 필요한 거의 모든 레이어 사용 가능
    // (단, domain-service/repository/http-hook 직접 호출 금지 — 컴포넌트를 거쳐야 함)
    // layout/page에서 next-intl routing·navigation 사용을 위해 i18n-config 허용.
    // layout.tsx의 `import '@/styles/globals.css'` 같은 side-effect import 위해 style 허용.
    // layout.tsx에서 디자인 시스템 ThemeProvider에 주입하기 위해 theme 허용.
    from: { type: "page" },
    allow: [
      { to: { type: "page-component" } },
      { to: { type: "page-provider" } },
      { to: { type: "shared-ui" } },
      { to: { type: "dictionary" } },
      { to: { type: "shared-type" } },
      { to: { type: "i18n-config" } },
      { to: { type: "style" } },
      { to: { type: "theme" } },
      { to: { type: "page" } },
    ],
  },
];
