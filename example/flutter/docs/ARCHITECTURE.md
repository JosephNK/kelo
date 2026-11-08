# Architecture

> 이 문서: 헥사고날 **원리 · Data Flow · Dependency Direction** 개념 해설.

Hexagonal Architecture (Ports and Adapters). 핵심 원칙: **비즈니스 로직은 외부 인프라를 모른다.**

## Layer Diagram

```
[Presentation]  pages/, views/, widgets/
        | depends on
        v
[UseCase]       usecases/
        | depends on
        v
[Port]          ports/                    <-- abstract interface
        ^ implements
        |
[Adapter]       adapters/                 -- concrete implementation
```

**Dependency direction**: Presentation -> UseCase -> Port <- Adapter. Adapters depend on Ports (implement them), not the other way around. This inversion keeps the domain layer free from infrastructure concerns.

## Data Flow

### Request (call direction)

```
Presentation        User interaction (button tap, pull-to-refresh, etc.)
    |
UseCase             Business logic (pure Dart, depends only on Ports)
    |
Port                Calls Adapter through interface
    |
Adapter Impl        Calls data source (API, local DB, platform SDK, etc.)
    |
Data Source          Remote API / Local DB / Platform Service
```

### Response (return direction)

```
Data Source          Raw response (JSON, DB row, SDK result, etc.)
    |
Raw Data Model      DTO (API) / DB Model (local) / SDK Result
    |
Adapter Impl        Raw data → Entity conversion via _toEntity()
    |
Entity              Immutable value object (domain model)
    |
UseCase             Applies business logic, returns Entity
    |
Presentation        Renders UI based on state
```

## Dependency Direction

```
Presentation -> UseCase -> Port (interface) <- Adapter Impl -> Data Source (API / DB / SDK)
                             |
                           Entity  <-  <-  <-  <-  <-  <-  <-
                          (all layers depend on this)
```

