# Conventions

## Layers

- API DTO types come only from OpenAPI codegen (`src/http/_generated/`) — never hand-write DTOs.
- For simple CRUD, a domain Service may pass straight through to the Port — no wrapper for its own sake.
- UI repeated in 2+ places → extract a shared component (`src/components/`) and replace every usage.
- Keep code duplication under 5% (`jscpd`; `npm run lint:cpd` when configured).

## Page + Client Components

- Page (Server Component) loads the dictionary and server data (service from `src/http/<feature>/factory.ts`), then passes them as props to Client Components in `_components/`.
- Hooks run only in Client Components; push `'use client'` down to the leaf.
- `src/domain/`, `src/http/_generated/types.ts`, `src/http/<feature>/mapper.ts` are pure TS — usable on both server and client.

## Error Handling

- Service: throws domain errors (`src/domain/<feature>/errors.ts`) on business rule violations.
- Repository: converts HTTP/DB errors to domain errors (404 → `NotFoundError`, duplicate key → `DuplicateError`); lets network errors propagate for retry.
- Route Handler: maps domain errors to `{ code, message, statusCode }`; unknown errors → generic 500 without internal details.
- Client Component: branches on the hook's `isLoading` / `error`.
- Page: unexpected errors fall through to `error.tsx`.

## i18n (next-intl)

- `src/i18n/dictionaries/en.json` is the source of truth for keys; other locales mirror its structure.
- Keys are grouped by feature/page (`Products`, `Navigation`); the `Dictionary` type derives from `en.json`.
- Client Components receive translated strings as props — no dictionary access inside `_components/`.

## TanStack Query

- Use TanStack Query for all server state (hooks in `src/http/<feature>/hook.ts`).
- Retry is owned by the ky client (`createApiClient({ retry })`) — disable it in QueryClient so requests don't multiply:

  ```ts
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  ```

- Errors: hooks return `error` (`throwOnError: false`); global toast/logging via the QueryClient `onError`; mutations report failures in their `onError`.

## Next Proxy

- Use `src/proxy.ts` exporting `proxy()` instead of `middleware.ts` / `middleware()` (Node.js runtime only). Migrate with `npx @next/codemod@latest middleware-to-proxy .`
- Config flag `skipMiddlewareUrlNormalize` → `skipProxyUrlNormalize`.


---

## Project-specific

@CONVENTIONS.PROJECT.md

See [CONVENTIONS.PROJECT.md](./CONVENTIONS.PROJECT.md) for project-specific required reading.
