---
description: Update flutter_leaf_kit git ref across pubspec.yaml files
---

# Update Plugin Ref

`flutter_leaf_kit` 의존성의 git ref를 프로젝트 내 모든 `pubspec.yaml`에서 업데이트합니다.

> kelo가 관리하는 의존성(`eslint-config-kelo-{nextjs,nestjs}` 버전, Flutter `kelo_analysis` ref, `.kelo/plugins/` vendoring)은 `/kelo:setup`이 갱신합니다.

## 호출 형식

```
/kelo:update-plugin-ref leaf-kit <ref> [--dry-run]
```

- `<ref>`: 필수. 외부 repo라 명시적 ref가 필요합니다 (예: `v3.0.0`, `main`). v 접두는 스크립트가 처리합니다.
- `[--dry-run]`: 선택. 변경 내용만 미리보기

예시:
```
/kelo:update-plugin-ref leaf-kit v3.0.0
/kelo:update-plugin-ref leaf-kit main --dry-run
```

## Steps

1. 인자에서 `<ref>`를 추출합니다. 없으면 사용자에게 묻거나 중단합니다. 첫 인자가 `leaf-kit`이 아니면 지원 대상이 `leaf-kit`뿐임을 안내하고 중단합니다.
2. 실행합니다 (`<user-project-dir>` = 사용자의 현재 작업 디렉토리, 절대 경로):

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/flutter/dependencies/update-leaf-kit-ref.mjs" <ref> --project-dir <user-project-dir> [--dry-run]
   ```

3. 스크립트 출력을 그대로 보고합니다. `--dry-run`이었다면 변경될 파일 목록을 보여주고 "실제로 적용할까요?"를 묻습니다. 실패하면 원인(대상 manifest 미발견, 해당 의존성 없음 등)을 안내합니다. 적용했다면 엔트리에서 `dart pub get` 후 `pubspec.lock` 변경이 `flutter_leaf_kit`에 그쳤는지 확인하도록 안내합니다.
