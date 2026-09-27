<!-- GENERATED DOCUMENT - DO NOT MODIFY BY HAND -->
<!-- Generator: scripts/typescript/gen-eslint-reference.mjs -->
<!-- Source: rules/nestjs/base/eslint.rules.mjs -->

# Lint Rules Reference (nestjs/base)

## 레이어 글로서리 (Layer Glossary)

각 레이어의 책임·포함 파일·금지·대표 코드 형태.
경로·allow 매트릭스만으로 안 드러나는 의미를 보강해 올바른 코드 배치를 안내.

### `model`

**Role** — 도메인 Entity · Value Object · 순수 함수. 비즈니스 규칙의 단일 진실 공급원이자 프로젝트에서 가장 안정적인 레이어.

**Contains**

- Entity (interface/type) — `*.entity.ts`
- Value Object — `*.vo.ts`
- 순수 함수 — `*.functions.ts`
- 도메인 상수·공용 타입 — `*.type.ts`

**Forbids**

- ORM 엔티티 정의 (→ `provider/*.orm-entity.ts`로 분리)
- class 기반 도메인 모델 (interface/type + 순수 함수 지향)

**Scope** — Entity 필드는 `readonly` 강제 (baseImmutabilityRules). 파일 suffix 강제 대상 제외 — 파일 분할 자유 (단, 하위 폴더 금지: local/no-nested-layer-dir).

```ts
// model/order.entity.ts
export type OrderStatus = 'pending' | 'confirmed' | 'shipped';
export interface Order {
  readonly id: string;
  readonly items: ReadonlyArray<OrderItem>;
  readonly status: OrderStatus;
}
```

### `port`

**Role** — 인바운드·아웃바운드 Port 인터페이스. service와 바깥 세계(HTTP/DB/SDK) 사이의 경계 계약. 같은 폴더에 두고 네이밍으로 방향 구분.

**Contains**

- Inbound Port (service가 구현) — `*.port.ts`
- Outbound Port (provider가 구현) — `*.port.ts`
- DI 주입 토큰 (Symbol) — `port-tokens.ts`

**Forbids**

