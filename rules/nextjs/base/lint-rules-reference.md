<!-- GENERATED DOCUMENT - DO NOT MODIFY BY HAND -->
<!-- Generator: scripts/typescript/gen-eslint-reference.mjs -->
<!-- Source: rules/nextjs/base/eslint.rules.mjs -->

# Lint Rules Reference (nextjs/base)

## 레이어 글로서리 (Layer Glossary)

각 레이어의 책임·포함 파일·금지·대표 코드 형태.
경로·allow 매트릭스만으로 안 드러나는 의미를 보강해 올바른 코드 배치를 안내.

### `domain-model`

**Role** — 도메인 Entity · Value Object · 공용 타입. 프레임워크 비의존 순수 TypeScript로, 프로젝트 전역에서 참조되는 가장 안정적인 계약.

**Contains**

- Entity·VO 타입 (interface/type) — `src/domain/<feature>/model.ts`
- 한 feature 안에 여러 Entity·VO가 함께 살아도 됨 (예: User + UserPreferences)

**Forbids**

- React/Next.js import (baseDomainBannedPackages)
- DB 드라이버 import (mongodb, pg, redis, typeorm 등)
- class 기반 도메인 (interface/type + 순수 함수 지향)

```ts
// src/domain/order/model.ts
export type OrderStatus = 'pending' | 'confirmed' | 'shipped';
export interface Order {
  readonly id: string;
  readonly items: ReadonlyArray<OrderItem>;
  readonly status: OrderStatus;
}
```

### `domain-error`

**Role** — 도메인 특화 에러 타입. UI/HTTP 레이어에서 `instanceof`로 식별해 사용자 메시지 매핑.

**Contains**

- 한 feature의 도메인 에러 클래스 모음 — `src/domain/<feature>/errors.ts`

**Forbids**

- React/Next.js/DB 드라이버 import (domain layer 동일 제약)

```ts
// src/domain/order/errors.ts
export class OrderNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Order not found: ${id}`);
  }
}
```

### `domain-port`

**Role** — Repository·외부 의존 인터페이스. domain-service가 주입받아 쓰는 경계 계약.

**Contains**

- 한 feature의 Port 인터페이스 — `src/domain/<feature>/port.ts`
- Repository Port 외 outbound port(알림·결제·캐시 등)도 같은 파일에 동거 가능

**Forbids**

- 인터페이스 시그니처에 프레임워크 타입 (model/error만 사용)
- 구현 코드 (→ http-repository)

```ts
// src/domain/order/port.ts
export interface OrderRepositoryPort {
  findById(id: string): Promise<Order | null>;
  findAll(): Promise<Order[]>;
}
```

### `domain-service`

**Role** — UseCase·비즈니스 로직 조합기. Port를 주입받아 도메인 흐름을 orchestrate.

**Contains**

- 한 feature의 Service 클래스 — `src/domain/<feature>/service.ts`

**Forbids**

- React Hook 호출 (`use*` — UI 전용)
- http-repository 직접 import (→ domain-port 주입으로만)

```ts
// src/domain/order/service.ts
export class OrderService {
  constructor(private readonly orderRepository: OrderRepositoryPort) {}
  async getOrder(id: string): Promise<Order> {
    const order = await this.orderRepository.findById(id);
    if (!order) throw new OrderNotFoundError(id);
    return order;
  }
}
```

### `http-client`

**Role** — HTTP 클라이언트 팩토리 (ky 래퍼). createApiClient(config)로 prefix·retry·hooks를 주입받아 KyInstance 생성 — 인증·prefix 같은 비즈니스 로직은 호출부가 주입.

**Contains**

- createApiClient 팩토리·getApi 싱글톤 export — `src/http/_generated/client.ts` (generator 산출물)
- 이전 구조의 `src/http/client.ts` (generator가 `_generated/`로 옮기기 전 위치, 같은 레이어로 인식)

**Forbids**

- `_generated/client.ts` 수기 편집 (kelo:nextjs-openapi-gen으로만 갱신)
- 이 파일에서 다른 레이어 import (순수 통신 경계; allow: [])

### `http-endpoint`

**Role** — 엔드포인트 URL 헬퍼. operationId 기반 함수 형태 (path-parameter는 함수 인자).

**Contains**

- URL 헬퍼 export — `src/http/_generated/endpoints.ts` (generator 산출물)

**Forbids**

- 수기 편집 (kelo:nextjs-openapi-gen으로만 갱신)
- 다른 레이어 import (allow: [])

### `http-dto`

**Role** — 외부 API 응답·요청 타입 (DTO). 컴포넌트에서 직접 사용 금지 — 반드시 mapper를 거쳐 Domain Model로 변환 후 사용.

**Contains**

- DTO 타입 export — `src/http/_generated/types.ts` (generator 산출물)

**Forbids**

- 수기 편집 (kelo:nextjs-openapi-gen으로만 갱신)
- 도메인 변환 로직 (→ http-mapper)
- 다른 레이어 import (allow: [])

### `http-service`

**Role** — OpenAPI tag별 자동 생성 API 서비스 클래스. operation = 메서드 1개로 매핑되어 KyInstance·endpoints·DTO를 조립한 HTTP 호출 + `.json<Dto>()` 반환을 담당. 도메인 변환은 하지 않음 (→ http-repository에서 mapper 호출).

**Contains**

- tag별 서비스 클래스 — `src/http/_generated/services/<tag-kebab>.ts` (generator 산출물)
- query param 객체를 URLSearchParams로 정규화하는 private helper

**Forbids**

- 수기 편집 (kelo:nextjs-openapi-gen으로만 갱신)
- 도메인 모델 import (DTO만 반환 — 변환은 repository 책임)
- 다른 레이어 import (allow: http-endpoint, http-dto만)

```ts
// src/http/_generated/services/o-auth.ts (generated)
export class OAuthService {
  constructor(private readonly api: KyInstance) {}

