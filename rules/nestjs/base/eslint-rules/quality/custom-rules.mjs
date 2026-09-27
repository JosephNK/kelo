import { defineConfig } from "eslint/config";

import keloLocalPlugin from "../../custom-rules/index.mjs";

/**
 * 표준 ESLint 룰로 표현 불가능한 프로젝트 고유 규칙 (`local/*` plugin).
 * 룰별 적용 범위는 아래 블록 인라인 주석 참조.
 */
export const baseCustomRules = defineConfig(
  {
    plugins: { local: keloLocalPlugin },
  },

  // DTO: @ApiProperty required + union type restriction + oneOf 금지
  //      + T|null / Date|null 필드 ↔ decorator 옵션 정합
  {
    files: ["src/modules/**/dto/**/*.dto.ts"],
    rules: {
      "local/require-api-property": "error",
      "local/dto-union-type-restriction": "error",
      "local/no-dto-oneof": "error",
      "local/dto-nullable-match": "error",
    },
  },

  // DTO naming: *ResponseDto → *DataResponseDto / *ItemDto
  //             + file-class pair (*.response.dto.ts ↔ *DataResponseDto,
  //                                *-item.dto.ts ↔ *ItemDto)
  {
    files: ["src/modules/**/dto/**/*.dto.ts"],
    rules: {
      "local/dto-naming-convention": "error",
    },
  },

  // ORM Entity: Date columns must use timestamptz
  {
    files: ["src/modules/**/provider/**/*.orm-entity.ts"],
    rules: {
      "local/require-timestamptz": "error",
    },
  },

  // Controller: catch blocks must use mapDomainException()
  {
    files: ["src/modules/**/controller/**/*.controller.ts"],
    ignores: ["**/*.spec.ts"],
    rules: {
      "local/require-map-domain-exception": "error",
    },
  },

  // Layer filename suffix enforcement (model/ 제외)
  {
    files: ["src/modules/**/*.ts"],
    ignores: ["**/*.spec.ts", "**/*.test.ts", "**/*.module.ts"],
    rules: {
      "local/enforce-file-suffix": "error",
    },
  },

  // Layer flat-only enforcement — 레이어 폴더 직속 파일만 허용 (하위 폴더 금지)
  {
    files: ["src/modules/**/*.ts"],
    ignores: ["**/*.spec.ts", "**/*.test.ts", "**/*.module.ts"],
    rules: {
      "local/no-nested-layer-dir": "error",
    },
  },

  // Domain folder allow-list — <domain>/ 직속 하위 폴더는 known layer만 허용
  // *.module.ts는 anchor로 활용해 빈 폴더도 fs.readdirSync로 검사하므로 ignore에서 제외
  {
    files: ["src/modules/**/*.ts"],
    ignores: ["**/*.spec.ts", "**/*.test.ts"],
    rules: {
      "local/no-unknown-domain-folder": "error",
    },
  },

  // Controller/Service: entity 직접 return 금지 (명시적 return type 한정)
  {
    files: [
      "src/modules/**/controller/**/*.controller.ts",
      "src/modules/**/service/**/*.service.ts",
    ],
    ignores: ["**/*.spec.ts"],
    rules: {
      "local/no-entity-return": "error",
    },
  },
);
