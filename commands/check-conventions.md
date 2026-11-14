---
description: Verify that current changes comply with project conventions
allowed-tools: Bash(git diff:*), Bash(git status:*), Bash(git merge-base:*), Bash(git symbolic-ref:*), Read, Grep, Glob
---

## 대상

기본 브랜치에서 갈라진 뒤의 커밋 + 커밋 안 된 변경 + untracked 파일.

- 기본 브랜치: !`git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null || echo "(origin HEAD 없음)"`
- 커밋 안 된 변경·untracked: !`git status --porcelain --untracked-files=all`

기본 브랜치가 있으면 `git diff --name-only $(git merge-base HEAD <기본 브랜치>)`로 커밋된 변경 파일을 더한다. 기본 브랜치 위에서 작업 중이거나 origin HEAD가 없으면 커밋 안 된 변경만 대상으로 한다. 삭제된 파일은 제외한다.

## 규칙

`docs/CONVENTIONS.md`와, 있으면 `docs/CONVENTIONS.PROJECT.md`를 읽는다 (없으면 루트의 같은 이름 파일). 이 문서들은 lint로 강제할 수 없는 팀 결정만 담고 있다 — lint가 잡는 규칙(경계·네이밍·import 등)은 다시 검사하지 않는다.

각 항목을 대상 파일에 적용해 본다. 대상 파일과 무관한 항목(다른 레이어·다른 스택)은 건너뛴다.

## 출력

```
## 컨벤션 검사 결과 (대상 N개 파일)

### 위반
- [ ] file:line — 어긴 항목 — 내용

### 권고
- [ ] file — 내용

### 통과
위반이 없으면 "위반 없음"
```

위반이 있으면 고칠지 사용자에게 묻는다.