  async oAuthAuthControllerLogin(body: OAuthLoginDto): Promise<{ success: boolean; data: OAuthAuthDataResponseDto }> {
    return this.api.post(endpoints.oAuthAuthControllerLogin(), { json: body }).json<{...}>();
  }
}
```

### `http-mapper`

**Role** — DTO ↔ Domain Model 변환 전담. snake_case → camelCase, nullable 정규화, enum 매핑 등.

**Contains**

- 한 feature의 Mapper 클래스(static 메서드) — `src/http/<feature>/mapper.ts`

**Forbids**

- 비즈니스 로직 (순수 변환만; 계산/조합은 domain-service)

```ts
// src/http/order/mapper.ts
export class OrderMapper {
  static toDomain(dto: OrderDto): Order {
    return {
      id: dto.id,
      items: dto.items.map(ItemMapper.toDomain),
      status: dto.status,
      totalAmount: dto.total_amount,
    };
  }
}
```

### `http-repository`

**Role** — domain-port 구현체. http-client로 HTTP 호출 후 http-mapper로 Domain 타입 변환.

**Contains**

- 한 feature의 Repository 클래스 — `src/http/<feature>/repository.ts`

**Forbids**

- 비즈니스 로직 (통신·변환만)
- repository 간 상호 import (cross-repository 의존 금지)

```ts
// src/http/order/repository.ts
export class OrderRepository implements OrderRepositoryPort {
  async findById(id: string): Promise<Order | null> {
    const dto = await apiClient.get<OrderDto>(endpoints.getOrder(id));
    return dto ? OrderMapper.toDomain(dto) : null;
  }
}
```

### `http-hook`

**Role** — UI에 제공되는 데이터 페칭 훅 (TanStack Query 등). 데이터 호출은 domain-service만 사용 — http-repository는 Service 팩토리에서 Port 구현체 주입 용도로만 import.

**Contains**

- 한 feature의 React Query 훅 (useQuery/useMutation) — `src/http/<feature>/hook.ts`
- Service 팩토리 훅 (예: `useOrderService`)을 같은 파일에 동거. Port 구현체(`http-repository`)는 여기서만 주입.

**Forbids**

- http-repository를 데이터 호출에 직접 사용 (→ Service 메서드를 거쳐야 함)
- UI 컴포넌트 import (훅은 데이터 계약만)

```ts
// src/http/order/hook.ts
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { OrderService } from '@/domain/order/service';
import { OrderRepository } from '@/http/order/repository';

function useOrderService() {
  return useMemo(() => new OrderService(new OrderRepository()), []);
}

