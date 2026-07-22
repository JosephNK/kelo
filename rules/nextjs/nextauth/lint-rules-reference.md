<!-- GENERATED DOCUMENT - DO NOT MODIFY BY HAND -->
<!-- Generator: scripts/typescript/gen-eslint-reference.mjs -->
<!-- Source: rules/nextjs/nextauth/eslint.rules.mjs -->

# Lint Rules Reference (nextjs/nextauth)

## 레이어 글로서리 (Layer Glossary)

`auth` 레이어 글로서리 — LLM이 `src/auth.ts` 작성 시 형태/금지사항 판단 근거.

### `auth`

**Role** — NextAuth 설정 단일 파일 (`src/auth.ts`). `handlers`/`auth`/`signIn`/`signOut`을 export하며, 프로젝트 내에서 이 파일만 `next-auth`를 import 할 수 있다.

**Contains**

- NextAuth 설정 (providers·callbacks·session·adapter 등) — `src/auth.ts` (단일 파일)

**Forbids**

- `next-auth` import를 auth 파일 밖으로 누출 (다른 레이어에서 직접 import 금지)
- domain/UI 레이어 직접 import (세션 조회는 api-helper 경유)
- 런타임 비즈니스 로직 (설정 구성·세션 조회 이외)

**Scope** — 외부에서 세션이 필요하면 `api-helper` 또는 `page` 레이어에서 `auth()` 호출 (nextauthBoundaryAllowPatches 참조).

```ts
// src/auth.ts
import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  callbacks: {
    session: ({ session, token }) => ({ ...session, userId: token.sub }),
  },
});
```

## 의존성 규칙 (Dependency Rules)

auth.ts → api-helper만 허용 (DB 어댑터 초기화·콜백 내 조회 등).

시각화된 의존성 그래프는 `lint-rules-diagram.md` 참조.

### Allow 매트릭스

| From | Allow → To |
| --- | --- |
| `auth` | `api-helper` |

## Boundary Allow Patches (base 규칙 추가 허용)

기존 레이어 → auth 허용 패치: api-helper·page에서 `auth()` 세션 조회.
route-handler는 `[...nextauth]/route.ts`에서 `handlers` re-export를 위해 auth 허용.

| From | 추가 허용 (To) |
| --- | --- |
| `api-helper` | `auth` |
| `page` | `auth` |
| `route-handler` | `auth` |

## Domain Purity (도메인 순수성)

도메인 레이어에서 next-auth 차단 — 인증은 어댑터 관심사.

### 도메인 레이어 금지 패키지

- `next-auth` (+ 서브경로)
