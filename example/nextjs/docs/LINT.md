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

**Role** — HTTP 클라이언트 단일 파일 (axios/fetch/ky 래퍼). baseURL·인터셉터·에러 포맷팅 공통화.

**Contains**

- client 인스턴스 export — `src/http/client.ts` (단일 파일)

**Forbids**

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

**Role** — UI에 제공되는 데이터 페칭 훅 (TanStack Query 등). domain-service만 호출 — Repository 직접 호출 금지.

**Contains**

- 한 feature의 React Query 훅 (useQuery/useMutation) — `src/http/<feature>/hook.ts`
- Service 팩토리 훅도 같은 파일에 동거 가능

**Forbids**

- http-repository 직접 import (→ domain-service 경유)
- UI 컴포넌트 import (훅은 데이터 계약만)

```ts
// src/http/order/hook.ts
export function useOrder(id: string) {
  const service = useOrderService();
  return useQuery({
    queryKey: ['order', id],
    queryFn: () => service.getOrder(id),
  });
}
```

### `lib-shared`

**Role** — 공용 유틸 함수. 내부 의존 0 — 다른 레이어 import 금지 (allow: []).

**Contains**

- 순수 유틸 함수 — `src/lib/utils/*.ts` (예: `cn.ts`, `format-date.ts`, `auth.ts`)

**Forbids**

- 다른 레이어 import (순수 유틸 경계 유지)
- layered code 배치 (도메인/HTTP는 `src/domain/`, `src/http/`로 promote됨)

### `dictionary`

**Role** — i18n 사전. 로케일별 메시지 객체 + 타입 안전 키 (shared-type과 상호 참조).

**Contains**

- 사전 파일 — `src/lib/dictionaries/*.ts`
- 로케일 loader — `src/app/[locale]/dictionaries.ts`

**Forbids**

- 런타임 비즈니스 로직 (순수 데이터 객체)

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
| `http-mapper` | `domain-model`, `http-dto` |
| `http-repository` | `http-client`, `http-endpoint`, `http-dto`, `http-mapper`, `domain-port`, `domain-error`, `domain-model`, `db` |
| `http-hook` | `domain-service` |
| `lib-shared` | _(no layer imports)_ |
| `db` | _(no layer imports)_ |
| `shared-ui` | `domain-model`, `shared-ui`, `shared-type` |
| `page-component` | `http-hook`, `shared-ui`, `domain-model`, `page-component`, `lib-shared`, `shared-type` |
| `page-provider` | `lib-shared` |
| `dictionary` | `shared-type`, `dictionary` |
| `shared-type` | `dictionary` |
| `email-template` | `dictionary`, `shared-type` |
| `route-handler` | `domain-model`, `domain-error`, `domain-service`, `shared-type` |
| `page` | `page-component`, `page-provider`, `shared-ui`, `dictionary`, `shared-type`, `page` |

## Restricted Patterns (Import 금지 패턴)

전역 no-restricted-imports 패턴. 깊은 상대경로(`../../**`) 금지로 폴더 구조
리팩토링 시 import 파손 방지 + `@/*` path alias 사용 강제.

