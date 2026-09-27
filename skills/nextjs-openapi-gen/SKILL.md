---
name: nextjs-openapi-gen
description: Generates TypeScript DTO types, endpoint helpers, and tag-grouped API service classes from an OpenAPI 3.x spec into src/http/_generated/. Also generates src/http/_generated/client.ts (config-injection factory) and src/http/_generated/index.ts (barrel — import surface @/http/_generated), overwritten every run. Use for requests like "Generate API types", "Create types from spec", "Set up API from swagger".
argument-hint: "<spec> [--dry-run] [--out-dir <dir>] | --config <file>"
---

<!--
OpenAPI 3.x specification files for code generation.
/kelo:nextjs-openapi-gen specs/openapi.yaml
-->

# Next.js OpenAPI Code Generator Skill

모든 산출물을 `src/http/_generated/` 한 폴더에 생성한다:

- `src/http/_generated/types.ts` — DTO interfaces (`components/schemas`)
- `src/http/_generated/endpoints.ts` — URL helpers (operation별 path 템플릿)
- `src/http/_generated/services/<tag-kebab>.ts` — tag별 API 서비스 클래스 (operation 1개 = 메서드 1개, `KyInstance` 주입, 반환은 raw DTO)
- `src/http/_generated/client.ts` — config 주입 팩토리
- `src/http/_generated/index.ts` — 공개 배럴 (import 표면 = `@/http/_generated`)

`client.ts`·`index.ts`도 다른 generated 산출물과 동일하게 **`_generated/` 안에 있고 매 실행 덮어쓴다.** client.ts는 `createApiClient(config)` 팩토리만 담고 인증·hooks·prefix 같은 비즈니스 로직은 갖지 않는다 — 그건 앱이 호출부에서 `createApiClient({ hooks, apiUrl, ... })`로 주입하므로 client.ts는 결정적이고 재생성해도 안전하다. index.ts는 client 헬퍼·endpoints·types·모든 service를 re-export하며, 소비 측은 `@/http/_generated`로 한 번에 import한다.

**Generated files are fully overwritten on every run.** Stale service files for renamed tags are also removed on each run. Feature-first 디렉토리 `src/http/<feature>/{mapper,repository,hook}.ts`만 user-authored — generator는 절대 손대지 않는다 (변환 규칙·Port 설계·캐시 정책 등 spec에서 도출 불가한 비즈니스 결정 영역). 따라서 인증/hooks/prefix는 client.ts가 아니라 이 feature 코드(또는 앱 부트스트랩)에서 `createApiClient`로 주입한다.

## Arguments

- `spec` (required): OpenAPI spec file path or URL
- `--dry-run` (optional): Preview only — no files written
- `--out-dir <dir>` (optional): 출력 프로젝트 루트(=`src/http`의 부모)를 명시 지정. cwd 기준 해석. 기본값은 cwd 위쪽 가장 가까운 `package.json` 위치. 모노레포에서 특정 패키지로 보낼 때 사용 — 예: `--out-dir packages/http` → `packages/http/src/http/_generated/...` + `packages/http/specs/`
- `--config <file>` (optional): 여러 `spec → outDir` 타깃을 매니페스트 한 파일로 일괄 생성. `spec`/`--out-dir`와 동시 사용 불가 (각 타깃 안에서 지정). 모노레포에서 앱·패키지별 클라이언트를 한 번에 생성할 때 사용. 아래 **Config Manifest (멀티 타깃)** 참조.
- **무인자 자동 감지**: `spec`도 `--config`도 없이 실행하면 cwd의 `kelo.openapi.json`이 있을 때 자동으로 그 매니페스트를 사용한다 (없으면 usage 출력 후 종료).

## Config Manifest (멀티 타깃)

모노레포 루트에 `kelo.openapi.json`을 두면 여러 타깃을 한 번에 생성한다. 파일명이 `kelo.openapi.json`이면 **무인자 실행으로 자동 감지**되고, 다른 이름/경로는 `--config <file>`로 지정한다. **이 파일은 `kelo.workspaces.json`과 별개이며, `workspaces-sync`/`workspaces-init`은 이 파일을 읽지 않는다.** 오직 본 스킬이 소비한다.

```json
{
  "targets": [
    { "spec": "https://api.example.com/api-docs-json", "outDir": "apps/web" },
    { "spec": "specs/admin.yaml",                        "outDir": "packages/http" }
  ]
}
```

