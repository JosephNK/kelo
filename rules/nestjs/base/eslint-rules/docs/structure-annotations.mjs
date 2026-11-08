/**
 * 경로 트리 시각화용 주석 (doc-only, ESLint 미참조).
 * baseBoundaryElements의 glob만으로 안 드러나는 하위 폴더 의도를 트리에 추가.
 */
export const baseStructureAnnotations = {
  "src/modules": {
    override: [
      {
        name: "<group>",
        placeholder: true,
        note: "(선택) Group prefix — 실제 이름 가변 (예: user, admin). 단층 구조면 생략 가능",
        children: [
          {
            name: "<domain>",
            placeholder: true,
            note: "Domain module — 실제 이름 가변 (예: profile, order)",
            children: [
              {
                name: "model",
                note: "Entity, Value Object, pure domain functions",
              },
              {
                name: "port",
                note: "All Port interfaces (inbound + outbound)",
              },
              {
                name: "service",
                note: "Inbound-port implementation (business logic)",
              },
              { name: "controller", note: "Driving Adapter (HTTP)" },
              {
                name: "strategy",
                note: "Inbound Adapter (Passport 인증 전략 등) 또는 가변 알고리즘 (Strategy 패턴)",
              },
              {
                name: "provider",
                note: "Outbound Adapter (DB, external services)",
              },
              { name: "dto", note: "Input/output DTOs" },
              { name: "exception", note: "Domain-specific exceptions" },
              {
                name: "common",
                note: "(선택) 모듈 내부 공용 — 같은 모듈에서만 import",
              },
              {
                name: "<domain>.module.ts",
                placeholder: true,
                note: "NestJS module (DI assembly) — lint ignored via **/*.module.ts",
              },
            ],
          },
        ],
      },
    ],
  },
  "src/common": {
    override: [
      {
        name: "authentication",
        note: "Auth-related (Passport strategies, auth utils)",
      },
      { name: "guards", note: "Route Guards (@UseGuards 대상)" },
      { name: "exceptions", note: "Exception Filters, domain exception base" },
      { name: "interfaces", note: "Shared interfaces" },
      { name: "middlewares", note: "Global middlewares" },
      { name: "pipes", note: "Validation Pipes" },
      {
        name: "interceptors",
        note: "Global Interceptors (logging, transform, timeout)",
      },
      {
        name: "decorators",
        note: "Custom decorators (@CurrentUser, @Public 등)",
      },
      { name: "events", note: "Domain/integration event payloads & listeners" },
      { name: "dtos", note: "Shared DTOs" },
      {
        name: "config",
        note: "App-level configuration (env, ConfigModule schemas)",
      },
      {
        name: "constants",
        note: "Shared constants (enums, magic numbers, tokens)",
      },
      { name: "utils", note: "Pure utility functions (no framework deps)" },
    ],
  },
  "src/infrastructure": {
    override: [
      { name: "database", note: "Database configuration" },
      { name: "i18n", note: "Internationalization" },
      { name: "logger", note: "Logging" },
      { name: "metrics", note: "Prometheus metrics" },
      { name: "cache", note: "Cache configuration" },
      { name: "email", note: "Email delivery infrastructure" },
      { name: "transaction", note: "Transaction management" },
      {
        name: "external",
        note: "External service clients (3rd-party SDK, HTTP client wrappers)",
      },
    ],
  },
};
