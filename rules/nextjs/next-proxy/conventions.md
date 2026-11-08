## Next Proxy

- Use `src/proxy.ts` exporting `proxy()` instead of `middleware.ts` / `middleware()` (Node.js runtime only). Migrate with `npx @next/codemod@latest middleware-to-proxy .`
- Config flag `skipMiddlewareUrlNormalize` → `skipProxyUrlNormalize`.
