<!-- GENERATED DOCUMENT - DO NOT MODIFY BY HAND -->
<!-- Generator: scripts/typescript/gen-eslint-reference.mjs -->
<!-- Source: rules/nestjs/base/eslint.rules.mjs (baseBoundaryRules) -->

# Lint Rules — Dependency Diagram (nestjs/base)

> 레이어 간 의존성 시각화 (`baseBoundaryRules` allow-list 기반).
> 텍스트 조회 / Allow 매트릭스 / 레이어별 상세: `lint-rules-reference.md` 참조.

```mermaid
graph LR
  subgraph g_common [common]
    common_pure["common-pure"]
    common["common"]
  end
  subgraph g_infrastructure [infrastructure]
    infrastructure_shared["infrastructure-shared"]
    infrastructure["infrastructure"]
  end
  model["model"]
  exception["exception"]
  module_common["module-common"]
  port["port"]
  service["service"]
  controller["controller"]
  dto["dto"]
  libs["libs"]
  strategy["strategy"]
  provider["provider"]
  model --> common_pure
  exception --> module_common
  exception --> common
  exception --> common_pure
  port --> model
  port --> module_common
  port --> common
  port --> common_pure
  service --> model
  service --> port
  service --> exception
  service --> module_common
  service --> common
  service --> common_pure
  service --> infrastructure_shared
  controller --> port
  controller --> dto
  controller --> model
  controller --> exception
  controller --> module_common
  controller --> common
  controller --> common_pure
  controller --> libs
  controller --> infrastructure_shared
  strategy --> port
  strategy --> dto
  strategy --> model
  strategy --> exception
  strategy --> module_common
  strategy --> common
  strategy --> common_pure
  strategy --> libs
  strategy --> infrastructure_shared
  provider --> port
  provider --> model
  provider --> module_common
  provider --> common
  provider --> common_pure
  provider --> infrastructure
  provider --> infrastructure_shared
  provider --> libs
  dto --> model
  dto --> module_common
  dto --> common
  dto --> common_pure
  module_common --> model
  module_common --> common
  module_common --> common_pure
  common --> common_pure
  infrastructure --> infrastructure_shared
  infrastructure --> common
  infrastructure --> common_pure
  infrastructure_shared --> infrastructure
  infrastructure_shared --> common
  infrastructure_shared --> common_pure
  libs --> common
  libs --> common_pure
  libs --> infrastructure
  libs --> infrastructure_shared
```
