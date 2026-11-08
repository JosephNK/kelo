# Conventions

## 에러

- 새 도메인 예외는 `exception/*.error.ts`. 에러 코드(snake_case, 예: `order_not_found`)를 `src/infrastructure/i18n/locales/<lang>/error.json` 모든 로케일에 key=코드, value=메시지로 등록하고 `npx kelo-check-i18n`으로 검증한다.

## 응답 DTO

- `ApiSuccessResponse`가 모든 응답을 `{ success, data }`로 감싼다 — `data` 직속은 `*DataResponseDto`, 배열 요소·중첩 객체는 `*ItemDto`.
- 같은 도메인에서 액션이 겹칠 때만 `List`/`Create`/`Detail` prefix를 붙인다 (예: `OrderListDataResponseDto`).
- `@ApiProperty`에 `example`을 지정한다.

## 테스트

- Model: 순수 함수 단위 테스트
- Service: outbound port를 mock해 비즈니스 로직 검증
- Provider: 외부 서비스를 mock해 adapter 동작 검증
- Controller: inbound port를 mock해 HTTP 요청·응답 검증
- E2E: 모듈 전체를 조립해 HTTP 요청으로 검증

---

## Project-specific

@CONVENTIONS.PROJECT.md

See [CONVENTIONS.PROJECT.md](./CONVENTIONS.PROJECT.md) for project-specific required reading.