export function useOrder(id: string) {
  const service = useOrderService();
  return useQuery({
    queryKey: ['order', id],
    queryFn: () => service.getOrder(id),
  });
}
```

### `lib-shared-barrel`

**Role** — 공용 유틸 barrel — `src/lib/utils/index.ts`. `lib-shared` leaf의 re-export 전용.

**Contains**

- barrel re-export — `export * from './cn'`, `export { foo } from './format-date'` 등

**Forbids**

- 런타임 로직 정의 (helper 구현은 leaf 파일에 두고 여기서는 재노출만)
- `lib-shared` 외 다른 레이어 import (barrel은 leaf 묶음 역할만)

### `lib-shared`

**Role** — 공용 유틸 함수. 내부 의존 0 — 다른 레이어 import 금지 (allow: []).

**Contains**

- 순수 유틸 함수 — `src/lib/utils/*.ts` (예: `cn.ts`, `format-date.ts`, `auth.ts`)

**Forbids**

- 다른 레이어 import (순수 유틸 경계 유지)
- layered code 배치 (도메인/HTTP는 `src/domain/`, `src/http/`로 promote됨)

### `dictionary`

**Role** — i18n 사전. 로케일별 메시지 객체·JSON + 타입 안전 키 (shared-type과 상호 참조).

**Contains**

- 사전 파일 — `src/i18n/dictionaries/*.{json,ts}` (예: `en.json`, `ko.json`)
- 로케일 loader — `src/app/[locale]/dictionaries.ts`

**Forbids**

- 런타임 비즈니스 로직 (순수 데이터 객체)
- next-intl 설정 파일 동거 (`routing.ts`/`request.ts`/`navigation.ts`는 `i18n-config` 레이어로)

### `i18n-config`

**Role** — next-intl 런타임 설정 — routing(로케일/기본 로케일/prefix), request(서버 메시지 로드), navigation(Link/useRouter 헬퍼). 외부 패키지(next-intl)와 dictionary만 다루는 설정 경계.

**Contains**

- `src/i18n/routing.ts` — `defineRouting({ locales, defaultLocale, localePrefix })`
- `src/i18n/request.ts` — `getRequestConfig` 기반 서버 메시지 로더
- `src/i18n/navigation.ts` — `createNavigation(routing)` 결과 (Link·redirect·useRouter)

**Forbids**

- 도메인/HTTP/UI 레이어 import (설정 경계 — 사전만 참조)
- 사전 데이터를 `src/lib/dictionaries/`에 두는 패턴 (모두 `src/i18n/dictionaries/`로 통일)

```ts
// src/i18n/routing.ts
import { defineRouting } from 'next-intl/routing';
export const routing = defineRouting({
  locales: ['en', 'ko'] as const,
  defaultLocale: 'en',
  localePrefix: 'always',
});
export type Locale = (typeof routing.locales)[number];
```

### `shared-type`

**Role** — 프로젝트 전역 타입 선언 (i18n 키 타입 등). `src/lib/types/**`에 배치.

**Contains**

- 전역 타입 선언 — `src/lib/types/*.ts`

**Forbids**

- 런타임 코드 (타입 선언 전용)

### `db`

**Role** — DB 드라이버 래퍼 — 클라이언트 초기화·커넥션 풀·트랜잭션 관리. MongoDB/PostgreSQL/Redis/TypeORM 드라이버 무관.

**Contains**

- DB 클라이언트 팩토리·커넥션 헬퍼 — `src/db/*.ts`

**Forbids**

- 프로젝트 내 다른 레이어 import (순수 래퍼; allow: [])

### `shared-hook`

**Role** — 전역 재사용 Client React hook. UI/HTTP 비의존 — domain-service/http-hook/Repository 호출 금지. 도메인 모델은 타입 표현용으로만 참조.

**Contains**

- 공용 React hook — `src/hooks/<name>.ts` (예: `use-reduced-motion.ts`, `use-debounce.ts`, `use-media-query.ts`)
- hook 조합용 내부 helper (콜로케이션)

**Forbids**

- domain-service / http-hook / http-repository 호출 (→ http-hook 또는 page-component가 담당)
- UI 컴포넌트 import (hook은 behavior만 — JSX 반환 금지)

```ts
// src/hooks/use-reduced-motion.ts
'use client';
import { useEffect, useState } from 'react';
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}
```

### `style`

**Role** — 전역 CSS·디자인 토큰 리소스. CSS custom property(`:root { --color-* }`)와 TS 토큰(타입 안전 참조)을 한곳에 모아 page/UI 레이어가 import해 쓴다.

**Contains**

- 전역 CSS — `src/styles/globals.css` (layout.tsx에서 side-effect import)
- CSS 토큰 — `src/styles/tokens.css` (palette/typography/spacing custom property)
- 타이포그래피 CSS — `src/styles/typography.css`
- TS 디자인 토큰 (선택) — `src/styles/tokens.ts` (컴포넌트에서 타입 안전 참조)

**Forbids**

- 다른 레이어 import (domain/http/UI 컴포넌트 참조 금지 — 순수 리소스 경계)
- 런타임 비즈니스 로직 (CSS 변수 정의·토큰 객체에만 집중)

```ts
/* src/styles/tokens.css */
:root {
  --color-surface: oklch(98% 0 0);
  --color-text: oklch(18% 0 0);
  --text-base: clamp(1rem, 0.92rem + 0.4vw, 1.125rem);
  --space-section: clamp(4rem, 3rem + 5vw, 10rem);
}

