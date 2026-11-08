# Architecture

> 이 문서: 헥사고날 **원리 · Data Flow · Dependency Direction** 개념 해설.

Hexagonal Architecture (Ports and Adapters) + NestJS 모듈 구조.
도메인 로직은 프레임워크 의존성 없는 순수 TypeScript.
핵심 원칙: **비즈니스 로직은 외부 인프라를 모른다.**

## Layer Diagram

```
[inbound-adapter]  controller/   요청 진입점 (REST, GraphQL, gRPC, CLI...)
        |
[inbound-port]     port/         service 로직을 향한 인터페이스
        |
[service]          service/      inbound-port 구현 (핵심 비즈니스 로직)
        |
[outbound-port]    port/         외부 세계를 향한 인터페이스
        |
[outbound-adapter] provider/     outbound-port 구현 (DB, AI, search engine...)
```

## Data Flow

### Request (호출 방향)

```
Client (HTTP Request)
    |
Controller          요청 수신, DTO 검증
    |
Inbound Port        service 를 향한 인터페이스
    |
Service             비즈니스 로직 조합 (순수 TS, Port 만 의존)
    |
Outbound Port       외부 세계를 향한 인터페이스
    |
Provider            실제 DB / API 호출
```

### Response (반환 방향)

```
Provider            DB / 외부 서비스의 raw 데이터
    |
Domain Model        순수 TS 엔티티 (readonly immutable)
    |
Service             비즈니스 로직 적용, Domain Model 반환
    |
Controller          response DTO 로 매핑
    |
Client (HTTP Response)
```

### Dependency Direction

```
Controller -> Inbound Port (interface) <- Service -> Outbound Port (interface) <- Provider
                                            |                                       |
                                       Domain Model  <-  <-  <-  <-  <-  <-  <-  <-
                                                   (모든 레이어가 이것에 의존)
```

## Layer Details

> 이 문서는 개념/흐름에 집중하고, 실제 레이어별 세부는 단일 소스에서 관리한다.

### module — DI Assembly

> NestJS `@Module`은 lint boundary 대상이 아니며 (모든 레이어를 조립하는 특수 파일)
> 위 글로서리에도 포함되지 않는다. 조립 규약만 참고용으로 남긴다.

```typescript
// order.module.ts
@Module({
  controllers: [OrderController],
  providers: [
    { provide: ORDER_REPOSITORY_PORT, useClass: OrderRepositoryAdapter },
    { provide: CREATE_ORDER_PORT, useClass: CreateOrderService },
  ],
})
export class OrderModule {}
```