- `spec` (필수): OpenAPI spec 파일 경로 또는 URL. cwd(모노레포 루트) 기준 해석.
- `outDir` (필수): 출력 프로젝트 루트. cwd 기준 해석 → `<outDir>/src/http/_generated/...` + `<outDir>/specs/`. 각 타깃이 자체 `package.json`을 가진 디렉토리여야 컴파일·boundary 검사를 통과한다.
- 최상위는 `{ "targets": [...] }` 또는 배열 자체(`[...]`) 둘 다 허용.
- `--dry-run`은 매니페스트 전체 타깃에 적용된다.

## Workflow

1. **Parse arguments**: `$ARGUMENTS`에서 spec/URL·`--dry-run`·`--out-dir`·`--config`를 추출한다. `--config`가 있으면 멀티 타깃 모드 (단일 `spec` 인자 없음).
2. **Check/install npm dependencies** (plugin script requires `yaml`):
   ```bash
   (cd ${CLAUDE_PLUGIN_ROOT} && [ -d node_modules/yaml ] || npm install)
   ```
   `${CLAUDE_PLUGIN_ROOT}`가 fresh checkout이면 `node_modules`가 없어 후속 node 실행이 실패한다 — 누락 시 자동 설치한다.
3. **Generate API code** (반드시 프로젝트 루트에서 실행, `cd ${CLAUDE_PLUGIN_ROOT}` 금지):
   ```bash
   # 단일 타깃
   node ${CLAUDE_PLUGIN_ROOT}/scripts/nextjs/openapi/generate-api.mjs {spec} [--dry-run] [--out-dir <dir>]
   # 멀티 타깃 (매니페스트)
   node ${CLAUDE_PLUGIN_ROOT}/scripts/nextjs/openapi/generate-api.mjs --config {config} [--dry-run]
   ```
   - 스크립트는 `process.cwd()`를 프로젝트 루트로 사용하므로 cwd를 plugin 디렉토리로 옮기면 출력 파일이 plugin cache에 만들어진다.
   - 모노레포에서 특정 패키지로 출력하려면 `--out-dir <pkg-dir>`를 넘긴다 (cwd 기준 해석). 예: 모노레포 루트에서 `--out-dir packages/http` → `packages/http/src/http/_generated/...`. 각 패키지가 자체 `package.json`을 가져 import 가능한 구조에 적합하다.
   - `--config`는 매니페스트의 각 타깃을 cwd 기준으로 순차 생성한다 (`spec`/`outDir`는 타깃별). **Config Manifest** 섹션 참조.
   - URL spec은 해당 타깃의 `<outDir>/specs/openapi.{yaml,json}`(단일 모드는 `specs/`)에 저장된다 (VCS 추적용).
   - 출력(모두 `src/http/_generated/` 안, **매 실행 덮어쓰기**): `_generated/{types,endpoints,client,index}.ts` + `_generated/services/*.ts` + `_generated/services/index.ts`(service 배럴).
   - Swagger UI URL(`/api-docs`)을 그대로 넘겨도 스크립트가 HTML 응답을 감지해 `/api-docs-json`, `/v3/api-docs` 등 일반 spec 엔드포인트로 자동 fallback 한다.
4. **Format generated files** (skip if --dry-run): 각 출력 루트의 `src/http/_generated`를 `BASE`로 잡아 prettier를 돌린다.
   ```bash
   # 단일: --out-dir 미사용 시 BASE=src/http/_generated, 사용 시 BASE=<out-dir>/src/http/_generated
   # 멀티: 매니페스트의 각 outDir마다 BASE=<outDir>/src/http/_generated 로 반복
   npx prettier --write "${BASE}/types.ts" "${BASE}/endpoints.ts" "${BASE}/services/*.ts" "${BASE}/client.ts" "${BASE}/index.ts"
   ```
   매니페스트 모드에서 outDir 목록은 설정 파일에서 추출한다: `jq -r '(.targets // .)[].outDir' {config}`.
   모든 출력이 매 실행 덮어쓰기되므로 prettier는 항상 생성 직후의 파일을 포맷한다 (동일 spec → idempotent).
5. **Report**: (타깃별) schema·operation 개수, tag별 service 파일 경로 출력 (모든 파일 Generated).

## Generated File Structure

```
src/http/
├── _generated/                    # ← generator 전용 (수기 편집 금지) · import 표면 @/http/_generated
│   ├── types.ts                   # ← GENERATED — DTO interfaces
│   ├── endpoints.ts               # ← GENERATED — URL helpers
│   ├── client.ts                  # ← GENERATED — config 주입 팩토리 (매 실행 덮어쓰기)
│   ├── index.ts                   # ← GENERATED — 공개 배럴 (매 실행 덮어쓰기)
│   └── services/                  # ← GENERATED — tag별 API 서비스 클래스
│       ├── <tag-kebab>.ts         #   operation 1개 = 메서드 1개
│       ├── index.ts               # ← GENERATED — service 배럴 (매 실행 재생성)
│       └── ...
├── <feature>/                     # user-authored — feature-first
│   ├── mapper.ts                  #   DTO ↔ Domain conversion
│   ├── repository.ts              #   Port implementation (uses generated service)
│   └── hook.ts                    #   TanStack Query hooks
└── ...
```

