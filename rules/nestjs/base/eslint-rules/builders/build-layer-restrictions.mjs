import { defineConfig } from "eslint/config";

import { basePathAliasPattern } from "../settings/path-alias-pattern.mjs";

/**
 * 레이어별 import 제한 생성기. 스택별 framework/infra 패키지를 받아
 * 각 레이어의 no-restricted-imports를 구성. 레이어별 제한은 인라인 주석 참조.
 */
export function buildLayerRestrictions(
  frameworkBannedPackages,
  infraBannedPackages = [],
  pathAliasPattern = basePathAliasPattern,
) {
  // null/false 주입 시 path alias 검사 비활성 — patterns 배열에서 제외
  // (package.json.kelo-rules.pathAliasCheck=false 시 gen-eslint가 null을 주입)
  const aliasPart = pathAliasPattern ? [pathAliasPattern] : [];

  return defineConfig(
    // ─── model/ : 순수 TS 유지 ──────────────────────────────────────────
    // 프레임워크/외부 라이브러리 금지, 다른 레이어 import 금지
    {
      files: ["src/modules/**/model/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              ...aliasPart,
              {
                group: frameworkBannedPackages,
                message:
                  "model/ must not import frameworks or external libraries.",
              },
              {
                group: [
                  "**/service/**",
                  "**/controller/**",
                  "**/strategy/**",
                  "**/provider/**",
                  "**/dto/**",
                ],
                message:
                  "model/ must not import from other layers (service, controller, strategy, provider, dto).",
              },
            ],
          },
        ],
      },
    },

    // ─── service/ : UseCase 레이어 ──────────────────────────────────────
    // NestJS DI 관련 심볼만 예외적으로 허용. 나머지 @nestjs/* 는 금지
    // (controller/HTTP 관심사가 service에 스며드는 것을 막기 위함)
    {
      files: ["src/modules/**/service/**/*.ts"],
      ignores: ["**/*.spec.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            // `paths`는 특정 패키지에서 허용 심볼만 화이트리스트할 때 사용
            paths: [
              {
                name: "@nestjs/common",
                allowImportNames: ["Injectable", "Inject"],
                message:
                  "service/ may only import Injectable and Inject from @nestjs/common.",
              },
              {
                name: "@nestjs/event-emitter",
                allowImportNames: ["OnEvent"],
                message:
                  "service/ may only import OnEvent from @nestjs/event-emitter.",
              },
            ],
            patterns: [
              ...aliasPart,
              {
                // @nestjs/* 전부 차단하되 위 paths의 두 패키지는 예외 (`!` prefix)
                group: [
                  "@nestjs/*",
                  "!@nestjs/common",
                  "!@nestjs/event-emitter",
                ],
                message:
                  "service/ must not import from @nestjs/* (except @nestjs/common and @nestjs/event-emitter).",
              },
              // 인프라 SDK(GCP/Anthropic 등) 직접 사용 금지 — Port를 통해 추상화
              ...(infraBannedPackages.length > 0
                ? [
                    {
                      group: infraBannedPackages,
                      message:
                        "service/ must not import infrastructure SDKs directly.",
                    },
                  ]
                : []),
              {
                // 역방향 의존 차단
                group: ["**/controller/**", "**/strategy/**", "**/provider/**"],
                message:
                  "service/ must not import from controller/, strategy/, or provider/.",
              },
            ],
          },
        ],
      },
    },

    // ─── port/ : 인터페이스 ──────────────────────────────────────────────
    // Express 등 HTTP 프레임워크 타입이 섞이면 포팅성이 깨지므로 금지
    {
      files: ["src/modules/**/port/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              ...aliasPart,
              {
                group: frameworkBannedPackages,
                message:
                  "port/ must not import frameworks — use domain types instead.",
              },
              {
                group: [
                  "**/service/**",
                  "**/controller/**",
                  "**/strategy/**",
                  "**/provider/**",
                  "**/dto/**",
                ],
                message:
                  "port/ must not import from service/, controller/, strategy/, provider/, or dto/.",
              },
            ],
          },
        ],
        // Express.Multer.File 같은 global namespace 참조 차단
        // (import이 아닌 전역 타입이라 no-restricted-imports로는 못 잡음)
        "no-restricted-syntax": [
          "error",
          {
            selector: 'TSQualifiedName[left.name="Express"]',
            message:
              "port/ must not reference Express global namespace types (e.g., Express.Multer.File). Convert to a domain type (ImageInput, FileBlob, etc.).",
          },
        ],
      },
    },

    // ─── exception/ : 도메인 예외 ────────────────────────────────────────
    // HttpException 같은 Nest 타입에 의존하면 도메인 순수성이 깨진다
    {
      files: ["src/modules/**/exception/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              ...aliasPart,
              {
                group: ["@nestjs/*", ...infraBannedPackages],
                message: "exception/ must not import frameworks.",
              },
            ],
          },
        ],
      },
    },

    // ─── dto/ : 경계 타입 ───────────────────────────────────────────────
    // class-validator/class-transformer 사용 허용 (DTO는 직렬화 관심사)
    // 오직 path alias만 강제
    {
      files: ["src/modules/**/dto/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [...aliasPart],
          },
        ],
      },
    },

    // ─── controller/ : HTTP 어댑터 ──────────────────────────────────────
    // NestJS 데코레이터/가드/파이프 자유 사용 — path alias만 강제
    {
      files: ["src/modules/**/controller/**/*.ts"],
      ignores: ["**/*.spec.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [...aliasPart],
          },
        ],
      },
    },

    // ─── strategy/ : Inbound 어댑터 변종 (Passport/알고리즘) ─────────────
    // @nestjs/passport, passport-* 자유 사용 — path alias만 강제
    {
      files: ["src/modules/**/strategy/**/*.ts"],
      ignores: ["**/*.spec.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [...aliasPart],
          },
        ],
      },
    },

    // ─── provider/ : Port 구현체 ────────────────────────────────────────
    // TypeORM/외부 SDK 자유 사용 — 구현 계층이므로 인프라 접근 허용
    {
      files: ["src/modules/**/provider/**/*.ts"],
      ignores: ["**/*.spec.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [...aliasPart],
          },
        ],
      },
    },
  );
}
