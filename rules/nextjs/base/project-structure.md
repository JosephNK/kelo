# Project Structure

```
src/
├── app/
│   └── [locale]/                 # Locale-based routing
│       ├── layout.tsx            # Root layout (Server Component)
│       ├── page.tsx              # Page (Server Component: data fetching)
│       ├── _components/          # Page-colocated Client Components ('use client')
│       ├── _providers/           # Page-colocated Providers ('use client')
│       └── [feature]/
│           ├── page.tsx
│           └── _components/      # Feature-specific Client Components
│
├── components/                   # Shared UI components
│   └── ui/                       # Icons, common primitives
│
├── common/                       # Shared cross-cutting concerns
│   ├── dictionaries/             # i18n message files
│   └── types/
│
├── lib/
│   ├── domain/                   # Pure TypeScript (no React/Next.js imports)
│   │   ├── models/               # Domain models (Entity, Value Object)
│   │   ├── errors/               # Domain error classes
│   │   ├── ports/                # Port interfaces (Repository contracts)
│   │   └── services/             # Business logic (Use Cases), depends only on Ports
│   │
│   ├── api/                      # Adapter layer
│   │   ├── client.ts             # HTTP client configuration
│   │   ├── endpoints.ts          # API endpoint constants
│   │   ├── types.ts              # DTO types (never use directly in components)
│   │   ├── mappers/              # DTO <> Domain Model conversion
│   │   ├── repositories/         # Port implementations (data access only)
│   │   └── hooks/                # TanStack Query hooks
│   │
```

## Top-level directories (excluded from architecture boundaries)

The following project-root directories are reserved for tooling and tests. They are pre-registered in `baseBoundaryIgnores` (see `eslint.rules.mjs`) so `local/no-unknown-files` does not flag them.

```
scripts/          # Build, deploy, codegen, and maintenance utilities
e2e/              # Playwright E2E tests
```

If a project needs boundary enforcement inside these folders, override `baseBoundaryIgnores` in the project-level `eslint.config.mjs` rather than placing source code there.
