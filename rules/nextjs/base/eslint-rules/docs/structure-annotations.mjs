/**
 * 경로 트리 시각화용 주석 (doc-only, ESLint 미참조).
 * App Router 관례(layout/page/route group/nested dynamic) 등
 * boundary glob만으로 안 드러나는 하위 폴더 의도를 트리에 추가.
 *
 * 표기 컨벤션:
 *   `<name>`            doc placeholder — 실제 폴더는 구체 이름 (예: `<feature>` → `users`, `products`)
 *   `[name]`/`[...name]` Next.js 동적 세그먼트 — 브래킷이 진짜 폴더명의 일부 (안의 이름만 가변)
 *   `(name)`            Next.js route group — 괄호가 진짜 폴더명의 일부 (URL 미포함)
 */
export const baseStructureAnnotations = {
  "src/app": {
    override: [
      {
        name: "[locale]",
        note: "Locale 동적 세그먼트 (Next.js literal — 폴더명이 그대로 `[locale]`)",
        children: [
          { name: "layout.tsx", note: "Root layout (Server Component)" },
          { name: "page.tsx", note: "Home page (Server Component)" },
          { name: "loading.tsx", note: "Suspense fallback UI (선택)" },
          { name: "error.tsx", note: "Error boundary ('use client' 필수)" },
          { name: "not-found.tsx", note: "404 페이지 (선택)" },
          {
            name: "_components",
            note: "Page-colocated Client Components ('use client')",
          },
          {
            name: "_providers",
            note: "Page-colocated Providers ('use client')",
          },
          { name: "dictionaries.ts", note: "i18n dictionary loader" },
          {
            name: "(group)",
            note: "Next.js route group — 괄호가 진짜 폴더명. URL 미포함. 실제: `(protected)`, `(auth)` 등",
          },
          {
            name: "<feature>",
            placeholder: true,
            note: "feature module — 실제 이름 가변 (예: `users/`, `products/`, `dashboard/`)",
            children: [
              { name: "page.tsx" },
              {
                name: "_components",
                note: "이 레벨에도 가능 (glob `**` 매칭)",
              },
              {
                name: "[id]",
                note: "Next.js 동적 세그먼트 — 브래킷이 진짜 폴더명. 안의 이름은 가변 (`[id]`, `[slug]`, `[orderId]` 등)",
                children: [{ name: "page.tsx" }],
              },
            ],
          },
        ],
      },
      {
        name: "api",
        note: "Route Handlers — `/api/*` 관례 위치",
        children: [
          {
            name: "<resource>",
            placeholder: true,
            note: "API resource — 실제 이름 가변 (예: `users/`, `auth/`, `projects/`)",
            children: [
              {
                name: "route.ts",
                note: "HTTP 핸들러 (GET/POST/PUT/DELETE export)",
              },
              {
                name: "[id]",
                note: "Next.js 동적 세그먼트 — 폴더명이 그대로 `[id]` 또는 `[slug]` 등",
                children: [{ name: "route.ts" }],
              },
              {
                name: "[...slug]",
                note: "Next.js catch-all 세그먼트 — 폴더명이 그대로 `[...slug]` (예: `auth/[...nextauth]`)",
                children: [{ name: "route.ts" }],
              },
            ],
          },
        ],
      },
    ],
  },
  "src/domain": {
    override: [
      {
        name: "<feature>",
        placeholder: true,
        note: "feature module — 실제 이름 가변 (예: `users/`, `products/`, `dashboard/`)",
        children: [
          { name: "model.ts" },
          { name: "errors.ts" },
          { name: "port.ts" },
          { name: "service.ts" },
        ],
      },
    ],
  },
  "src/http": {
    override: [
      {
        name: "<feature>",
        placeholder: true,
        note: "feature module — 실제 이름 가변 (예: `users/`, `products/`, `dashboard/`)",
        children: [
          { name: "mapper.ts" },
          { name: "repository.ts" },
          { name: "factory.ts" },
          { name: "hook.ts" },
        ],
      },
    ],
  },
  "src/styles": {
    override: [
      {
        name: "globals.css",
        note: "전역 스타일 (layout.tsx에서 side-effect import)",
      },
      {
        name: "tokens.css",
        note: "CSS custom property 토큰 (palette/typography/spacing)",
      },
      { name: "typography.css", note: "타이포그래피 정의 (선택)" },
      {
        name: "tokens.ts",
        note: "TS 디자인 토큰 (타입 안전 참조; 선택)",
      },
    ],
  },
  "src/i18n": {
    override: [
      {
        name: "routing.ts",
        note: "next-intl `defineRouting` — locales/defaultLocale/localePrefix",
      },
      {
        name: "request.ts",
        note: "next-intl `getRequestConfig` — 서버 메시지 로더",
      },
      {
        name: "navigation.ts",
        note: "next-intl `createNavigation(routing)` — Link/redirect/useRouter",
      },
      {
        name: "dictionaries",
        note: "로케일별 i18n 사전 (`<locale>.json` 또는 `<locale>.ts`)",
        children: [
          {
            name: "<locale>.json",
            placeholder: true,
            note: "예: `en.json`, `ko.json`",
          },
        ],
      },
    ],
  },
};