### `src/http/_generated/index.ts` 배럴 (GENERATED — 매 실행 덮어쓰기)

```ts
// GENERATED CODE - DO NOT MODIFY BY HAND
// Source: kelo nextjs-openapi-gen

export { getApi, resetApiInstance, createApiClient } from "./client";
export type { ApiClientConfig } from "./client";
export { endpoints } from "./endpoints";
export type * from "./types";
export * from "./services";
```

client·endpoints·types·services가 모두 같은 `_generated/` 안에 있으므로 배럴의 상대 경로는 형제 참조(`./client`, `./endpoints`, …)다. `export * from "./services"`는 아래 GENERATED 배럴을 가리킨다 (매 실행 재생성 → service 추가/삭제 즉시 반영):

```ts
// _generated/services/index.ts  (GENERATED — DO NOT MODIFY BY HAND)
export * from "./order-items";
export * from "./users";
```

소비 측은 `@/http/_generated`로 한 번에 import: `import { createApiClient, endpoints, UsersService, type UserDto } from "@/http/_generated";`. index.ts는 매 실행 덮어쓰기되므로 직접 수정하지 않는다 — feature 배럴이 필요하면 별도 파일(`src/http/<feature>/index.ts` 등)에 둔다.

### `src/http/_generated/client.ts` 팩토리 (GENERATED — 매 실행 덮어쓰기)

`client.ts`도 나머지 `_generated/` 산출물과 동일하게 `// GENERATED CODE - DO NOT MODIFY BY HAND` + `// Source: kelo nextjs-openapi-gen` 헤더를 가지며 매 실행 덮어쓴다. 인증·hooks·prefix 같은 비즈니스 로직은 이 파일이 아니라 호출부의 `createApiClient(config)`로 주입하므로, client.ts는 결정적 보일러플레이트가 되어 재생성해도 안전하다.

```ts
// GENERATED CODE - DO NOT MODIFY BY HAND
// Source: kelo nextjs-openapi-gen

import ky, { type Hooks, type KyInstance, type Options } from "ky";

const API_PROXY_PATH = "/api/proxy";

// 재시도는 ky(transport) 레이어에 일원화한다. ky는 SSR·route handler·브라우저 등
// 모든 호출부를 덮으므로 단일 권위로 두기 적합하다. TanStack Query를 쓰면 RQ의 기본
// 재시도(3회)와 곱해져 요청이 폭증하므로, QueryClient에서 `retry: false`로 끈다.
const DEFAULT_RETRY: Options["retry"] = {
  limit: 2,
  methods: ["get"],
  statusCodes: [408, 429, 500, 502, 503, 504],
};

// 앱별로 다르게 주입하는 설정 (모노레포 공유 패키지에서 apps/a·apps/b가 각자 주입).
export interface ApiClientConfig {
  apiUrl?: string; // 서버사이드 base URL (브라우저는 proxyPath를 거치므로 무시)
  proxyPath?: string; // 브라우저 프록시 경로 (기본 `/api/proxy`)
  hooks?: Hooks; // ky hooks — 인증 헤더·401 refresh·인터셉터
  retry?: Options["retry"];
  timeout?: Options["timeout"];
  headers?: Record<string, string>;
}

function getPrefix(apiUrl: string, proxyPath: string): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}${proxyPath}`;
  }
  if (!apiUrl) {
    throw new Error("server-side API base URL is required");
  }
  return apiUrl;
}

// config를 주입받아 KyInstance를 만든다. 멀티 앱은 각 앱이 자기 config로 호출한다.
export function createApiClient(config: ApiClientConfig = {}): KyInstance {
  return ky.create({
    prefix: getPrefix(config.apiUrl ?? "", config.proxyPath ?? API_PROXY_PATH),
    retry: config.retry ?? DEFAULT_RETRY,
    timeout: config.timeout ?? 30_000,
    headers: { Accept: "application/json", ...config.headers },
    hooks: config.hooks,
  });
}

// 단일 앱 편의용 싱글톤. 멀티 앱이면 각 앱이 createApiClient(config)를 직접 쓴다.
let api: KyInstance | null = null;

