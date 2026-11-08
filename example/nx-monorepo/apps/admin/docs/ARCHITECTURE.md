# Architecture

> 이 문서: 헥사고날 **원리 · Data Flow · Dependency Direction** 개념 해설.

Hexagonal Architecture (Ports and Adapters) + Next.js App Router colocated components.
Domain logic is pure TypeScript with no framework dependencies.
Pages are Server Components (data loading, i18n). Client Components are colocated in `_components/` directories.

레이어는 **feature-first**로 묶는다 — 같은 비즈니스 컨텍스트(예: `user`, `order`, `product`)에 속한 model/port/service/mapper/repository/hook이 같은 폴더 아래 모인다. 한 feature의 변경이 한 폴더에서 끝나도록.

## Layer Diagram

```
[page]             app/[locale]/          Server Component (data fetching, i18n)
    |
[_components]      _components/           Client Component ('use client', event handling)
    |
[hook]             http/<feature>/hook.ts        TanStack Query (useQuery/useMutation)
    |
[service]          domain/<feature>/service.ts   Business logic (pure TS, depends only on Ports)
    |
[port]             domain/<feature>/port.ts      Interface (Repository contracts)
    |
[repository]       http/<feature>/repository.ts  Port implementation (HTTP calls via client)
    |
Backend API
```

## Data Flow

### Request (call direction)

```
_components/*       Event triggered (button click, etc.)
    |
Hook                TanStack Query (useQuery/useMutation)
    |
Service             Composes business logic (pure TS, depends only on Ports)
    |
Port                Calls Repository through interface
    |
Repository Impl     Calls API via client
    |
Backend API
```

### Response (return direction)

```
Backend API
    |  HTTP Response (JSON)
HTTP DTO            Raw backend response shape (http/_generated/types.ts, generator 산출물)
    |
Repository Impl     Applies Mapper internally
    |  Mapper       DTO to Domain conversion
    |
Domain Model        Pure TS entity (readonly immutable object)
    |
Service             Applies business logic, returns Domain Model
    |
Hook                Stores in cache + updates state
    |
_components/*       Handles loading/error branching (Client Component)
    |
Page                Passes data to layout (Server Component)
    |
RENDERED UI
```

### Dependency Direction

```
Page (SC) -> _components/ (CC) -> Hook -> Service -> Port (interface) <- Repository Impl -> Client + Mapper
                  |                                                       |
             Domain Model  <-  <-  <-  <-  <-  <-  <-  <-  <-  <-  <-  <-
                         (all layers depend on this)
```

## Layer Details

> 이 문서는 개념/흐름에 집중하고, 실제 레이어별 세부(경로 패턴·import 매트릭스)는 lint 룰의 단일 소스(`baseBoundaryElements`, `baseBoundaryRules`, `baseLayerSemantics`)에서 관리한다.
