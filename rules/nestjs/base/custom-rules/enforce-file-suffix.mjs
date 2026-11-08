// =============================================================================
// Rule: enforce-file-suffix
// -----------------------------------------------------------------------------
// 헥사고날 레이어별 파일명 suffix 강제.
//
// 각 레이어의 파일 역할은 파일명에서 즉시 판별되어야 한다. suffix 없이 배치된
// 파일은 PR 리뷰 시 매번 같은 피드백을 유발하므로 lint로 가드한다.
//
// 레이어별 허용 suffix:
//   port/       : *.port.ts, port-tokens.ts
//   service/    : *.service.ts, *.listener.ts
//   controller/ : *.controller.ts
//   strategy/   : *.strategy.ts
//   provider/   : *.adapter.ts, *.orm-entity.ts, *.mapper.ts, *.scheduler.ts
//   dto/        : *.dto.ts (create-*.dto.ts, *.request.dto.ts 포함)
//   exception/  : *.error.ts
//
// 제외 대상:
//   - model/   : 순수 도메인 함수는 suffix 없이 허용되므로 검사 제외
//                (ex: spelling-grader.ts, cost-calculator.ts)
//   - common/  : 모듈 내부 공용 — 파일 종류가 다양해 suffix 강제 없음
//   - *.spec.ts / *.test.ts / *.module.ts (테스트·DI 조립)
//   - index.ts (re-export 배럴)
// =============================================================================

const LAYER_ALLOWED = {
  port: {
    suffixes: [".port.ts"],
    exact: ["port-tokens.ts"],
  },
  service: {
    suffixes: [".service.ts", ".listener.ts"],
    exact: [],
  },
  controller: {
    suffixes: [".controller.ts"],
    exact: [],
  },
  strategy: {
    suffixes: [".strategy.ts"],
    exact: [],
  },
  provider: {
    suffixes: [".adapter.ts", ".orm-entity.ts", ".mapper.ts", ".scheduler.ts"],
    exact: [],
  },
  dto: {
    suffixes: [".dto.ts"],
    exact: [],
  },
  exception: {
    suffixes: [".error.ts"],
    exact: [],
  },
};

const LAYER_PATTERN =
  /\/src\/modules\/[^/]+(?:\/[^/]+)*\/(port|service|controller|strategy|provider|dto|exception)\/[^/]*$/;

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Enforce layer-specific filename suffixes (e.g., *.service.ts in service/)",
    },
    messages: {
      wrongSuffix:
        'File "{{ basename }}" in {{ layer }}/ must match one of: {{ allowed }}. (conventions.md: Naming)',
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
          basename.endsWith(".module.ts") ||
          basename === "index.ts"
        ) {
          return;
        }

        const match = filename.match(LAYER_PATTERN);
        if (!match) return;

        const layer = match[1];
        const rules = LAYER_ALLOWED[layer];
        if (!rules) return;

        const matchesSuffix = rules.suffixes.some((s) => basename.endsWith(s));
        const matchesExact = rules.exact.includes(basename);
        if (matchesSuffix || matchesExact) return;

        const allowedLabels = [
          ...rules.suffixes.map((s) => `*${s}`),
          ...rules.exact,
        ].join(", ");

        context.report({
          node,
          messageId: "wrongSuffix",
          data: { basename, layer, allowed: allowedLabels },
        });
      },
    };
  },
};
