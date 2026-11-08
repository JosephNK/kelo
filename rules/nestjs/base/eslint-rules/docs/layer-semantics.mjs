/**
 * 각 레이어의 책임·포함 파일·금지·대표 코드 형태.
 * 경로·allow 매트릭스만으로 안 드러나는 의미를 보강해 올바른 코드 배치를 안내.
 */
export const baseLayerSemantics = {
  model: {
    role: "도메인 Entity · Value Object · 순수 함수. 비즈니스 규칙의 단일 진실 공급원이자 프로젝트에서 가장 안정적인 레이어.",
    contains: [
      "Entity (interface/type) — `*.entity.ts`",
      "Value Object — `*.vo.ts`",
      "순수 함수 — `*.functions.ts`",
      "도메인 상수·공용 타입 — `*.type.ts`",
    ],
    forbids: [
      "ORM 엔티티 정의 (→ `provider/*.orm-entity.ts`로 분리)",
      "class 기반 도메인 모델 (interface/type + 순수 함수 지향)",
    ],
    scope:
      "Entity 필드는 `readonly` 강제 (baseImmutabilityRules). 파일 suffix 강제 대상 제외 — 파일 분할 자유 (단, 하위 폴더 금지: local/no-nested-layer-dir).",
    example: [
      "// model/order.entity.ts",
      "export type OrderStatus = 'pending' | 'confirmed' | 'shipped';",
      "export interface Order {",
      "  readonly id: string;",
      "  readonly items: ReadonlyArray<OrderItem>;",
      "  readonly status: OrderStatus;",
      "}",
    ].join("\n"),
  },

  port: {
    role: "인바운드·아웃바운드 Port 인터페이스. service와 바깥 세계(HTTP/DB/SDK) 사이의 경계 계약. 같은 폴더에 두고 네이밍으로 방향 구분.",
    contains: [
      "Inbound Port (service가 구현) — `*.port.ts`",
      "Outbound Port (provider가 구현) — `*.port.ts`",
      "DI 주입 토큰 (Symbol) — `port-tokens.ts`",
    ],
    forbids: [
      "프레임워크 타입 (@nestjs/*, express, class-validator 등)",
      "Express global namespace 참조 (`Express.Multer.File` 등 → 도메인 타입으로 변환)",
    ],
    scope: "인터페이스 시그니처엔 model/common 타입만 사용.",
    example: [
      "// port/order-repository.port.ts  (outbound)",
      "export interface OrderRepositoryPort {",
      "  save(order: Order): Promise<Order>;",
      "  findById(id: string): Promise<Order | null>;",
      "}",
      "",
      "// port/port-tokens.ts",
      "export const ORDER_REPOSITORY_PORT = Symbol('OrderRepositoryPort');",
    ].join("\n"),
  },

  service: {
    role: "Inbound Port 구현체(UseCase). Outbound Port를 주입받아 비즈니스 흐름을 조합.",
    contains: [
      "Service 클래스 (@Injectable, implements InboundPort) — `*.service.ts`",
      "도메인 이벤트 리스너 (@OnEvent) — `*.service.ts`",
    ],
    forbids: [
      "@nestjs/* 대부분 (Injectable/Inject/OnEvent만 예외 허용)",
      "인프라 SDK/ORM·`infrastructure`(DB·캐시·메일·외부 API) 직접 사용 (→ Outbound Port로 추상화)",
    ],
    scope:
      "logger·metrics·transaction(`infrastructure-shared`)은 직접 사용 가능. HTTP 관심사는 controller로 분리. `*.spec.ts`는 lint 완화 (mock/stub 자유).",
    example: [
      "// service/create-order.service.ts",
      "@Injectable()",
      "export class CreateOrderService implements CreateOrderPort {",
      "  constructor(",
      "    @Inject(ORDER_REPOSITORY_PORT)",
      "    private readonly orderRepository: OrderRepositoryPort,",
      "  ) {}",
      "  async execute(input: CreateOrderInput): Promise<Order> {",
      "    return this.orderRepository.save({ ...input, id: generateId() });",
      "  }",
      "}",
    ].join("\n"),
  },

  controller: {
    role: "HTTP 인바운드 어댑터. 요청 수신 → DTO 검증 → Inbound Port 호출 → Response DTO 변환.",
    contains: ["NestJS Controller 클래스 (@Controller) — `*.controller.ts`"],
    forbids: [
      "Entity 직접 return (→ Response DTO로 매핑; local/no-entity-return)",
      "catch 블록의 예외 미매핑 (local/require-map-domain-exception)",
    ],
    scope:
      "service는 Inbound Port를 통해서만 호출 (DI 컨테이너가 Port ↔ Service 바인딩). NestJS 생태계(Guard/Pipe/Interceptor) 자유 사용.",
    example: [
      "// controller/order.controller.ts",
      "@Controller('orders')",
      "export class OrderController {",
      "  constructor(",
      "    @Inject(CREATE_ORDER_PORT)",
      "    private readonly createOrder: CreateOrderPort,",
      "  ) {}",
      "  @Post()",
      "  async create(@Body() dto: CreateOrderRequestDto): Promise<OrderResponseDto> {",
      "    const order = await this.createOrder.execute(dto);",
      "    return toOrderResponseDto(order);",
      "  }",
      "}",
    ].join("\n"),
  },

  strategy: {
    role: "Inbound 어댑터의 한 변종. Passport 인증 전략(JWT/Local/OAuth)이나 교체 가능한 알고리즘(Strategy 패턴) 등 controller와는 다른 진입 경로/변형을 담는다.",
    contains: [
      "Passport Strategy (extends PassportStrategy) — `*.strategy.ts`",
      "그 외 교체 가능한 도메인 알고리즘 (@Injectable) — `*.strategy.ts`",
    ],
    forbids: [
      "service/controller/provider 직접 import (DI 컨테이너로 Port 통해 위임)",
      "ORM 엔티티 직접 사용 (→ Port를 통해 추상화)",
    ],
    scope:
      "controller와 동일하게 NestJS 생태계 자유 사용. 비즈니스 로직은 Port 호출로 위임 (validate() 안에서 service 직접 호출 금지).",
    example: [
      "// strategy/jwt.strategy.ts",
      "@Injectable()",
      "export class JwtStrategy extends PassportStrategy(Strategy) {",
      "  constructor(",
      "    @Inject(VALIDATE_USER_PORT)",
      "    private readonly validateUser: ValidateUserPort,",
      "  ) {",
      "    super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), secretOrKey: process.env.JWT_SECRET });",
      "  }",
      "  async validate(payload: JwtPayload): Promise<AuthenticatedUserDto> {",
      "    return this.validateUser.execute(payload.sub);",
      "  }",
      "}",
    ].join("\n"),
  },

  provider: {
    role: "Outbound Port 구현체. Port 인터페이스를 실제 ORM·외부 SDK·HTTP client로 구현.",
    contains: [
      "Port 구현 adapter 클래스 (@Injectable) — `*.adapter.ts`",
      "ORM 엔티티 (@Entity) — `*.orm-entity.ts`",
      "ORM ↔ Domain 매퍼 (선택) — `*.mapper.ts`",
      "cron·스케줄 작업 (선택) — `*.scheduler.ts`",
    ],
    forbids: [
      "ORM 엔티티를 도메인 Entity로 재사용 (model과 분리, 매퍼로 변환)",
      "다른 모듈의 provider(ORM 엔티티) import — 모듈 간 관계는 ID 컬럼으로 참조하고 조인은 쿼리로",
    ],
    scope:
      "`*.orm-entity.ts`의 Date 컬럼은 `timestamptz` 강제 (local/require-timestamptz). ORM/SDK 자유 사용.",
    example: [
      "// provider/order-repository.adapter.ts",
      "@Injectable()",
      "export class OrderRepositoryAdapter implements OrderRepositoryPort {",
      "  constructor(",
      "    @InjectRepository(OrderOrmEntity)",
      "    private readonly repo: Repository<OrderOrmEntity>,",
      "  ) {}",
      "  async save(order: Order): Promise<Order> {",
      "    const saved = await this.repo.save(OrderMapper.toOrm(order));",
      "    return OrderMapper.toDomain(saved);",
      "  }",
      "}",
    ].join("\n"),
  },

  exception: {
    role: "도메인 특화 예외. controller의 `mapDomainException()`을 통해 HTTP status로 매핑된다.",
    contains: [
      "도메인 예외 클래스 (extends common의 base error) — `*.error.ts`",
    ],
    forbids: ["`HttpException` 등 NestJS HTTP 타입 상속 (도메인 순수성 유지)"],
    example: [
      "// exception/order-not-found.error.ts",
      "export class OrderNotFoundError extends DomainError {",
      "  constructor(id: string) {",
      "    super(`Order not found: ${id}`);",
      "  }",
      "}",
    ].join("\n"),
  },

  dto: {
    role: "요청/응답 경계 타입. class-validator로 검증, class-transformer로 직렬화, @ApiProperty로 OpenAPI 스키마 생성.",
    contains: [
      "Request DTO — `*.request.dto.ts`",
      "Response DTO — `*.response.dto.ts` (클래스명 `*DataResponseDto`)",
      "Response 배열 원소 — `*-item.dto.ts` (클래스명 `*ItemDto`)",
    ],
    forbids: [
      "bare `*ResponseDto` 네이밍 (→ `*DataResponseDto`/`*ItemDto`; local/dto-naming-convention)",
      "Union 타입 (`A | B`) / 필드-데코레이터 nullable 불일치 (local/dto-union-type-restriction, local/dto-nullable-match)",
      "`oneOf` 사용 (local/no-dto-oneof)",
    ],
    scope:
      "모든 필드에 `@ApiProperty` 강제 (local/require-api-property). `readonly` 강제 (baseImmutabilityRules).",
    example: [
      "// dto/create-order.request.dto.ts",
      "export class CreateOrderRequestDto {",
      "  @ApiProperty({ type: [OrderItemDto] })",
      "  @ValidateNested({ each: true })",
      "  @Type(() => OrderItemDto)",
      "  readonly items!: readonly OrderItemDto[];",
      "}",
    ].join("\n"),
  },

  "module-common": {
    role: "모듈 내부 공용 — 한 모듈의 여러 레이어가 함께 쓰는 헬퍼. 같은 모듈에서만 import 가능.",
    contains: ["모듈 전용 유틸·상수·타입 — `common/*.ts` (suffix 강제 없음)"],
    forbids: [
      "같은 모듈의 service/controller/strategy/provider import (계약인 model·port·dto와 전역 common만 허용)",
      "다른 모듈에서 import (필요하면 model로 옮기거나 전역 `src/common`으로 올린다)",
    ],
  },

  common: {
    role: "전역 공용 — 모듈 로직 밖의 수평 관심사. 최하위 계층이라 상향 의존 금지.",
    contains: [
      "인증 유틸 (Passport strategy 등) — `authentication/**`",
      "Route Guard — `guards/**`",
      "Exception Filter·도메인 예외 베이스 — `exceptions/**`",
      "공용 인터페이스 — `interfaces/**`",
      "Global Middleware — `middlewares/**`",
      "Validation Pipe — `pipes/**`",
      "Global Interceptor (logging·transform·timeout) — `interceptors/**`",
      "Custom Decorator (@CurrentUser·@Public 등) — `decorators/**`",
      "Domain/integration event payload·listener — `events/**`",
      "공용 DTO — `dtos/**`",
      "앱 레벨 설정 (env·ConfigModule schema) — `config/**`",
      "순수 유틸 함수 (프레임워크 비의존) — `utils/**`",
    ],
    forbids: [
      "허용 하위 폴더 외 경로에 파일 배치 (local/no-unknown-files가 거부)",
    ],
  },

  "common-pure": {
    role: "framework-free 공용 데이터/유틸 — 모든 레이어가 import 가능한 최하위 순수 sink. 자기 자신만 참조.",
    contains: [
      "도메인 enum, magic number, DI 토큰 (Symbol) — `constants/*.ts`",
    ],
    forbids: [
      "다른 모든 레이어 import (model·common·infra 포함 — pure sink 보장)",
      "프레임워크 의존성 (`@nestjs/*`, `class-validator` 등)",
    ],
    scope:
      "`baseBoundaryRules`에서 모든 from→to allow에 `common-pure` 동반 추가 — model 포함 어떤 레이어에서든 import 가능. 새 pure 폴더 풀 때는 element pattern에만 append.",
  },

  "infrastructure-shared": {
    role: "외부 시스템 I/O가 없는 실행 환경 기능 — service 포함 어느 레이어든 직접 사용.",
    contains: [
      "Logger 설정 — `logger/**`",
      "Prometheus 메트릭 수집 — `metrics/**`",
      "트랜잭션 관리 — `transaction/**`",
    ],
    forbids: [
      "외부 시스템 I/O 코드 (DB 조회·메일 발송·외부 API) — `infrastructure`에 둔다",
      "모듈 도메인 로직 import (service/controller/provider)",
    ],
    scope:
      "새 인프라 폴더는 외부 시스템과 I/O를 하면 `infrastructure`, 아니면 `infrastructure-shared`에 등록한다.",
  },

  infrastructure: {
    role: "외부 시스템 I/O 인프라 — Port 구현체(provider)에서만 사용. service는 Port를 거친다.",
    contains: [
      "DB 설정·커넥션 — `database/**`",
      "I18n 설정·메시지 로더 — `i18n/**`",
      "Cache 설정 — `cache/**`",
      "메일 발송 인프라 — `email/**`",
      "외부 서비스 클라이언트 (3rd-party SDK·HTTP client wrapper) — `external/**`",
    ],
    forbids: [
      "service에서 직접 import — Port를 정의하고 provider에서 구현",
      "모듈 도메인 로직 import (service/controller/provider)",
      "허용 하위 폴더 외 경로 (local/no-unknown-files가 거부)",
    ],
  },

  libs: {
    role: "독립 라이브러리성 모듈 — 모듈과 무관하게 재사용할 수 있는 단위. libs·common·common-pure·infrastructure·infrastructure-shared만 참조.",
    contains: ["라이브러리성 모듈 (내부 구조 자유) — `src/libs/**`"],
    forbids: [
      "모듈 레이어(model/port/service/controller/provider 등) import — 조립은 `*.module.ts`가 담당",
      "모듈 도메인 로직 이관 (원래 속한 `src/modules/<domain>/`로 유지)",
    ],
  },
};
