## TanStack Query

- Use TanStack Query for all server state (hooks in `src/http/<feature>/hook.ts`).
- Retry is owned by the ky client (`createApiClient({ retry })`) — disable it in QueryClient so requests don't multiply:

  ```ts
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  ```

- Errors: hooks return `error` (`throwOnError: false`); global toast/logging via the QueryClient `onError`; mutations report failures in their `onError`.
