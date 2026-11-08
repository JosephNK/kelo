# Conventions

## General Rules

- Path alias: `@/*` → `src/`
- Functional components + TypeScript

## Layer Rules

- When switching REST → GraphQL, only Repository implementations need to change
- For simple CRUD, Service may pass through to Port directly (avoid unnecessary wrapping)
- **API DTO must come from Swagger/OpenAPI codegen** — do not hand-write DTO types

## Component Reuse

- **UI patterns repeated 2+ times MUST be extracted into a shared component** (`src/components/ui/`)
- If the same JSX + props combination appears in 2 or more places, extract immediately
- Replace all existing usages with the shared component

## Code Duplication

- **Code duplication MUST stay below 5%** (enforced by `jscpd` with `.jscpd.json` threshold)
- Run `npm run lint:cpd` to check duplication rate
- **Shared infrastructure MUST be extracted into a named file and imported, not re-implemented** — when two sites need the same helper (error wrapper, DTO serializer, guard, etc.), extract it to a single module under the appropriate layer (`http-mapper`, `http-repository`, or a project-level type) rather than copy-pasting.

## Page + Colocated Components Pattern

Page는 dictionary 로딩과 서버 데이터 fetch를 맡고, `_components/`의 Client Component에 props로 전달. Hook 사용은 Client Component에서만. `'use client'` 경계는 leaf-level까지 미룬다.

```tsx
// Page (SC): src/app/[locale]/products/page.tsx
export default async function ProductsPage({ params }: PageProps<'/[locale]/products'>) {
  const { locale } = await params;
  const dict = await getDictionary(locale);

  return <ProductsContent dict={dict.Products} />;
}

// Client Component: src/app/[locale]/products/_components/ProductsContent.tsx
('use client');

export function ProductsContent({ dict }: { dict: Dictionary['Products'] }) {
  const { data, isLoading, error, refetch } = useProducts();

  if (isLoading) return <LoadingSkeleton />;
  if (error) return <ErrorFallback message={error.message} onRetry={refetch} />;

  return (
    <Stack gap="md">
      <Title order={2}>{dict.title}</Title>
      <Stack gap="xs">
        {data.map((p) => (
          <Text key={p.id}>{p.name}</Text>
        ))}
      </Stack>
    </Stack>
  );
}
```

## Server Component / Client Component Boundary

- Push `'use client'` boundary as deep (leaf-level) as possible
- `src/domain/`, `src/http/_generated/types.ts`, `src/http/<feature>/mapper.ts` can be used in both server and client (pure TS)

## Error Handling Strategy

### Service Layer

- Throws domain errors on business rule violations (e.g., `InsufficientStockError`)
- Domain errors are pure TS classes defined per feature in `src/domain/<feature>/errors.ts`

### Repository Layer

- Converts HTTP/database errors to domain errors (e.g., 404 → `NotFoundError`, duplicate key → `DuplicateError`)
- Propagates network errors upward for retry mechanism

### API Route Layer (Route Handler)

- Catch domain errors and return appropriate HTTP status codes
- Map domain error instances to `{ code, message, statusCode }` response shape
- Unknown errors produce a generic 500 response without exposing internal details

### Client Component Layer (`_components/`)

- Branches on `isLoading`, `error` state returned from Hooks

### Page Layer

- `error.tsx` (Next.js Error Boundary) catches unexpected errors

## Internationalization (next-intl)

- `en.json` is the source of truth for dictionary keys — `ko.json` must match its structure (located in `src/lib/dictionaries/`)
- Dictionary keys are organized by feature/page (e.g., `Products`, `Navigation`)
- Client Components receive translated strings as props (no dictionary access inside `_components/`)
- Type safety: `Dictionary` type is derived from `en.json` via `typeof import`

```tsx
// Page (SC) loads dictionary, passes translated strings to Client Component
const dict = await getDictionary(locale);
return <ProductsContent dict={dict.Products} />;
```

## Tanstack

Use TanStack Query for all server state management.

### Retry — Single Source (ky transport layer)

- Retry is owned by the ky client (`createApiClient` `DEFAULT_RETRY`), not by TanStack Query.
- ky covers every call site (SSR, route handlers, browser); TanStack Query only wraps client-side hooks, so keeping retry in ky avoids losing it on the server.
- Disable RQ retry to prevent request multiplication — RQ default (3) × ky (2 on GET) compounds into many requests per call:

```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false }, // ky owns retry
    mutations: { retry: false },
  },
});
```

- To tune retry, change `createApiClient({ retry })` — not the QueryClient.

### Error Handling — Hook Layer (TanStack Query)

- `useQuery` with `throwOnError: false` (default) — Hook returns `error` object
- Global error handling via `QueryClient`'s `onError` callback (toast, logging)
- Mutation failures provide user feedback via `onError` callback

## Next Proxy

Use `proxy.ts` instead of `middleware.ts` (Next.js 16+).

### Next.js 16 Breaking Changes

- `middleware.ts` → `proxy.ts` (src/ or root), export `middleware()` → `proxy()`
- Proxy runtime is nodejs (edge not supported)
- Config flag: `skipMiddlewareUrlNormalize` → `skipProxyUrlNormalize`
- Codemod: `npx @next/codemod@latest middleware-to-proxy .`


---

## Project-specific

@CONVENTIONS.PROJECT.md

See [CONVENTIONS.PROJECT.md](./CONVENTIONS.PROJECT.md) for project-specific required reading.
