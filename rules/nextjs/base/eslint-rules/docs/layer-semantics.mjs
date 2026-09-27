/**
 * 각 레이어의 책임·포함 파일·금지·대표 코드 형태.
 * 경로·allow 매트릭스만으로 안 드러나는 의미를 보강해 올바른 코드 배치를 안내.
 */
export const baseLayerSemantics = {
  // ─── Domain layer (feature-first: src/domain/<feature>/...) ───────────────
  "domain-model": {
    role: "도메인 Entity · Value Object · 공용 타입. 프레임워크 비의존 순수 TypeScript로, 프로젝트 전역에서 참조되는 가장 안정적인 계약.",
    contains: [
      "Entity·VO 타입 (interface/type) — `src/domain/<feature>/model.ts`",
      "한 feature 안에 여러 Entity·VO가 함께 살아도 됨 (예: User + UserPreferences)",
    ],
    forbids: [
      "React/Next.js import (baseDomainBannedPackages)",
      "DB 드라이버 import (mongodb, pg, redis, typeorm 등)",
      "class 기반 도메인 (interface/type + 순수 함수 지향)",
    ],
    example: [
      "// src/domain/order/model.ts",
      "export type OrderStatus = 'pending' | 'confirmed' | 'shipped';",
      "export interface Order {",
      "  readonly id: string;",
      "  readonly items: ReadonlyArray<OrderItem>;",
      "  readonly status: OrderStatus;",
      "}",
    ].join("\n"),
  },

  "domain-error": {
    role: "도메인 특화 에러 타입. UI/HTTP 레이어에서 `instanceof`로 식별해 사용자 메시지 매핑.",
    contains: [
      "한 feature의 도메인 에러 클래스 모음 — `src/domain/<feature>/errors.ts`",
    ],
    forbids: ["React/Next.js/DB 드라이버 import (domain layer 동일 제약)"],
    example: [
      "// src/domain/order/errors.ts",
      "export class OrderNotFoundError extends Error {",
      "  constructor(public readonly id: string) {",
      "    super(`Order not found: ${id}`);",
      "  }",
      "}",
    ].join("\n"),
  },

  "domain-port": {
    role: "Repository·외부 의존 인터페이스. domain-service가 주입받아 쓰는 경계 계약.",
    contains: [
      "한 feature의 Port 인터페이스 — `src/domain/<feature>/port.ts`",
      "Repository Port 외 outbound port(알림·결제·캐시 등)도 같은 파일에 동거 가능",
    ],
    forbids: [
      "인터페이스 시그니처에 프레임워크 타입 (model/error만 사용)",
      "구현 코드 (→ http-repository)",
    ],
    example: [
      "// src/domain/order/port.ts",
      "export interface OrderRepositoryPort {",
      "  findById(id: string): Promise<Order | null>;",
      "  findAll(): Promise<Order[]>;",
      "}",
    ].join("\n"),
  },

  "domain-service": {
    role: "UseCase·비즈니스 로직 조합기. Port를 주입받아 도메인 흐름을 orchestrate.",
    contains: [
      "한 feature의 Service 클래스 — `src/domain/<feature>/service.ts`",
    ],
    forbids: [
      "React Hook 호출 (`use*` — UI 전용)",
      "http-repository 직접 import (→ domain-port 주입으로만)",
    ],
    example: [
      "// src/domain/order/service.ts",
      "export class OrderService {",
      "  constructor(private readonly orderRepository: OrderRepositoryPort) {}",
      "  async getOrder(id: string): Promise<Order> {",
      "    const order = await this.orderRepository.findById(id);",
      "    if (!order) throw new OrderNotFoundError(id);",
      "    return order;",
      "  }",
      "}",
    ].join("\n"),
  },

  // ─── HTTP adapter layer (feature-first: src/http/<feature>/...) ───────────
  "http-client": {
    role: "HTTP 클라이언트 팩토리 (ky 래퍼). createApiClient(config)로 prefix·retry·hooks를 주입받아 KyInstance 생성 — 인증·prefix 같은 비즈니스 로직은 호출부가 주입.",
    contains: [
      "createApiClient 팩토리·getApi 싱글톤 export — `src/http/_generated/client.ts` (generator 산출물)",
    ],
    forbids: [
      "수기 편집 (kelo:nextjs-openapi-gen으로만 갱신)",
      "이 파일에서 다른 레이어 import (순수 통신 경계; allow: [])",
    ],
  },

  "http-endpoint": {
    role: "엔드포인트 URL 헬퍼. operationId 기반 함수 형태 (path-parameter는 함수 인자).",
    contains: [
      "URL 헬퍼 export — `src/http/_generated/endpoints.ts` (generator 산출물)",
    ],
    forbids: [
      "수기 편집 (kelo:nextjs-openapi-gen으로만 갱신)",
      "다른 레이어 import (allow: [])",
    ],
  },

  "http-dto": {
    role: "외부 API 응답·요청 타입 (DTO). 컴포넌트에서 직접 사용 금지 — 반드시 mapper를 거쳐 Domain Model로 변환 후 사용.",
    contains: [
      "DTO 타입 export — `src/http/_generated/types.ts` (generator 산출물)",
    ],
    forbids: [
      "수기 편집 (kelo:nextjs-openapi-gen으로만 갱신)",
      "도메인 변환 로직 (→ http-mapper)",
      "다른 레이어 import (allow: [])",
    ],
  },

  "http-service": {
    role: "OpenAPI tag별 자동 생성 API 서비스 클래스. operation = 메서드 1개로 매핑되어 KyInstance·endpoints·DTO를 조립한 HTTP 호출 + `.json<Dto>()` 반환을 담당. 도메인 변환은 하지 않음 (→ http-repository에서 mapper 호출).",
    contains: [
      "tag별 서비스 클래스 — `src/http/_generated/services/<tag-kebab>.ts` (generator 산출물)",
      "query param 객체를 URLSearchParams로 정규화하는 private helper",
    ],
    forbids: [
      "수기 편집 (kelo:nextjs-openapi-gen으로만 갱신)",
      "도메인 모델 import (DTO만 반환 — 변환은 repository 책임)",
      "다른 레이어 import (allow: http-endpoint, http-dto만)",
    ],
    example: [
      "// src/http/_generated/services/o-auth.ts (generated)",
      "export class OAuthService {",
      "  constructor(private readonly api: KyInstance) {}",
      "",
      "  async oAuthAuthControllerLogin(body: OAuthLoginDto): Promise<{ success: boolean; data: OAuthAuthDataResponseDto }> {",
      "    return this.api.post(endpoints.oAuthAuthControllerLogin(), { json: body }).json<{...}>();",
      "  }",
      "}",
    ].join("\n"),
  },

  "http-mapper": {
    role: "DTO ↔ Domain Model 변환 전담. snake_case → camelCase, nullable 정규화, enum 매핑 등.",
    contains: [
      "한 feature의 Mapper 클래스(static 메서드) — `src/http/<feature>/mapper.ts`",
    ],
    forbids: ["비즈니스 로직 (순수 변환만; 계산/조합은 domain-service)"],
    example: [
      "// src/http/order/mapper.ts",
      "export class OrderMapper {",
      "  static toDomain(dto: OrderDto): Order {",
      "    return {",
      "      id: dto.id,",
      "      items: dto.items.map(ItemMapper.toDomain),",
      "      status: dto.status,",
      "      totalAmount: dto.total_amount,",
      "    };",
      "  }",
      "}",
    ].join("\n"),
  },

  "http-repository": {
    role: "domain-port 구현체. http-client로 HTTP 호출 후 http-mapper로 Domain 타입 변환.",
    contains: [
      "한 feature의 Repository 클래스 — `src/http/<feature>/repository.ts`",
    ],
    forbids: [
      "비즈니스 로직 (통신·변환만)",
      "repository 간 상호 import (cross-repository 의존 금지)",
    ],
    example: [
      "// src/http/order/repository.ts",
      "export class OrderRepository implements OrderRepositoryPort {",
      "  async findById(id: string): Promise<Order | null> {",
      "    const dto = await apiClient.get<OrderDto>(endpoints.getOrder(id));",
      "    return dto ? OrderMapper.toDomain(dto) : null;",
      "  }",
      "}",
    ].join("\n"),
  },

  "http-hook": {
    role: "UI에 제공되는 데이터 페칭 훅 (TanStack Query 등). 데이터 호출은 domain-service만 사용 — http-repository는 Service 팩토리에서 Port 구현체 주입 용도로만 import.",
    contains: [
      "한 feature의 React Query 훅 (useQuery/useMutation) — `src/http/<feature>/hook.ts`",
      "Service 팩토리 훅 (예: `useOrderService`)을 같은 파일에 동거. Port 구현체(`http-repository`)는 여기서만 주입.",
    ],
    forbids: [
      "http-repository를 데이터 호출에 직접 사용 (→ Service 메서드를 거쳐야 함)",
      "UI 컴포넌트 import (훅은 데이터 계약만)",
    ],
    example: [
      "// src/http/order/hook.ts",
      "import { useMemo } from 'react';",
      "import { useQuery } from '@tanstack/react-query';",
      "import { OrderService } from '@/domain/order/service';",
      "import { OrderRepository } from '@/http/order/repository';",
      "",
      "function useOrderService() {",
      "  return useMemo(() => new OrderService(new OrderRepository()), []);",
      "}",
      "",
      "export function useOrder(id: string) {",
      "  const service = useOrderService();",
      "  return useQuery({",
      "    queryKey: ['order', id],",
      "    queryFn: () => service.getOrder(id),",
      "  });",
      "}",
    ].join("\n"),
  },

  // ─── Shared lib / DB ──────────────────────────────────────────────────────
  "lib-shared": {
    role: "공용 유틸 함수. 내부 의존 0 — 다른 레이어 import 금지 (allow: []).",
    contains: [
      "순수 유틸 함수 — `src/lib/utils/*.ts` (예: `cn.ts`, `format-date.ts`, `auth.ts`)",
    ],
    forbids: [
      "다른 레이어 import (순수 유틸 경계 유지)",
      "layered code 배치 (도메인/HTTP는 `src/domain/`, `src/http/`로 promote됨)",
    ],
  },

  "lib-shared-barrel": {
    role: "공용 유틸 barrel — `src/lib/utils/index.ts`. `lib-shared` leaf의 re-export 전용.",
    contains: [
      "barrel re-export — `export * from './cn'`, `export { foo } from './format-date'` 등",
    ],
    forbids: [
      "런타임 로직 정의 (helper 구현은 leaf 파일에 두고 여기서는 재노출만)",
      "`lib-shared` 외 다른 레이어 import (barrel은 leaf 묶음 역할만)",
    ],
  },

  db: {
    role: "DB 드라이버 래퍼 — 클라이언트 초기화·커넥션 풀·트랜잭션 관리. MongoDB/PostgreSQL/Redis/TypeORM 드라이버 무관.",
    contains: ["DB 클라이언트 팩토리·커넥션 헬퍼 — `src/db/*.ts`"],
    forbids: ["프로젝트 내 다른 레이어 import (순수 래퍼; allow: [])"],
  },

  // ─── Shared client hooks ──────────────────────────────────────────────────
  "shared-hook": {
    role: "전역 재사용 Client React hook. UI/HTTP 비의존 — domain-service/http-hook/Repository 호출 금지. 도메인 모델은 타입 표현용으로만 참조.",
    contains: [
      "공용 React hook — `src/hooks/<name>.ts` (예: `use-reduced-motion.ts`, `use-debounce.ts`, `use-media-query.ts`)",
      "hook 조합용 내부 helper (콜로케이션)",
    ],
    forbids: [
      "domain-service / http-hook / http-repository 호출 (→ http-hook 또는 page-component가 담당)",
      "UI 컴포넌트 import (hook은 behavior만 — JSX 반환 금지)",
    ],
    example: [
      "// src/hooks/use-reduced-motion.ts",
      "'use client';",
      "import { useEffect, useState } from 'react';",
      "export function useReducedMotion(): boolean {",
      "  const [reduced, setReduced] = useState(false);",
      "  useEffect(() => {",
      "    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');",
      "    setReduced(mq.matches);",
      "    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);",
      "    mq.addEventListener('change', handler);",
      "    return () => mq.removeEventListener('change', handler);",
      "  }, []);",
      "  return reduced;",
      "}",
    ].join("\n"),
  },

  // ─── Style layer ──────────────────────────────────────────────────────────
  style: {
    role: "전역 CSS·디자인 토큰 리소스. CSS custom property(`:root { --color-* }`)와 TS 토큰(타입 안전 참조)을 한곳에 모아 page/UI 레이어가 import해 쓴다.",
    contains: [
      "전역 CSS — `src/styles/globals.css` (layout.tsx에서 side-effect import)",
      "CSS 토큰 — `src/styles/tokens.css` (palette/typography/spacing custom property)",
      "타이포그래피 CSS — `src/styles/typography.css`",
      "TS 디자인 토큰 (선택) — `src/styles/tokens.ts` (컴포넌트에서 타입 안전 참조)",
    ],
    forbids: [
      "다른 레이어 import (domain/http/UI 컴포넌트 참조 금지 — 순수 리소스 경계)",
      "런타임 비즈니스 로직 (CSS 변수 정의·토큰 객체에만 집중)",
    ],
    example: [
      "/* src/styles/tokens.css */",
      ":root {",
      "  --color-surface: oklch(98% 0 0);",
      "  --color-text: oklch(18% 0 0);",
      "  --text-base: clamp(1rem, 0.92rem + 0.4vw, 1.125rem);",
      "  --space-section: clamp(4rem, 3rem + 5vw, 10rem);",
      "}",
      "",
      "// src/app/[locale]/layout.tsx",
      "import '@/styles/globals.css';",
    ].join("\n"),
  },

  // ─── Theme layer ──────────────────────────────────────────────────────────
  theme: {
    role: "디자인 시스템 테마 설정 파일 (`src/theme.ts` + generator 산출물 `src/theme.generated.ts`). Mantine `createTheme()`, Ant Design `ConfigProvider.theme` 객체, shadcn 토큰 등 디자인 시스템 라이브러리에 주입할 테마 객체를 export. layout/Provider 레이어가 import해 ThemeProvider에 전달.",
    contains: [
      "수기 테마 객체 export — `src/theme.ts`",
      "generator 산출물 — `src/theme.generated.ts` (디자인 토큰 추출/변환 도구가 갱신)",
      "필요 시 `src/styles`의 TS 디자인 토큰을 조합해 테마 객체 구성",
    ],
    forbids: [
      "도메인/HTTP/UI 레이어 import (설정 경계 — style만 참조)",
      "런타임 비즈니스 로직 (테마 객체 정의에만 집중)",
      "`theme.generated.ts` 수기 편집 (generator가 덮어씀)",
      "복수 파일로 분리 (`src/theme/` 디렉토리 X — 위 두 파일만 유지)",
    ],
    example: [
      "// src/theme.ts (Mantine 예시)",
      "import { createTheme } from '@mantine/core';",
      "export const theme = createTheme({",
      "  primaryColor: 'blue',",
      "  fontFamily: 'Inter, sans-serif',",
      "});",
      "",
      "// src/app/[locale]/layout.tsx",
      "import { theme } from '@/theme';",
      "// <MantineProvider theme={theme}>...</MantineProvider>",
    ].join("\n"),
  },

  // ─── UI layer ─────────────────────────────────────────────────────────────
  "shared-ui": {
    role: "전역 재사용 Client Component. 도메인 모델은 타입 표현용으로만 참조 — domain-service 호출 금지.",
    contains: [
      "Presentational Component — `src/components/<name>/<Name>.tsx`",
      "컴포넌트 전용 util/hook (콜로케이션)",
    ],
    forbids: [
      "http-hook 호출 (데이터 페칭은 page-component에서)",
      "`React.FC` / `React.FunctionComponent` (baseRestrictedSyntax)",
    ],
    example: [
      "// src/components/order-summary/order-summary.tsx",
      "'use client';",
      "export function OrderSummary({ order }: { order: Order }) {",
      "  return <div>{order.totalAmount}</div>;",
      "}",
    ].join("\n"),
  },

  "page-component": {
    role: "페이지 전용 Client Component. `src/app/[locale]/**/_components/`에 콜로케이션. http-hook으로 데이터 조회 + shared-ui 조합.",
    contains: ["`'use client'` Client Component — `_components/<name>.tsx`"],
    forbids: [
      "domain-service 직접 호출 (→ http-hook을 통해서)",
      "`React.FC` 사용 (baseRestrictedSyntax)",
    ],
    example: [
      "// src/app/[locale]/orders/_components/order-list.tsx",
      "'use client';",
      "export function OrderList() {",
      "  const { data, isLoading } = useOrders();",
      "  if (isLoading) return <Spinner />;",
      "  return <ul>{data?.map((o) => <li key={o.id}>{o.id}</li>)}</ul>;",
      "}",
    ].join("\n"),
  },

  "page-provider": {
    role: "페이지 전용 Provider — 설정/컨텍스트 래퍼. 공용 유틸(lib-shared)만 import.",
    contains: ["Context Provider Client Component — `_providers/<name>.tsx`"],
    forbids: ["도메인/HTTP 레이어 import (설정 전달에만 집중)"],
  },

  // ─── Common resources ─────────────────────────────────────────────────────
  dictionary: {
    role: "i18n 사전. 로케일별 메시지 객체·JSON + 타입 안전 키 (shared-type과 상호 참조).",
    contains: [
      "사전 파일 — `src/i18n/dictionaries/*.{json,ts}` (예: `en.json`, `ko.json`)",
      "로케일 loader — `src/app/[locale]/dictionaries.ts`",
    ],
    forbids: [
      "런타임 비즈니스 로직 (순수 데이터 객체)",
      "next-intl 설정 파일 동거 (`routing.ts`/`request.ts`/`navigation.ts`는 `i18n-config` 레이어로)",
    ],
  },

  "i18n-config": {
    role: "next-intl 런타임 설정 — routing(로케일/기본 로케일/prefix), request(서버 메시지 로드), navigation(Link/useRouter 헬퍼). 외부 패키지(next-intl)와 dictionary만 다루는 설정 경계.",
    contains: [
      "`src/i18n/routing.ts` — `defineRouting({ locales, defaultLocale, localePrefix })`",
      "`src/i18n/request.ts` — `getRequestConfig` 기반 서버 메시지 로더",
      "`src/i18n/navigation.ts` — `createNavigation(routing)` 결과 (Link·redirect·useRouter)",
    ],
    forbids: [
      "도메인/HTTP/UI 레이어 import (설정 경계 — 사전만 참조)",
      "사전 데이터를 `src/lib/dictionaries/`에 두는 패턴 (모두 `src/i18n/dictionaries/`로 통일)",
    ],
    example: [
      "// src/i18n/routing.ts",
      "import { defineRouting } from 'next-intl/routing';",
      "export const routing = defineRouting({",
      "  locales: ['en', 'ko'] as const,",
      "  defaultLocale: 'en',",
      "  localePrefix: 'always',",
      "});",
      "export type Locale = (typeof routing.locales)[number];",
    ].join("\n"),
  },

  "shared-type": {
    role: "프로젝트 전역 타입 선언 (i18n 키 타입 등). `src/lib/types/**`에 배치.",
    contains: ["전역 타입 선언 — `src/lib/types/*.ts`"],
    forbids: ["런타임 코드 (타입 선언 전용)"],
  },

  // ─── Server-rendered templates ────────────────────────────────────────────
  "email-template": {
    role: "이메일 전송 시 서버에서 렌더링되는 React Email 템플릿. 필요 데이터는 props로 주입받음.",
    contains: ["React Email 컴포넌트 — `src/email-templates/*.tsx`"],
    forbids: ["도메인/HTTP 레이어 import (서버 전용 로직 유출 방지)"],
  },

  // ─── Routes ───────────────────────────────────────────────────────────────
  "route-handler": {
    role: "Next.js App Router HTTP 엔드포인트 — GET/POST/PUT/DELETE 등 export하는 얇은 HTTP 어댑터.",
    contains: ["HTTP 핸들러 export — `src/app/**/route.ts`"],
    forbids: [
      "UI 레이어 import (shared-ui/page-component 금지; 서버 경계 위반)",
      "비즈니스 로직 포함 (→ domain-service 호출에 집중)",
    ],
    example: [
      "// src/app/api/orders/[id]/route.ts",
      "export async function GET(",
      "  req: Request,",
      "  { params }: { params: { id: string } },",
      ") {",
      "  const order = await orderService.getOrder(params.id);",
      "  return Response.json(order);",
      "}",
    ].join("\n"),
  },

  page: {
    role: "`src/app` 최상위 컨슈머 (Server Component). 위 패턴에 매칭 안 된 App Router 파일의 catch-all.",
    contains: [
      "Server Component 페이지 — `page.tsx`",
      "Layout — `layout.tsx`",
      "Loading/Error boundary — `loading.tsx`, `error.tsx`, `not-found.tsx`",
    ],
    forbids: [
      "Hook 호출 (Server Component는 `use*` 호출 금지; baseServerComponentRules)",
      "domain-service/http-hook 직접 호출 (→ page-component를 거쳐야 함)",
    ],
  },
};