- 프레임워크 타입 (@nestjs/*, express, class-validator 등)
- Express global namespace 참조 (`Express.Multer.File` 등 → 도메인 타입으로 변환)

**Scope** — 인터페이스 시그니처엔 model/common 타입만 사용.

```ts
// port/order-repository.port.ts  (outbound)
export interface OrderRepositoryPort {
  save(order: Order): Promise<Order>;
  findById(id: string): Promise<Order | null>;
}

// port/port-tokens.ts
export const ORDER_REPOSITORY_PORT = Symbol('OrderRepositoryPort');
```

### `service`

**Role** — Inbound Port 구현체(UseCase). Outbound Port를 주입받아 비즈니스 흐름을 조합.

**Contains**

- Service 클래스 (@Injectable, implements InboundPort) — `*.service.ts`
- 도메인 이벤트 리스너 (@OnEvent) — `*.service.ts`

**Forbids**

- @nestjs/* 대부분 (Injectable/Inject/OnEvent만 예외 허용)
- 인프라 SDK/ORM 직접 사용 (→ Outbound Port로 추상화)

**Scope** — HTTP 관심사는 controller로 분리. `*.spec.ts`는 lint 완화 (mock/stub 자유).

```ts
// service/create-order.service.ts
@Injectable()
export class CreateOrderService implements CreateOrderPort {
  constructor(
    @Inject(ORDER_REPOSITORY_PORT)
    private readonly orderRepository: OrderRepositoryPort,
  ) {}
  async execute(input: CreateOrderInput): Promise<Order> {
    return this.orderRepository.save({ ...input, id: generateId() });
  }
}
```

### `controller`

**Role** — HTTP 인바운드 어댑터. 요청 수신 → DTO 검증 → Inbound Port 호출 → Response DTO 변환.

**Contains**

- NestJS Controller 클래스 (@Controller) — `*.controller.ts`

**Forbids**

- Entity 직접 return (→ Response DTO로 매핑; local/no-entity-return)
- catch 블록의 예외 미매핑 (local/require-map-domain-exception)

**Scope** — service는 Inbound Port를 통해서만 호출 (DI 컨테이너가 Port ↔ Service 바인딩). NestJS 생태계(Guard/Pipe/Interceptor) 자유 사용.

```ts
// controller/order.controller.ts
@Controller('orders')
export class OrderController {
  constructor(
    @Inject(CREATE_ORDER_PORT)
    private readonly createOrder: CreateOrderPort,
  ) {}
  @Post()
  async create(@Body() dto: CreateOrderRequestDto): Promise<OrderResponseDto> {
    const order = await this.createOrder.execute(dto);
    return toOrderResponseDto(order);
  }
}
```

### `strategy`

**Role** — Inbound 어댑터의 한 변종. Passport 인증 전략(JWT/Local/OAuth)이나 교체 가능한 알고리즘(Strategy 패턴) 등 controller와는 다른 진입 경로/변형을 담는다.

**Contains**

- Passport Strategy (extends PassportStrategy) — `*.strategy.ts`
- 그 외 교체 가능한 도메인 알고리즘 (@Injectable) — `*.strategy.ts`

**Forbids**

- service/controller/provider 직접 import (DI 컨테이너로 Port 통해 위임)
- ORM 엔티티 직접 사용 (→ Port를 통해 추상화)

**Scope** — controller와 동일하게 NestJS 생태계 자유 사용. 비즈니스 로직은 Port 호출로 위임 (validate() 안에서 service 직접 호출 금지).

```ts
// strategy/jwt.strategy.ts
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(VALIDATE_USER_PORT)
    private readonly validateUser: ValidateUserPort,
  ) {
    super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), secretOrKey: process.env.JWT_SECRET });
  }
  async validate(payload: JwtPayload): Promise<AuthenticatedUserDto> {
    return this.validateUser.execute(payload.sub);
  }
}
```

### `provider`

**Role** — Outbound Port 구현체. Port 인터페이스를 실제 ORM·외부 SDK·HTTP client로 구현.

**Contains**

- Port 구현 adapter 클래스 (@Injectable) — `*.adapter.ts`
- ORM 엔티티 (@Entity) — `*.orm-entity.ts`
- ORM ↔ Domain 매퍼 (선택) — `*.mapper.ts`
- cron·스케줄 작업 (선택) — `*.scheduler.ts`

**Forbids**

- ORM 엔티티를 도메인 Entity로 재사용 (model과 분리, 매퍼로 변환)

**Scope** — `*.orm-entity.ts`의 Date 컬럼은 `timestamptz` 강제 (local/require-timestamptz). ORM/SDK 자유 사용.

```ts
// provider/order-repository.adapter.ts
@Injectable()
export class OrderRepositoryAdapter implements OrderRepositoryPort {
  constructor(
    @InjectRepository(OrderOrmEntity)
    private readonly repo: Repository<OrderOrmEntity>,
  ) {}
  async save(order: Order): Promise<Order> {
    const saved = await this.repo.save(OrderMapper.toOrm(order));
    return OrderMapper.toDomain(saved);
  }
}
```

### `exception`

**Role** — 도메인 특화 예외. controller의 `mapDomainException()`을 통해 HTTP status로 매핑된다.

**Contains**

- 도메인 예외 클래스 (extends common의 base error) — `*.error.ts`

**Forbids**

- `HttpException` 등 NestJS HTTP 타입 상속 (도메인 순수성 유지)

```ts
// exception/order-not-found.error.ts
export class OrderNotFoundError extends DomainError {
  constructor(id: string) {
    super(`Order not found: ${id}`);
  }
}
```

### `dto`

**Role** — 요청/응답 경계 타입. class-validator로 검증, class-transformer로 직렬화, @ApiProperty로 OpenAPI 스키마 생성.

**Contains**

- Request DTO — `*.request.dto.ts`
- Response DTO — `*.response.dto.ts` (클래스명 `*DataResponseDto`)
- Response 배열 원소 — `*-item.dto.ts` (클래스명 `*ItemDto`)

**Forbids**

- bare `*ResponseDto` 네이밍 (→ `*DataResponseDto`/`*ItemDto`; local/dto-naming-convention)
- Union 타입 (`A | B`) / 필드-데코레이터 nullable 불일치 (local/dto-union-type-restriction, local/dto-nullable-match)
- `oneOf` 사용 (local/no-dto-oneof)

**Scope** — 모든 필드에 `@ApiProperty` 강제 (local/require-api-property). `readonly` 강제 (baseImmutabilityRules).

```ts
// dto/create-order.request.dto.ts
export class CreateOrderRequestDto {
  @ApiProperty({ type: [OrderItemDto] })
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  readonly items!: readonly OrderItemDto[];
}
```

### `common-pure`

**Role** — framework-free 공용 데이터/유틸 — 모든 레이어가 import 가능한 최하위 순수 sink. 자기 자신만 참조.

**Contains**

- 도메인 enum, magic number, DI 토큰 (Symbol) — `constants/*.ts`

**Forbids**

- 다른 모든 레이어 import (model·common·infra 포함 — pure sink 보장)
- 프레임워크 의존성 (`@nestjs/*`, `class-validator` 등)

**Scope** — `baseBoundaryRules`에서 모든 from→to allow에 `common-pure` 동반 추가 — model 포함 어떤 레이어에서든 import 가능. 새 pure 폴더 풀 때는 element pattern에만 append.

### `common`

**Role** — 전역 공용 — 모듈 로직 밖의 수평 관심사. 최하위 계층이라 상향 의존 금지.

**Contains**

- 인증 유틸 (Passport strategy 등) — `authentication/**`
- Route Guard — `guards/**`
- Exception Filter·도메인 예외 베이스 — `exceptions/**`
- 공용 인터페이스 — `interfaces/**`
- Global Middleware — `middlewares/**`
- Validation Pipe — `pipes/**`
- Global Interceptor (logging·transform·timeout) — `interceptors/**`
- Custom Decorator (@CurrentUser·@Public 등) — `decorators/**`
- Domain/integration event payload·listener — `events/**`
- 공용 DTO — `dtos/**`
- 앱 레벨 설정 (env·ConfigModule schema) — `config/**`
- 순수 유틸 함수 (프레임워크 비의존) — `utils/**`

**Forbids**

- 허용 하위 폴더 외 경로에 파일 배치 (boundaries/no-unknown-files가 거부)

### `infrastructure`

**Role** — 인프라 수평 관심사 — 프레임워크/미들웨어 수준의 부트스트랩·설정 코드.

**Contains**

- DB 설정·커넥션 — `database/**`
- I18n 설정 — `i18n/**`
- Logger 설정 — `logger/**`
- Prometheus 메트릭 수집 — `metrics/**`
- Cache 설정 — `cache/**`
- 메일 발송 인프라 — `email/**`
- 트랜잭션 관리 — `transaction/**`
- 외부 서비스 클라이언트 (3rd-party SDK·HTTP client wrapper) — `external/**`

**Forbids**

- 모듈 도메인 로직 import (service/controller/provider)
- 허용 하위 폴더 외 경로 (boundaries/no-unknown-files가 거부)

### `libs`

**Role** — 독립 라이브러리성 모듈 — 앱 조립 수준에서 재사용할 수 있는 단위. 모든 레이어 참조 가능 (catch-all).

**Contains**

- 라이브러리성 모듈 (내부 구조 자유) — `src/libs/**`

**Forbids**

- 모듈 도메인 로직 이관 (원래 속한 `src/modules/<domain>/`로 유지)

## 의존성 규칙 (Dependency Rules)

레이어 간 import 관계 (allow-list). 기본 disallow 정책 위에 아래 조합만 허용.
각 레이어의 역할·책임은 "레이어 글로서리" 섹션 참조.

시각화된 의존성 그래프는 `lint-rules-diagram.md` 참조.

### Allow 매트릭스

| From | Allow → To |
| --- | --- |
| `model` | `model`, `common-pure` |
| `exception` | `exception`, `common`, `common-pure` |
| `port` | `model`, `common`, `common-pure` |
| `service` | `model`, `port`, `exception`, `common`, `common-pure`, `infrastructure` |
| `controller` | `port`, `dto`, `model`, `exception`, `common`, `common-pure`, `libs` |
| `strategy` | `port`, `dto`, `model`, `exception`, `common`, `common-pure`, `libs` |
| `provider` | `port`, `model`, `common`, `common-pure`, `infrastructure`, `provider`, `libs` |
| `dto` | `model`, `common`, `common-pure`, `dto` |
| `common` | `common`, `common-pure` |
| `common-pure` | `common-pure` |
| `infrastructure` | `infrastructure`, `common`, `common-pure` |
| `libs` | `model`, `port`, `service`, `controller`, `strategy`, `provider`, `exception`, `dto`, `common`, `common-pure`, `infrastructure`, `libs` |

## Framework 금지 패키지 (순수 레이어 차단)

순수 레이어(model/port/exception)에서 import 금지되는 프레임워크 패키지.
테스트 용이성·이식성 보장 위해 프레임워크 중립 유지.

- `@nestjs/*`
- `class-validator`
- `class-transformer`
- `express` (+ 서브경로)

## Rule Overrides (코드 작성 주의)

ESLint 오버라이드 중 **LLM이 코드 작성 시 명시적으로 따라야 할 규칙만 선별**.
(autofix가 처리하거나 LLM 기본 동작과 동일한 규칙은 생략.)

- `@typescript-eslint/consistent-type-imports` — type-only import은 `import type { X } from "..."` 인라인 형식으로 작성.
- `@typescript-eslint/no-floating-promises` — Promise는 반드시 `await` 또는 `.catch()` 체이닝 (방치 금지).
- `@typescript-eslint/no-unsafe-argument` — `any` 값을 타입된 파라미터에 전달 금지 — 타입 가드/단언으로 좁힌 뒤 전달.
- `no-warning-comments` — TODO / FIXME / HACK 주석 추적 (warn) — 차단하지 않음, 장기 방치 금지.
- `unused-imports/no-unused-vars` — 사용 안 하는 변수/파라미터는 `_` prefix (예: `_unused`, `_ctx`).

## Ignored Paths (무시 경로)

Boundary 검사 제외 — 테스트, DI 조립(*.module.ts), 부트스트랩(main/app),
헬스체크, 모듈 내부 common, 빌드/유틸 스크립트(scripts/), 모노레포 sibling
workspace로 resolve된 import.

### 무시 패턴 목록

- **테스트/설정 파일**: `**/*.spec.ts`, `**/*.test.ts`, `src/test/**`, `test/**`, `eslint.project.config.mjs`, `prettier.config.mjs`, `commitlint.config.mjs`
- **NestJS DI 조립**: `**/*.module.ts`
- **앱 부트스트랩**: `src/main.ts`, `src/app.*.ts`
- **특수 경로**: `src/modules/health/**`, `src/modules/**/common/**`, `**/packages/**`
- **빌드/툴 산출물 (코드 작성 무관)**: `scripts/**`, `.kelo/**`, `eslint.config.mjs`, `eslint-rules/**`, `dist/**`, `coverage/**`, `migrations/**`
