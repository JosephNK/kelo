// =============================================================================
// Rule: no-nested-layer-dir
// -----------------------------------------------------------------------------
// 헥사고날 레이어 폴더 직속 파일만 허용 (flat-only).
//
// 각 레이어(MODULE_LAYER_DIRS — model/port/service/controller/strategy/provider/
// exception/dto/common) 안에 하위 디렉토리를 두면 enforce-file-suffix가 적용되지 않는
// 사각지대가 생기고(LAYER_PATTERN이 직속 파일만 매치), 잘못된 위치/명명을
// 감지할 수 없게 된다.
//
// 위반 예:
//   src/modules/order/provider/entities/order.orm-entity.ts  ❌
//   src/modules/order/dto/request/create-order.request.dto.ts  ❌
//
// 정상 예:
//   src/modules/order/provider/order.orm-entity.ts  ✅
//   src/modules/order/dto/create-order.request.dto.ts  ✅
//
// 제외 대상:
//   - *.spec.ts / *.test.ts / *.module.ts (테스트·DI 조립)
// =============================================================================

import { MODULE_LAYER_DIRS } from "../eslint-rules/settings/boundary-module-layers.mjs";

const NESTED_PATTERN = new RegExp(
  `/src/modules/[^/]+(?:/[^/]+)*/(${MODULE_LAYER_DIRS.join("|")})/([^/]+)/[^/]+$`,
);

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow subdirectories inside layer folders (model/port/service/controller/strategy/provider/exception/dto/common)",
    },
    messages: {
      nestedDir:
        '"{{ layer }}/{{ subdir }}/" subdirectory is not allowed. Move files directly into {{ layer }}/. (conventions.md: flat-only layer)',
    },
    schema: [],
  },
  create(context) {
    return {
      Program(node) {
        const filename = context.filename ?? context.getFilename?.() ?? "";
        if (!filename) return;

        const basename = filename.split("/").pop() ?? "";
        if (
          basename.endsWith(".spec.ts") ||
          basename.endsWith(".test.ts") ||
          basename.endsWith(".module.ts")
        ) {
          return;
        }

        const match = filename.match(NESTED_PATTERN);
        if (!match) return;

        const [, layer, subdir] = match;
        context.report({
          node,
          messageId: "nestedDir",
          data: { layer, subdir },
        });
      },
    };
  },
};