| 패턴 | 메시지 |
| --- | --- |
| `../../**` | Use @/* path alias instead of deep relative parent imports. |

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
테스트/스펙/설정, 루트 메타 파일, scripts/e2e 빌드 유틸, 전역 타입 등.

### 무시 패턴 목록

- **테스트/설정 파일**: `**/*.test.ts`, `**/*.test.tsx`, `**/*.spec.ts`, `**/*.spec.tsx`, `*.config.*`
- **타입/메타 파일**: `*.ts`, `*.d.ts`, `types/**`, `src/lib/types/**`
- **특수 경로**: `specs/**`
- **빌드/툴 산출물 (코드 작성 무관)**: `.kelo/**`, `scripts/**`, `e2e/**`, `.next/**`, `out/**`, `build/**`, `coverage/**`, `next-env.d.ts`

# Lint Rules — Structure Reference (nextjs/base)

## 개요

아키텍처 경계 — 각 레이어 type ↔ 경로 매핑.
`mode: 'full'`은 글로브로 전체 경로 매칭 (단일 파일·feature-first per-file glob).
레이어 책임은 `baseLayerSemantics` 참조.

## 프로젝트 구조

> 아래 트리는 **대표 구조 예시**입니다. 표기 컨벤션: `<name>` = doc placeholder (실제 폴더는 구체 이름, 예: `<feature>` → `users/`/`products/`). `[name]`/`[...name]`/`(name)` = Next.js 라우팅 컨벤션 (브래킷/괄호가 진짜 폴더명의 일부). lint는 glob(`**`, `*`)로 유연 매칭, `[locale]`처럼 명시된 literal bracket은 그대로 강제합니다.

```
└── src/
    ├── app/                      # page — 최상위 페이지 catch-all
    │   ├── [locale]/             # Locale 동적 세그먼트 (Next.js literal — 폴더명이 그대로 `[locale]`)
    │   │   ├── _components/      # page-component — Page-colocated Client Components ('use client')
    │   │   ├── _providers/       # page-provider — Page-colocated Providers ('use client')
    │   │   ├── (group)/          # Next.js route group — 괄호가 진짜 폴더명. URL 미포함. 실제: `(protected)`, `(auth)` 등
    │   │   ├── <feature>/        # doc placeholder — 실제 폴더는 구체 이름 (예: `users/`, `products/`, `dashboard/`)
    │   │   │   ├── _components/  # page-component — 이 레벨에도 가능 (glob `**` 매칭)
    │   │   │   ├── [id]/         # Next.js 동적 세그먼트 — 브래킷이 진짜 폴더명. 안의 이름은 가변 (`[id]`, `[slug]`, `[orderId]` 등)
    │   │   │   │   └── page.tsx
    │   │   │   └── page.tsx
    │   │   ├── dictionaries.ts   # dictionary — i18n dictionary loader
    │   │   ├── error.tsx         # Error boundary ('use client' 필수)
    │   │   ├── layout.tsx        # Root layout (Server Component)
    │   │   ├── loading.tsx       # Suspense fallback UI (선택)
    │   │   ├── not-found.tsx     # 404 페이지 (선택)
    │   │   └── page.tsx          # Home page (Server Component)
    │   └── api/                  # Route Handlers 관용 위치 — `/api/*`
    │       └── <resource>/       # doc placeholder — 실제 폴더는 구체 자원명 (예: `users/`, `auth/`, `projects/`)
    │           ├── [...slug]/    # Next.js catch-all 세그먼트 — 폴더명이 그대로 `[...slug]` (예: `auth/[...nextauth]`)
    │           │   └── route.ts  # route-handler — API 진입점 (얇은 HTTP 어댑터)
    │           ├── [id]/         # Next.js 동적 세그먼트 — 폴더명이 그대로 `[id]` 또는 `[slug]` 등
    │           │   └── route.ts  # route-handler — API 진입점 (얇은 HTTP 어댑터)
    │           └── route.ts      # route-handler — HTTP 핸들러 (GET/POST/PUT/DELETE export)
    ├── components/               # shared-ui — 전역 재사용 컴포넌트
    ├── db/                       # db — DB 드라이버 래퍼
    ├── domain/
    │   └── *
    │       ├── errors.ts         # domain-error — 도메인 에러
    │       ├── model.ts          # domain-model — Entity·VO
    │       ├── port.ts           # domain-port — Repository 인터페이스
    │       └── service.ts        # domain-service — UseCase/서비스
    ├── email-templates/          # email-template — React Email 등 이메일 템플릿
    ├── http/
    │   ├── _generated/
    │   │   ├── endpoints.ts      # http-endpoint — (generated) URL 헬퍼
    │   │   └── types.ts          # http-dto — (generated) DTO 타입
    │   ├── *
    │   │   ├── hook.ts           # http-hook — TanStack Query 훅
    │   │   ├── mapper.ts         # http-mapper — DTO ↔ Domain 변환
    │   │   └── repository.ts     # http-repository — Port 구현체
    │   └── client.ts             # http-client — HTTP 클라이언트
    └── lib/
        ├── dictionaries/
        │   └── *                 # dictionary — i18n 사전
        ├── types/                # shared-type — 전역 타입
        └── utils/
            └── *.ts              # lib-shared — 공용 유틸 함수
```

## 레이어별 경로 매핑

| 타입 | 경로 패턴 | 모드 | 설명 |
| --- | --- | --- | --- |
| `domain-model` | `src/domain/*/model.ts` | `full` | Entity·VO |
| `domain-error` | `src/domain/*/errors.ts` | `full` | 도메인 에러 |
| `domain-port` | `src/domain/*/port.ts` | `full` | Repository 인터페이스 |
| `domain-service` | `src/domain/*/service.ts` | `full` | UseCase/서비스 |
| `http-client` | `src/http/client.ts` | `full` | HTTP 클라이언트 |
| `http-endpoint` | `src/http/_generated/endpoints.ts` | `full` | (generated) URL 헬퍼 |
| `http-dto` | `src/http/_generated/types.ts` | `full` | (generated) DTO 타입 |
| `http-mapper` | `src/http/*/mapper.ts` | `full` | DTO ↔ Domain 변환 |
| `http-repository` | `src/http/*/repository.ts` | `full` | Port 구현체 |
| `http-hook` | `src/http/*/hook.ts` | `full` | TanStack Query 훅 |
| `lib-shared` | `src/lib/utils/*.ts` | `full` | 공용 유틸 함수 |
| `dictionary` | `src/lib/dictionaries/*` / `src/app/\[locale\]/dictionaries.ts` | `full` | i18n 사전 |
| `shared-type` | `src/lib/types` | — | 전역 타입 |
| `db` | `src/db` | — | DB 드라이버 래퍼 |
| `shared-ui` | `src/components` | — | 전역 재사용 컴포넌트 |
| `page-component` | `src/app/\[locale\]/**/_components` | — | 페이지 전용 컴포넌트 ([locale] 아래) |
| `page-provider` | `src/app/\[locale\]/**/_providers` | — | 페이지 전용 Provider ([locale] 아래) |
| `email-template` | `src/email-templates` | — | React Email 등 이메일 템플릿 |
| `route-handler` | `src/app/**/route.ts` | `full` | API 진입점 (얇은 HTTP 어댑터) |
| `page` | `src/app` | — | 최상위 페이지 catch-all |

# Stylelint Rules Reference (nextjs/base)

## Baseline

- **Extends**: `stylelint-config-standard`
- **Plugins**: `stylelint-declaration-strict-value`

Stylelint baseline — Next.js 공통 규약.
Bundles: `stylelint-config-standard`, `stylelint-declaration-strict-value`.
사용자 프로젝트는 `stylelint.config.mjs`에서 spread + 추가 rules로 override.

## Rule 1: `declaration-property-value-disallowed-list`

Accessibility-critical 속성의 `var()` 값은 fallback 필수 (severity: warning).

### Configuration

- **Enforced properties**: `outline`, `outline-color`, `box-shadow`, `color`, `background`, `background-color`, `border`, `border-color`, `border-top`, `border-right`, `border-bottom`, `border-left`
- **Disallowed value patterns**: `/var\(--[^,)]+\)$/`
- **Severity**: `warning`
- **Stylelint message**:
  > CSS variables in accessibility-critical declarations must include a fallback value. Use `var(--token, <fallback>)`. A single undefined var() invalidates the entire declaration, removing browser default focus rings and causing FOUC on pre-hydration paths.

### Why

fallback 없는 `var()`가 미정의되면 선언 전체가 `invalid-at-computed-value`가 되어
브라우저 기본 outline·색까지 무효화 → 포커스 링 소실·FOUC. WCAG 2.4.7 리스크.
Theme provider 하이드레이션 이전 경로(SSR 초기 페인트, error.tsx, not-found.tsx)에서 재현.

### Examples

**Bad**

```css
outline: 2px solid var(--mantine-primary-color-filled);
```

**Good**

```css
outline: 2px solid var(--mantine-primary-color-filled, #005da7);
```

## Rule 2: `scale-unlimited/declaration-strict-value`

디자인 토큰 리터럴 차단 — `var(--token)` 또는 design-token 참조만 허용 (컨벤션 C13).

### Configuration

- **Enforced properties**: `/color$/`, `fill`, `stroke`, `font-family`, `border-radius`, `box-shadow`
- **Allowed values (ignoreValues)**: `/^var\(/`, `transparent`, `inherit`, `currentColor`, `unset`, `initial`, `none`, `0`, `auto`
- **Allowed functions (ignoreFunctions)**: `var`
- **Stylelint message (fn)**:
  ```js
  (property) =>
            `Expected \`var(--token, <fallback>)\` or design-token reference for \`${property}\`. ` +
            'Hardcoded values bypass theme tokens (src/theme.ts) and break dark/light switching.'
  ```

### Why

리터럴 색/radius/shadow가 섞이면 `src/theme.ts` 토큰 정책이 무력화되고
다크/라이트 테마 전환이 깨진다. JSX 인라인 style의 동일 정책은 ESLint custom rule
`no-inline-style-tokens`가 대칭 커버.

### Examples

**Bad**

```css
color: #ff0000;
border-radius: 12px;
```

**Good**

```css
color: var(--mantine-color-text, #1a1a1a);
border-radius: var(--mantine-radius-md, 8px);
```

# Lint Rules Reference (nextjs/tanstack-query)

## Domain Purity (도메인 순수성)

도메인 레이어에서 TanStack 차단 — React 런타임 결합 hook 라이브러리.
사용 위치: `src/http/<feature>/hook.ts` (http-hook 레이어).

### 도메인 레이어 금지 패키지

- `@tanstack/**`
