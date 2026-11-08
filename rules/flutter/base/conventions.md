# Conventions

## 범위: common vs features

| 위치 | 언제 |
|---|---|
| `common/services/<svc>/` | 여러 feature가 쓰는 서비스·전역 인프라 (token storage, TTS, DB, auth 등) |
| `features/<feature>/domain/ports/` | 한 feature 도메인 전용 Port |
| `common/widgets/` | 2개 이상 feature가 쓰는 위젯 (feature에서 승격) |
| `features/<feature>/presentation/widgets/` | 한 feature 전용 위젯 |

- `common/services/<svc>/` 구조: 외부 시스템 1:1 wrapper면 **FLAT**(`ports/` + `adapters/`), 여러 feature가 의존하고 자체 entities/usecases/exceptions가 있으면 **nested**. 애매하면 FLAT으로 시작해 필요할 때 nested로 승격한다.

## Feature 유형

| 유형 | 구성 |
|---|---|
| Full-stack | `features/<feature>/` — domain + infrastructure + presentation |
| Presentation-only | `features/<feature>/presentation/`만 — 다른 feature의 도메인을 자체 bloc으로 사용 (bloc 필수) |
| Shared domain | `features/shared/domain/` — entities + exceptions만 |

## UseCase · Adapter · DI

- UseCase: 한 가지 비즈니스 동작, `call()`로 실행, 생성자는 `const`, 파라미터가 없으면 생략한다.
- remote + local 데이터 소스는 하나의 Adapter에서 결합한다 — 네트워크 실패 시 로컬 캐시로 fallback.
- DI(GetIt): 앱 공용 stateful 서비스는 `registerLazySingleton`, Adapter·UseCase는 `registerFactory`.

## 에러

- API Adapter: 응답 실패(403·404·429·5xx)면 `ServerException`을 throw한다.
- Local DB Adapter: DB 예외를 `DatabaseException`으로 변환한다.
- UseCase: 예외를 그대로 전파한다 (필요하면 도메인 검증 에러만 추가).

## 테스트

- `mocktail`로 mock하고, 테스트 파일 구조는 `lib/`를 그대로 따른다.
