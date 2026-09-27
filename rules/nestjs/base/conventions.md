# Conventions

## Code Style

- **Naming (model/ only)**: `model/` 만 suffix 없음 허용 (순수 도메인 함수, 예: `cost-calculator.ts`). 허용 suffix: `*.prompt.ts` (AI prompt), `*.types.ts` (타입), `*.constants.ts` (상수 / enum).
- **File Size**: 파일당 최대 400줄 권장

## Error Handling

- **New Domain Exception**: `exception/` 에 `*.error.ts` 생성.
  에러 코드 (snake_case 소문자, 예: `order_not_found`) 는 `src/infrastructure/i18n/locales/<lang>/error.json` 모든 로케일에 key=코드, value=localized message 로 등록.
  → `npx kelo-check-i18n` 로 검증.

## Response DTO Pattern

### DTO Structure

```
src/modules/{domain}/dto/
├── create-{domain}.dto.ts            # 생성 요청
├── update-{domain}.dto.ts            # 수정 요청 (PartialType 사용)
├── {domain}-query.dto.ts             # 쿼리 파라미터
├── {domain}-data.response.dto.ts     # 응답의 data 직속 DTO
└── {domain}-item.dto.ts              # 배열 요소 / 중첩 객체 / 보조 DTO
```

### Naming Convention

`ApiSuccessResponse` 가 모든 응답을 `{ success, data }` 로 래핑. DTO 이름은 이 envelope 기준으로 정한다 (도메인 내 액션 충돌 시 `List` / `Create` / `Detail` prefix 추가, 그 외 생략).

```typescript
// GET /orders → { success: true, data: OrderListDataResponseDto }
class OrderListDataResponseDto {
  readonly items: readonly OrderItemDto[];
  readonly limit: number;
  readonly total?: number;
}

// POST /orders → { success: true, data: OrderCreateDataResponseDto }
class OrderCreateDataResponseDto {
  readonly id: string;
  readonly items: readonly ProductItemDto[];
}
```

### Core Principles

- **Entity Encapsulation**: DB 스키마와 API 응답 노출을 분리
- **Example Values**: `@ApiProperty` 에 `example` 지정
- **Union Type Rules**: `T | null` (원시 / `Date`) 허용 — 유니온은 리플렉션 추론이 안 되므로(미지정 시 OpenAPI 스키마가 `type: object` 로 생성됨) `@ApiProperty` 에 `type` 을 항상 명시한다.
  - `number | null` → `type: Number`
  - `boolean | null` → `type: Boolean`
  - `Date | null` → `type: String, format: 'date-time'`

## Testing Strategy

- **Model Test**: 순수 함수 단위 테스트
- **Service Test**: outbound-port 를 mock. 외부 의존 없이 비즈니스 로직 검증
- **Provider Test**: 실제 외부 서비스를 mock 하여 adapter 동작 검증
- **Controller Test**: inbound-port 를 mock. HTTP 요청 / 응답 처리 검증
- **E2E Test**: 전체 모듈을 조립하여 HTTP 요청으로 검증

```typescript
// Service 단위 테스트 예시
describe('CreateOrderService', () => {
  it('should create an order with calculated total', async () => {
    const mockRepo: OrderRepositoryPort = {
      save: jest.fn().mockResolvedValue({ id: '1', status: 'pending' }),
    };
    const service = new CreateOrderService(mockRepo);
    const result = await service.execute({ items: [{ productId: '1', quantity: 2 }] });
    expect(result.status).toBe('pending');
  });
});
```