// src/app/[locale]/layout.tsx
import '@/styles/globals.css';
```

### `theme`

**Role** — 디자인 시스템 테마 설정 파일 (`src/theme.ts` + generator 산출물 `src/theme.generated.ts`). Mantine `createTheme()`, Ant Design `ConfigProvider.theme` 객체, shadcn 토큰 등 디자인 시스템 라이브러리에 주입할 테마 객체를 export. layout/Provider 레이어가 import해 ThemeProvider에 전달.

**Contains**

- 수기 테마 객체 export — `src/theme.ts`
- generator 산출물 — `src/theme.generated.ts` (디자인 토큰 추출/변환 도구가 갱신)
- 필요 시 `src/styles`의 TS 디자인 토큰을 조합해 테마 객체 구성

**Forbids**

- 도메인/HTTP/UI 레이어 import (설정 경계 — style만 참조)
- 런타임 비즈니스 로직 (테마 객체 정의에만 집중)
- `theme.generated.ts` 수기 편집 (generator가 덮어씀)
- 복수 파일로 분리 (`src/theme/` 디렉토리 X — 위 두 파일만 유지)

```ts
// src/theme.ts (Mantine 예시)
import { createTheme } from '@mantine/core';
export const theme = createTheme({
  primaryColor: 'blue',
  fontFamily: 'Inter, sans-serif',
});

