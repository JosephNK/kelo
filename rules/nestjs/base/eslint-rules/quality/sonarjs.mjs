import sonarjs from "eslint-plugin-sonarjs";

// rules/nextjs·nestjs의 이 파일은 동일 내용을 유지한다 (test/repo-invariants.test.mjs).
// recommended의 각 규칙을 SonarJS 분류(meta.type)로 나눠, 버그·보안 가능성(problem)은
// error로, 개선 제안(suggestion: 복잡도·스타일 등)은 warn으로 둔다. recommended에서
// 꺼진 규칙은 그대로 둔다.
function severityFor(ruleId, value) {
  const level = Array.isArray(value) ? value[0] : value;
  if (level === "off" || level === 0) return value;
  const name = ruleId.replace(/^sonarjs\//, "");
  const next = sonarjs.rules[name]?.meta?.type === "problem" ? "error" : "warn";
  return Array.isArray(value) ? [next, ...value.slice(1)] : next;
}

/**
 * SonarJS 코드 스멜·버그 탐지. 버그·보안 성격(같은 조건 반복, 빈 반환값 사용,
 * 하드코딩된 비밀번호 등)은 error, 복잡도·스타일 등 판단이 필요한 개선 제안은 warn.
 */
export const baseSonarjsConfig = [
  {
    plugins: { sonarjs },
    rules: {
      ...Object.fromEntries(
        Object.entries(sonarjs.configs.recommended.rules).map(
          ([ruleId, value]) => [ruleId, severityFor(ruleId, value)],
        ),
      ),
      "sonarjs/todo-tag": "off", // TODO 허용 (워크플로상 추적)
    },
  },
];
