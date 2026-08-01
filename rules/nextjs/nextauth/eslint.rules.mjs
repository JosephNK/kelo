// =============================================================================
// JKit Next.js — NextAuth 스택 규칙
//
// `next-auth`를 `src/auth.ts` 단일 진입점으로 격리.
// =============================================================================

/** 도메인 레이어에서 next-auth 차단 — 인증은 어댑터 관심사. */
export const nextauthDomainBannedPackages = ["next-auth", "next-auth/**"];

/**
 * `src/auth.ts` 단일 파일만 `auth` element로 등록 — `mode: 'full'` 정확 매칭.
 */
export const nextauthBoundaryElements = [
  { type: "auth", mode: "full", pattern: ["src/auth.ts"] },
];

/** `auth` 레이어 글로서리 — LLM이 `src/auth.ts` 작성 시 형태/금지사항 판단 근거. */
export const nextauthLayerSemantics = {
  auth: {
    role: "NextAuth 설정 단일 파일 (`src/auth.ts`). `handlers`/`auth`/`signIn`/`signOut`을 export하며, 프로젝트 내에서 이 파일만 `next-auth`를 import 할 수 있다.",
    contains: [
      "NextAuth 설정 (providers·callbacks·session·adapter 등) — `src/auth.ts` (단일 파일)",
    ],
    forbids: [
      "`next-auth` import를 auth 파일 밖으로 누출 (다른 레이어에서 직접 import 금지)",
      "domain/UI 레이어 직접 import (세션 조회는 route-handler·page 경유)",
      "런타임 비즈니스 로직 (설정 구성·세션 조회 이외)",
    ],
    scope:
      "외부에서 세션이 필요하면 `route-handler` 또는 `page` 레이어에서 `auth()` 호출 (nextauthBoundaryAllowPatches 참조).",
    example: [
      "// src/auth.ts",
      "import NextAuth from 'next-auth';",
      "import Google from 'next-auth/providers/google';",
      "",
      "export const { handlers, auth, signIn, signOut } = NextAuth({",
      "  providers: [Google],",
      "  callbacks: {",
      "    session: ({ session, token }) => ({ ...session, userId: token.sub }),",
      "  },",
      "});",
    ].join("\n"),
  },
};

/** auth.ts → db만 허용 (DB 어댑터 초기화·콜백 내 조회 등). */
export const nextauthBoundaryRules = [
  { from: { type: "auth" }, allow: [{ to: { type: "db" } }] },
];

/**
 * 기존 레이어 → auth 허용 패치: page·route-handler에서 `auth()` 세션 조회.
 * route-handler 허용은 `[...nextauth]/route.ts`의 `handlers` re-export도 커버한다.
 */
export const nextauthBoundaryAllowPatches = [
  { from: "page", allow: { to: { type: "auth" } } },
  { from: "route-handler", allow: { to: { type: "auth" } } },
];