// src/app/[locale]/layout.tsx
import { theme } from '@/theme';
// <MantineProvider theme={theme}>...</MantineProvider>
```

### `shared-ui`

**Role** — 전역 재사용 Client Component. 도메인 모델은 타입 표현용으로만 참조 — domain-service 호출 금지.

**Contains**

- Presentational Component — `src/components/<name>/<Name>.tsx`
- 컴포넌트 전용 util/hook (콜로케이션)

**Forbids**

- http-hook 호출 (데이터 페칭은 page-component에서)
- `React.FC` / `React.FunctionComponent` (baseRestrictedSyntax)

```ts
// src/components/order-summary/order-summary.tsx
'use client';
export function OrderSummary({ order }: { order: Order }) {
  return <div>{order.totalAmount}</div>;
}
```

### `page-component`

**Role** — 페이지 전용 Client Component. `src/app/[locale]/**/_components/`에 콜로케이션. http-hook으로 데이터 조회 + shared-ui 조합.

**Contains**

- `'use client'` Client Component — `_components/<name>.tsx`

**Forbids**

- domain-service 직접 호출 (→ http-hook을 통해서)
- `React.FC` 사용 (baseRestrictedSyntax)

```ts
// src/app/[locale]/orders/_components/order-list.tsx
'use client';
export function OrderList() {
  const { data, isLoading } = useOrders();
  if (isLoading) return <Spinner />;
  return <ul>{data?.map((o) => <li key={o.id}>{o.id}</li>)}</ul>;
}
```

### `page-provider`

**Role** — 페이지 전용 Provider — 설정/컨텍스트 래퍼. 공용 유틸(lib-shared)만 import.

**Contains**

- Context Provider Client Component — `_providers/<name>.tsx`

**Forbids**

- 도메인/HTTP 레이어 import (설정 전달에만 집중)

### `email-template`

**Role** — 이메일 전송 시 서버에서 렌더링되는 React Email 템플릿. 필요 데이터는 props로 주입받음.

**Contains**

- React Email 컴포넌트 — `src/email-templates/*.tsx`

**Forbids**

- 도메인/HTTP 레이어 import (서버 전용 로직 유출 방지)

### `route-handler`

**Role** — Next.js App Router HTTP 엔드포인트 — GET/POST/PUT/DELETE 등 export하는 얇은 HTTP 어댑터.

**Contains**

- HTTP 핸들러 export — `src/app/**/route.ts`

**Forbids**

- UI 레이어 import (shared-ui/page-component 금지; 서버 경계 위반)
- 비즈니스 로직 포함 (→ domain-service 호출에 집중)

```ts
// src/app/api/orders/[id]/route.ts
export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const order = await orderService.getOrder(params.id);
  return Response.json(order);
}
```

### `page`

**Role** — `src/app` 최상위 컨슈머 (Server Component). 위 패턴에 매칭 안 된 App Router 파일의 catch-all.

**Contains**

- Server Component 페이지 — `page.tsx`
- Layout — `layout.tsx`
- Loading/Error boundary — `loading.tsx`, `error.tsx`, `not-found.tsx`

**Forbids**

- Hook 호출 (Server Component는 `use*` 호출 금지; baseServerComponentRules)
- domain-service/http-hook 직접 호출 (→ page-component를 거쳐야 함)

## 의존성 규칙 (Dependency Rules)

레이어 간 import 관계 (allow-list). 기본 disallow 정책 위에 아래 조합만 허용.
각 레이어의 역할·책임은 "레이어 글로서리" 섹션 참조.

시각화된 의존성 그래프는 `lint-rules-diagram.md` 참조.

### Allow 매트릭스

| From | Allow → To |
| --- | --- |
| `domain-model` | `domain-model` |
| `domain-error` | `domain-error` |
| `domain-port` | `domain-model` |
| `domain-service` | `domain-model`, `domain-port`, `domain-error`, `domain-service` |
| `http-client` | _(no layer imports)_ |
| `http-endpoint` | _(no layer imports)_ |
| `http-dto` | _(no layer imports)_ |
| `http-service` | `http-endpoint`, `http-dto` |
| `http-mapper` | `domain-model`, `http-dto` |
| `http-repository` | `http-client`, `http-endpoint`, `http-dto`, `http-service`, `http-mapper`, `domain-port`, `domain-error`, `domain-model`, `db` |
| `http-hook` | `domain-service`, `http-repository`, `domain-model` |
| `lib-shared` | _(no layer imports)_ |
| `lib-shared-barrel` | `lib-shared` |
| `db` | _(no layer imports)_ |
| `shared-hook` | `lib-shared`, `lib-shared-barrel`, `shared-type`, `domain-model`, `shared-hook`, `style` |
| `shared-ui` | `domain-model`, `shared-ui`, `shared-hook`, `shared-type`, `i18n-config`, `style`, `theme` |
| `page-component` | `http-hook`, `shared-ui`, `shared-hook`, `domain-model`, `page-component`, `lib-shared`, `lib-shared-barrel`, `shared-type`, `i18n-config`, `style`, `theme` |
| `page-provider` | `lib-shared`, `lib-shared-barrel`, `shared-hook`, `style`, `theme` |
| `style` | `style` |
| `theme` | `style`, `theme` |
| `dictionary` | `shared-type`, `dictionary` |
| `i18n-config` | `dictionary`, `i18n-config` |
| `shared-type` | `dictionary` |
| `email-template` | `dictionary`, `shared-type` |
| `route-handler` | `domain-model`, `domain-error`, `domain-service`, `shared-type`, `i18n-config` |
| `page` | `page-component`, `page-provider`, `shared-ui`, `dictionary`, `shared-type`, `i18n-config`, `style`, `theme`, `page` |

## Restricted Patterns (Import 금지 패턴)

전역 no-restricted-imports 패턴. 깊은 상대경로(`../../**`) 금지로 폴더 구조
리팩토링 시 import 파손 방지 + `@/*` path alias 사용 강제.
더불어 deprecated 경로(`@/lib/dictionaries/**`)를 `@/i18n/**`로 이동시키도록 차단.

| 패턴 | 메시지 |
| --- | --- |
| `../../**` | Use @/* path alias instead of deep relative parent imports. |
| `@/lib/dictionaries/*`, `@/lib/dictionaries/**` | Move i18n to src/i18n/: dictionaries → @/i18n/dictionaries/*, routing/request/navigation → @/i18n/*. |

## Restricted Syntax (AST 금지 구문)

AST selector 기반 금지 구문.
- `React.FC` / `React.FunctionComponent`: children 암묵 포함·generic 불편 — 명시적 props 타입 사용.
- polymorphic `component="a"` (Mantine·MUI·Chakra 등): Next.js client-side 라우팅 우회로 전체 페이지 reload 유발. 내부 링크는 `next/link`의 `Link`, 외부 링크는 일반 `<a>` 또는 디자인 시스템 전용 anchor(Mantine `Anchor`, antd `Typography.Link` 등) 사용.

| Selector | 메시지 |
| --- | --- |
| `TSTypeReference[typeName.object.name='React'][typeName.property.name='FC']` | Use explicit props typing instead of React.FC. |
| `TSTypeReference[typeName.object.name='React'][typeName.property.name='FunctionComponent']` | Use explicit props typing instead of React.FunctionComponent. |
| `JSXAttribute[name.name='component'][value.value='a']` | Do not use component="a" — bypasses Next.js client-side routing and causes a full page reload. Internal links: component={Link} from next/link. External links: a plain <a target="_blank" rel="noopener noreferrer"> element or the design system's dedicated anchor component (Mantine Anchor, antd Typography.Link, etc.). |

## Domain Purity (도메인 순수성)

도메인 레이어(`src/domain/**`)에서 import 금지 패키지.
프레임워크 비의존 유지. 스택별로 UI 라이브러리 추가 차단.

### 도메인 레이어 금지 패키지

- `react` (+ 서브경로)
- `react-dom` (+ 서브경로)
- `next` (+ 서브경로)
- `mongodb` (+ 서브경로)
- `pg` (+ 서브경로)
- `redis` (+ 서브경로)
- `typeorm` (+ 서브경로)

## Rule Overrides (코드 작성 주의)

ESLint 오버라이드 중 **LLM이 코드 작성 시 명시적으로 따라야 할 규칙만 선별**.
(autofix가 처리하거나 LLM 기본 동작과 동일한 규칙은 생략.)

- `@typescript-eslint/consistent-type-imports` — type-only import은 `import type { X } from "..."` 인라인 형식으로 작성.
- `@typescript-eslint/no-deprecated` — deprecated API 사용 금지 — 대체 API로 마이그레이션.
- `@typescript-eslint/no-explicit-any` — `any` 금지 — 정확한 타입 또는 `unknown` 사용.
- `no-console` — `console.warn` / `console.error`만 허용. `console.log` / `console.debug` 금지.
- `no-warning-comments` — TODO / FIXME / HACK 주석 추적 (warn) — 차단하지 않음, 장기 방치 금지.
- `sonarjs/no-nested-conditional` — 중첩 삼항 연산자 금지 — `if/else` 블록 또는 함수 추출.
- `unused-imports/no-unused-vars` — 사용 안 하는 변수/파라미터는 `_` prefix (예: `_unused`, `_ctx`).

## Ignored Paths (무시 경로)

Boundary 검사 제외 (boundaries/no-unknown-files 오탐 방지).
테스트/스펙/설정, 루트 메타 파일, scripts/e2e 빌드 유틸, 전역 타입,
모노레포 sibling workspace로 resolve된 import 등.

### 무시 패턴 목록

- **테스트/설정 파일**: `**/*.test.ts`, `**/*.test.tsx`, `**/*.spec.ts`, `**/*.spec.tsx`, `*.config.*`, `eslint.project.config.mjs`, `prettier.config.mjs`, `commitlint.config.mjs`
- **타입/메타 파일**: `*.ts`, `*.d.ts`, `types/**`, `src/lib/types/**`
- **특수 경로**: `specs/**`, `**/packages/**`, `src/http/_generated/**`, `src/theme.generated.ts`
- **빌드/툴 산출물 (코드 작성 무관)**: `.kelo/**`, `scripts/**`, `e2e/**`, `eslint.config.mjs`, `.next/**`, `out/**`, `build/**`, `coverage/**`, `next-env.d.ts`
