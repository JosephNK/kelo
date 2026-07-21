<!-- GENERATED DOCUMENT - DO NOT MODIFY BY HAND -->
<!-- Generator: scripts/typescript/gen-eslint-reference.mjs -->
<!-- Source: rules/nextjs/base/eslint.rules.mjs (baseBoundaryRules) -->

# Lint Rules — Dependency Diagram (nextjs/base)

> 레이어 간 의존성 시각화 (`baseBoundaryRules` allow-list 기반).
> 텍스트 조회 / Allow 매트릭스 / 레이어별 상세: `lint-rules-reference.md` 참조.

```mermaid
graph LR
  subgraph g_domain [domain]
    domain_model["domain-model"]
    domain_error["domain-error"]
    domain_port["domain-port"]
    domain_service["domain-service"]
  end
  subgraph g_http [http]
    http_client["http-client"]
    http_endpoint["http-endpoint"]
    http_dto["http-dto"]
    http_service["http-service"]
    http_mapper["http-mapper"]
    http_repository["http-repository"]
    http_hook["http-hook"]
  end
  subgraph g_lib [lib]
    lib_shared["lib-shared"]
    lib_shared_barrel["lib-shared-barrel"]
  end
  subgraph g_shared [shared]
    shared_hook["shared-hook"]
    shared_type["shared-type"]
    shared_ui["shared-ui"]
  end
  subgraph g_page [page]
    page_component["page-component"]
    page_provider["page-provider"]
    page["page"]
  end
  db["db"]
  style["style"]
  i18n_config["i18n-config"]
  theme["theme"]
  dictionary["dictionary"]
  email_template["email-template"]
  route_handler["route-handler"]
  domain_port --> domain_model
  domain_service --> domain_model
  domain_service --> domain_port
  domain_service --> domain_error
  http_service --> http_endpoint
  http_service --> http_dto
  http_mapper --> domain_model
  http_mapper --> http_dto
  http_repository --> http_client
  http_repository --> http_endpoint
  http_repository --> http_dto
  http_repository --> http_service
  http_repository --> http_mapper
  http_repository --> domain_port
  http_repository --> domain_error
  http_repository --> domain_model
  http_repository --> db
  http_hook --> domain_service
  http_hook --> http_repository
  http_hook --> domain_model
  lib_shared_barrel --> lib_shared
  shared_hook --> lib_shared
  shared_hook --> lib_shared_barrel
  shared_hook --> shared_type
  shared_hook --> domain_model
  shared_hook --> style
  shared_ui --> domain_model
  shared_ui --> shared_hook
  shared_ui --> shared_type
  shared_ui --> i18n_config
  shared_ui --> style
  shared_ui --> theme
  page_component --> http_hook
  page_component --> shared_ui
  page_component --> shared_hook
  page_component --> domain_model
  page_component --> lib_shared
  page_component --> lib_shared_barrel
  page_component --> shared_type
  page_component --> i18n_config
  page_component --> style
  page_component --> theme
  page_provider --> lib_shared
  page_provider --> lib_shared_barrel
  page_provider --> shared_hook
  page_provider --> style
  page_provider --> theme
  theme --> style
  dictionary --> shared_type
  i18n_config --> dictionary
  shared_type --> dictionary
  email_template --> dictionary
  email_template --> shared_type
  route_handler --> domain_model
  route_handler --> domain_error
  route_handler --> domain_service
  route_handler --> shared_type
  route_handler --> i18n_config
  page --> page_component
  page --> page_provider
  page --> shared_ui
  page --> dictionary
  page --> shared_type
  page --> i18n_config
  page --> style
  page --> theme
```
