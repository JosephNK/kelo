<!-- GENERATED DOCUMENT - DO NOT MODIFY BY HAND -->
<!-- Generator: scripts/typescript/gen-eslint-reference.mjs -->
<!-- Source: rules/nestjs/base/eslint.rules.mjs (baseBoundaryElements, baseStructureAnnotations) -->

# Lint Rules — Structure Reference (nestjs/base)

## 개요

아키텍처 경계 — 각 레이어 type ↔ 경로 매핑.
레이어별 책임·파일 종류는 `baseLayerSemantics` 참조.

## 프로젝트 구조

> 아래 트리는 **대표 구조 예시**입니다. 표기 컨벤션: `<name>` = doc placeholder (실제 폴더는 구체 이름, 예: `<feature>` → `users/`/`products/`). lint는 glob(`**`, `*`)로 유연 매칭합니다.

```
└── src/
    ├── common/
    │   ├── authentication/             # Auth-related (Passport strategies, auth utils)
    │   ├── config/                     # App-level configuration (env, ConfigModule schemas)
    │   ├── constants/                  # Shared constants (enums, magic numbers, tokens)
    │   ├── decorators/                 # Custom decorators (@CurrentUser, @Public 등)
    │   ├── dtos/                       # Shared DTOs
    │   ├── events/                     # Domain/integration event payloads & listeners
    │   ├── exceptions/                 # Exception Filters, domain exception base
    │   ├── guards/                     # Route Guards (@UseGuards 대상)
    │   ├── interceptors/               # Global Interceptors (logging, transform, timeout)
    │   ├── interfaces/                 # Shared interfaces
    │   ├── middlewares/                # Global middlewares
    │   ├── pipes/                      # Validation Pipes
    │   └── utils/                      # Pure utility functions (no framework deps)
    ├── infrastructure/
    │   ├── cache/                      # Cache configuration
    │   ├── database/                   # Database configuration
    │   ├── email/                      # Email delivery infrastructure
    │   ├── external/                   # External service clients (3rd-party SDK, HTTP client wrappers)
    │   ├── i18n/                       # Internationalization
    │   ├── logger/                     # Logging
    │   ├── metrics/                    # Prometheus metrics
    │   └── transaction/                # Transaction management
    ├── libs/
    │   └── **                          # libs — 독립 라이브러리
    └── modules/
        └── <group>/                    # (선택) Group prefix — 실제 이름 가변 (예: user, admin). 단층 구조면 생략 가능
            └── <domain>/               # Domain module — 실제 이름 가변 (예: profile, order)
                ├── <domain>.module.ts  # NestJS module (DI assembly) — lint ignored via **/*.module.ts
                ├── common/             # (선택) 모듈 내부 공용 — 같은 모듈에서만 import
                ├── controller/         # Driving Adapter (HTTP)
                ├── dto/                # Input/output DTOs
                ├── exception/          # Domain-specific exceptions
                ├── model/              # Entity, Value Object, pure domain functions
                ├── port/               # All Port interfaces (inbound + outbound)
                ├── provider/           # Outbound Adapter (DB, external services)
                ├── service/            # Inbound-port implementation (business logic)
                └── strategy/           # Inbound Adapter (Passport 인증 전략 등) 또는 가변 알고리즘 (Strategy 패턴)
```

## 레이어별 경로 매핑

| 타입 | 경로 패턴 | 모드 | 설명 |
| --- | --- | --- | --- |
| `model` | `src/modules/**/model/**` | — | 도메인 모델 |
| `port` | `src/modules/**/port/**` | — | 도메인 Port 인터페이스 |
| `service` | `src/modules/**/service/**` | — | UseCase |
| `controller` | `src/modules/**/controller/**` | — | HTTP 컨트롤러 |
| `strategy` | `src/modules/**/strategy/**` | — | Inbound 어댑터 (Passport 등 인증 전략) 또는 가변 알고리즘 |
| `provider` | `src/modules/**/provider/**` | — | Port 구현체 |
| `exception` | `src/modules/**/exception/**` | — | 도메인 예외 |
| `dto` | `src/modules/**/dto/**` | — | 요청/응답 DTO |
| `module-common` | `src/modules/**/common/**` | — | 모듈 내부 공용 (같은 모듈에서만 import) |
| `common-pure` | `src/common/constants/**` | — | — |
| `common` | `src/common/authentication/**` / `src/common/guards/**` / `src/common/exceptions/**` / `src/common/interfaces/**` / `src/common/middlewares/**` / `src/common/pipes/**` / `src/common/interceptors/**` / `src/common/decorators/**` / `src/common/events/**` / `src/common/dtos/**` / `src/common/config/**` / `src/common/utils/**` | — | 전역 공용 (허용 하위 폴더만) |
| `infrastructure` | `src/infrastructure/database/**` / `src/infrastructure/i18n/**` / `src/infrastructure/logger/**` / `src/infrastructure/metrics/**` / `src/infrastructure/cache/**` / `src/infrastructure/email/**` / `src/infrastructure/transaction/**` / `src/infrastructure/external/**` | — | 인프라 수평 관심사 (허용 하위 폴더만) |
| `libs` | `src/libs/**` | — | 독립 라이브러리 |
