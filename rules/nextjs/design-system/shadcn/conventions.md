## shadcn/ui

All UI components **MUST** use shadcn/ui (Tailwind CSS **v4 or higher** + Base UI primitives).

- Minimum versions: `"tailwindcss": "^4.0.0"`, `"@base-ui/react": "^1.0.0"`, `"class-variance-authority": "^0.7.0"`, `"clsx": "^2.0.0"`, `"tailwind-merge": "^3.0.0"`
- React **19 or higher** is required (Next.js 16 baseline)
- shadcn/ui is **not an npm package** — components are scaffolded into `src/components/ui/` via the CLI and owned by the project
- **UI components** (buttons, inputs, text, layout, feedback, etc.) **MUST use shadcn/ui** — semantic HTML (`<form>`, `<section>`, `<nav>`, etc.) is allowed as-is
- Add components via `npx shadcn@latest add <component>` (e.g., `npx shadcn@latest add button dialog`) — do not hand-roll primitives that shadcn already ships
- Style preset: `base-nova` (Tailwind v4 기본). 구버전 `default` style은 deprecated.
- Primitive layer: `@base-ui/react` (Radix UI팀이 만든 후속 라이브러리). 구 `@radix-ui/*` 패키지는 사용하지 않는다.
- Theme customization: edit CSS variables (OKLCH tokens: `--background`, `--foreground`, `--primary`, etc.) in `src/app/globals.css`; tweak component variants directly in `src/components/ui/*`
- Class composition: always use the `cn()` helper (`clsx` + `tailwind-merge`) from `@/lib/utils/cn` instead of bare template strings to keep Tailwind class precedence correct
- Icons: `lucide-react`
- Animation utilities: `tw-animate-css` (Tailwind v4용 `tailwindcss-animate` 후속)
- Docs: https://ui.shadcn.com/

### Initial Setup

```bash
# 1. 프로젝트 초기화 — components.json, src/lib/utils/cn.ts, globals.css 토큰 생성
npx shadcn@latest init --defaults

# 2. 전체 컴포넌트 일괄 설치 — 이후 CLI 재호출 불필요
npx shadcn@latest add --all -y -o
```

`init`은 `components.json` (alias + style config), `src/lib/utils/cn.ts` (`cn()` helper), `globals.css`의 CSS variable 토큰을 생성한다. Tailwind v4은 별도 config 파일 없이 `@import "tailwindcss"` 한 줄로 동작한다.

`add --all -y -o`은 현재 `style: base-nova` 레지스트리의 **모든 컴포넌트**를 `src/components/ui/`로 한 번에 스캐폴딩한다. 컴포넌트는 프로젝트 소유 코드라 이후 자유롭게 수정·확장 가능하며, 신규 레지스트리가 추가되지 않는 한 CLI를 다시 부를 일이 없다.

> **SonarJS 비활성화**: `src/components/ui/**` 경로의 모든 `sonarjs/*` 룰은 자동으로 off 된다 (`shadcnDisableSonarjsForUi`). shadcn CLI가 생성·동기화하는 외부 컴포넌트는 SonarJS 코드 스멜 규칙(인지 복잡도·중첩 분기·큰 함수 등)을 자주 위반하므로 사용자 코드가 아닌 해당 경로에서만 일괄 비활성화한다. 프로젝트가 작성한 `src/components/<own>/**`에는 영향 없음.
>
> **`react-hooks/set-state-in-effect` 비활성화**: 같은 이유로 shadcn CLI 소유 경로(`src/components/ui/**`, `src/hooks/use-mobile.ts`)에서만 off 된다 (`shadcnAllowSetStateInEffect`). 프로젝트 `eslint.project.config.mjs`에서 따로 끌 필요 없음.