# nx 모노레포 예제 (vocabit 구조)

pnpm + nx 모노레포에서 `/kelo:setup`(workspaces 모드)을 검증하는 예제다.

```
nx-monorepo/
├── kelo.yaml                  # workspaces 설정 (api·admin·app)
├── package.json / pnpm-workspace.yaml / nx.json
├── .husky/pre-commit          # 루트 훅 — Flutter 앱 검사 스크립트를 호출
├── scripts/pack-kelo-local.sh # 로컬 체크아웃 tarball 생성 (pnpm overrides가 참조)
└── apps/
    ├── api/    @demo/api   — NestJS (stacks: typeorm) + src/libs(서브모듈 흉내, kelo.lint.json ignores)
    ├── admin/  @demo/admin — Next.js (stacks: tanstack-query, next-proxy)
    └── app/    @demo/app   — Flutter pub workspace (app/ 엔트리 + packages/core, stack: leaf-kit)
```

## setup 실행

저장소 루트에서:

```bash
node scripts/kelo.mjs setup -p example/nx-monorepo --no-install --analysis-path rules/flutter/base/analysis/kelo_analysis
```

- 워크스페이스별 생성 → 루트 단계(`.husky`·commitlint는 없을 때만) → 루트 install → 워크스페이스별 후속 단계 순.
- Flutter 앱은 `--monorepo-root`로 루트 `.husky/pre-commit`에 `bash apps/app/scripts/kelo-pre-commit.sh` 한 줄이 연결된다.
- `--no-install`·`--analysis-path`를 쓰는 이유는 저장소 `AGENTS.md`의 "`/kelo:setup` 검증 (example)" 참고.

## lint 실행

```bash
cd example/nx-monorepo
./scripts/pack-kelo-local.sh && pnpm install   # 로컬 패키지 연결 (pnpm-workspace.yaml overrides)
pnpm lint                      # = nx run-many -t lint:ci
pnpm --filter @demo/api lint   # = kelo-lint-nestjs
pnpm --filter @demo/admin lint # = kelo-lint-nextjs
(cd apps/app && pnpm lint:ci)  # dart analyze + dart run kelo_analysis:verify
```

확인 포인트:

- 루트에서 파일 경로로 CLI를 호출하면(lint-staged 방식) 파일마다 가장 가까운 `kelo.lint.json`으로 앱 루트를 찾는다.
- `src/libs/**`(api `kelo.lint.json` ignores)는 검사·경고 없이 제외된다.
- Flutter 엄격 규칙은 엔트리(`app/`)에만 적용되고 `packages/core`는 기본 규칙만 받는다.
- admin `eslint.config.mjs`를 조작해도 `pnpm lint`(kelo CLI)는 패키지 규칙으로 그대로 검사한다.