export function getApi(config?: ApiClientConfig): KyInstance {
  if (api === null) api = createApiClient(config);
  return api;
}

export function resetApiInstance(): void {
  api = null;
}
```

**핵심 패턴**: `client.ts`는 **config 주입 팩토리**다. `createApiClient(config)`가 `apiUrl`·`proxyPath`·`hooks`(인증·401 refresh·인터셉터)를 받아 `KyInstance`를 만들고, 생성된 service는 그 인스턴스를 주입받는다(`new UsersService(api)`). 브라우저는 `proxyPath`(기본 `/api/proxy`) Next.js route handler를 거치므로 `apiUrl`을 무시하고, 서버(SSR·route handler)만 주입된 `apiUrl`로 백엔드 직통. env 하드코딩이 없으므로 호출 측에서 env 등으로 읽어 주입한다. `getApi()`는 단일 앱 편의용 싱글톤. client.ts 자체는 매 실행 덮어쓰는 GENERATED 파일이고, 주입 소스·401 refresh·인증 헤더 등 비즈니스 결정은 호출부(feature repository·앱 부트스트랩)의 `createApiClient(config)`에 둔다.

#### 모노레포: 공유 패키지 + 앱별 설정

`packages/http`에 generated(types·endpoints·services)와 `client.ts`를 공유하고, **apps/a·apps/b가 각자 `createApiClient(config)`로 자기 hooks/prefix를 주입**한다 — 동일 service를 서로 다른 설정으로 재사용:

```ts
// apps/a/src/api.ts
import { createApiClient, UsersService } from "@acme/http";
export const api = createApiClient({
  apiUrl: process.env.A_API_URL,
  hooks: { beforeRequest: [attachAuthA] }, // a 전용 인증
});
export const users = new UsersService(api);

// apps/b/src/api.ts
import { createApiClient, UsersService } from "@acme/http";
export const api = createApiClient({
  apiUrl: process.env.B_API_URL,
  proxyPath: "/proxy/v2", // b는 다른 프록시 경로
  hooks: { beforeRequest: [attachAuthB], afterResponse: [refresh401B] },
});
export const users = new UsersService(api);
```

각 앱은 `createApiClient`만 한 번 호출해 자기 인스턴스를 만들고, 그 인스턴스로 service를 구성한다. `client.ts`(공유)는 설정값을 받기만 하므로 앱별로 분기할 필요가 없다.

### `src/http/_generated/types.ts` 예시

```ts
// GENERATED CODE - DO NOT MODIFY BY HAND

export type UserStatusDto = 'active' | 'inactive' | 'banned';

export interface UserDto {
  id: string;
  email: string;
  status: UserStatusDto;
  createdAt: string;
}

export interface OrderItemDto {
  productId: string;
  quantity: number;
}

export interface OrderDto {
  id: string;
  userId: string;
  items: OrderItemDto[];
}
```

### `src/http/_generated/endpoints.ts` 예시

```ts
// GENERATED CODE - DO NOT MODIFY BY HAND

export const endpoints = {
  getUser: (id: string) => `/users/${id}`,
  listUsers: () => `/users`,
  createUser: () => `/users`,
  updateOrder: (orderId: string) => `/orders/${orderId}`,
} as const;
```

### `src/http/_generated/services/<tag-kebab>.ts` 예시

```ts
// GENERATED CODE - DO NOT MODIFY BY HAND

import type { KyInstance } from "ky";
import { endpoints } from "../endpoints";
import type { UserDto, CreateUserDto } from "../types";

export class UsersService {
  constructor(private readonly api: KyInstance) {}

  async getUser(id: string): Promise<UserDto> {
    return this.api.get(endpoints.getUser(id)).json<UserDto>();
  }

