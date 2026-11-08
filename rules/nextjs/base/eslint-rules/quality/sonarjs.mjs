import sonarjs from "eslint-plugin-sonarjs";

// rules/nextjs·nestjs의 이 파일은 동일 내용을 유지한다 (test/repo-invariants.test.mjs).
// recommended의 각 규칙을 SonarJS 분류로 나눈다. 버그 가능성(problem)은 error,
// 개선 제안(suggestion: 복잡도·스타일 등)은 warn. 보안 점검 대상(Sonar의 security
// hotspot — 설명이 "security-sensitive"인 규칙과 하드코딩된 자격 증명)은 확정 버그가
// 아니라 사람이 검토할 지점이라 warn으로 두고, 테스트 파일에서는 끈다 (고정값이 의도된
// fixture라 소비 프로젝트 측정에서 대부분 오탐이었다). recommended에서 꺼진 규칙은 그대로.
const CREDENTIAL_RULES = ["no-hardcoded-passwords", "no-hardcoded-secrets"];

function isSecurityReview(name) {
  const description = sonarjs.rules[name]?.meta?.docs?.description ?? "";
  return (
    CREDENTIAL_RULES.includes(name) || /security-sensitive/i.test(description)
  );
}

const isOff = (value) => {
  const level = Array.isArray(value) ? value[0] : value;
  return level === "off" || level === 0;
};

function severityFor(ruleId, value) {
  if (isOff(value)) return value;
  const name = ruleId.replace(/^sonarjs\//, "");
  const next =
    sonarjs.rules[name]?.meta?.type === "problem" && !isSecurityReview(name)
      ? "error"
      : "warn";
  return Array.isArray(value) ? [next, ...value.slice(1)] : next;
}

const recommended = Object.entries(sonarjs.configs.recommended.rules);

const TEST_FILES = [
  "**/*.spec.{ts,tsx}",
  "**/*.test.{ts,tsx}",
  "**/*.e2e-spec.ts",
  "test/**",
  "src/test/**",
  "e2e/**",
];

/**
 * SonarJS 코드 스멜·버그 탐지. 버그 성격(같은 조건 반복, 빈 반환값 사용 등)은 error,
 * 복잡도·스타일 등 개선 제안과 보안 점검 대상(하드코딩 IP·자격 증명, 약한 해시 등)은 warn.
 * 테스트 파일에서는 보안 점검 규칙을 끈다.
 */
export const baseSonarjsConfig = [
  {
    plugins: { sonarjs },
    rules: {
      ...Object.fromEntries(
        recommended.map(([ruleId, value]) => [
          ruleId,
          severityFor(ruleId, value),
        ]),
      ),
      "sonarjs/todo-tag": "off", // TODO 허용 (워크플로상 추적)
      // 소비 프로젝트 측정에서 오탐이 대부분이던 규칙 (2026-11-08):
      // 인덱스 접근·Record 조회의 `!== undefined`, `typeof x === "object"` 뒤 `!== null`을
      // "항상 참"으로 잘못 판정한다 — TS 타입이 런타임 undefined를 표현하지 않기 때문
      "sonarjs/different-types-comparison": "off",
      // 문자열 배열의 기본 `.sort()`는 대개 의도된 것이라 검토 권고로만
      "sonarjs/no-alphabetical-sort": "warn",
    },
  },
  {
    files: TEST_FILES,
    rules: Object.fromEntries(
      recommended
        .filter(
          ([ruleId, value]) =>
            !isOff(value) && isSecurityReview(ruleId.replace(/^sonarjs\//, "")),
        )
        .map(([ruleId]) => [ruleId, "off"]),
    ),
  },
];