  async createUser(body: CreateUserDto): Promise<UserDto> {
    return this.api.post(endpoints.createUser(), { json: body }).json<UserDto>();
  }
}
```

Tag → 파일/클래스명 매핑은 kebab-case (파일) / PascalCase + `Service` suffix (클래스). 예: `"User Profile"` → `user-profile.ts` + `UserProfileService`.

## Mapping Rules

| OpenAPI | TypeScript |
|---|---|
| `components.schemas.<Name>` | `export interface <Name>Dto` |
| `type: string, enum: [...]` | `export type <Name>Dto = 'A' \| 'B' \| 'C'` |
| `type: integer` / `type: number` | `number` |
| `type: boolean` | `boolean` |
| `type: string` (any format) | `string` (런타임 변환은 mapper 책임) |
| `type: array, items: ...` | `<Item>[]` |
| `type: object` w/ `properties` | nested interface (top-level만 `Dto` suffix) |
| `additionalProperties: T` | `Record<string, T>` |
| `nullable: true` | `... \| null` |
| `oneOf` / `anyOf` | union (`A \| B`) |
| `allOf` | intersection (`A & B`) |
| `$ref: '#/components/schemas/Foo'` | `FooDto` |
| `required: [...]` 외 필드 | `?:` optional |
| operation w/ `operationId` | `endpoints.<operationId>(...)` + 서비스 메서드명 |
| operation w/o `operationId` | `endpoints.<method><PathPascal>(...)` fallback |
| `parameters[in=path]` | 함수 인자 (타입은 schema 기반, 기본 `string`) |
| `parameters[in=query]` | 서비스 메서드 `query?: { ... }` 인자 (모든 query가 required면 non-optional) |
| `requestBody.content['application/json']` | 서비스 메서드 `body: BodyDto` 인자 + `{ json: body }` 전달 |
| `responses['200'\|'201'\|'202'\|'2XX']` content | 서비스 메서드 반환 타입 |
| 응답 schema 없음 / 204 | 메서드 반환 `Promise<void>` (`.json<T>()` 호출 생략) |
| `operation.tags[0]` | 서비스 파일/클래스 그룹핑 키 (없으면 `Default`) |
| query에 array (`string[]`) 포함 | 서비스 클래스 내 `private toSearchParams(q)` helper 자동 emit |

## Limitations

- **타깃당 단일 spec** — 한 outDir는 한 spec으로 매번 풀 덮어쓰기. 여러 spec/패키지를 다루려면 `--config` 매니페스트로 타깃을 나열한다 (타깃 간 출력은 서로 독립).
- **`components/schemas`만 DTO 추출** — `paths` 내 inline schema(`$ref` 아닌)는 제외. 모든 응답/요청 타입은 `components/schemas`에 정의해야 한다.
- **이미 `Dto`로 끝나는 schema명은 중복 suffix 안 붙임** (`UserDto` → `UserDto` 유지).
- **`oneOf` + `discriminator`**: 단순 union만 생성. 타입 narrowing 헬퍼는 mapper 레이어에서 작성.
- **mappers·repositories·hooks·domain은 생성 안 함** — 자세한 이유는 SKILL.md 상단 참조. (services는 spec에서 100% 도출 가능해 생성 대상)
- **client.ts·index.ts도 `src/http/_generated/` 안의 GENERATED 파일 — 매 실행 덮어쓰기.** 직접 수정 금지(다음 생성 때 사라짐). 인증·401 refresh·hooks·prefix 같은 비즈니스 로직은 client.ts가 아니라 호출부의 `createApiClient(config)`로 주입한다. 공개 import 표면은 `@/http/_generated`다.
- **응답 envelope 가정 없음** — 백엔드가 `{ success, data: T }` 같은 wrapper를 쓰더라도 spec의 schema 그대로 반환. unwrap은 repository/mapper 레이어 책임.
- **인증 헤더는 createApiClient hooks로 주입** — `parameters[in=header]`는 무시 (서비스 메서드 인자에 등장하지 않음). 인증·트레이싱 헤더는 호출부에서 `createApiClient({ hooks: { beforeRequest: [...] } })`로 주입한다 (`src/http/_generated/client.ts`는 그 config를 받기만 함).

## Usage Examples

```
/kelo:nextjs-openapi-gen specs/openapi.yaml

/kelo:nextjs-openapi-gen https://api.example.com/openapi.json

/kelo:nextjs-openapi-gen specs/openapi.yaml --dry-run

# 모노레포: 루트에서 실행해 특정 패키지로 출력
/kelo:nextjs-openapi-gen specs/openapi.yaml --out-dir packages/http

# 모노레포: 매니페스트로 여러 앱·패키지 일괄 생성 (kelo.openapi.json)
/kelo:nextjs-openapi-gen                         # 무인자 → 루트의 kelo.openapi.json 자동 사용
/kelo:nextjs-openapi-gen --dry-run               # 자동 감지 + 미리보기
/kelo:nextjs-openapi-gen --config custom.json    # 다른 이름/경로는 명시
```

## Notes

- Generated files have `// GENERATED CODE - DO NOT MODIFY BY HAND` header.
- 동일 spec으로 재실행하면 deterministic하게 같은 출력 (idempotent).
- URL spec은 `specs/openapi.{yaml,json}`로 저장돼 VCS 추적 가능. boundary 검사는 `specs/`를 자동 무시.
- 본 스킬은 `/kelo:nextjs-init`로 셋업된 `src/http/` 레이아웃을 가정한다.
