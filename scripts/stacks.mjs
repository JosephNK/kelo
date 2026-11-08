// =============================================================================
// rules/<framework>/stacks.yaml 정의 검증과 kelo.yaml `stacks` 선택 검증.
//
// 스택 정의 키
//   description  /kelo:setup 선택지 설명 (필수)
//   lintPackage  { name, path } — Flutter analyzer 플러그인 vendoring
//   conflicts    [stack] — 함께 선택할 수 없는 스택. 한쪽에만 적어도 양방향으로 적용
// =============================================================================

const STACK_KEYS = ["description", "lintPackage", "conflicts"];

/**
 * stacks.yaml 자체의 오류(알 수 없는 키, 없는 스택을 가리키는 conflicts)를 찾는다.
 * @returns {string[]} 오류 메시지 목록 (없으면 빈 배열)
 */
export function checkStackDefinitions(defined) {
  const errors = [];
  for (const [name, def] of Object.entries(defined)) {
    if (!def || typeof def !== "object") {
      errors.push(`${name}: 정의가 객체가 아닙니다`);
      continue;
    }
    const unknownKeys = Object.keys(def).filter((k) => !STACK_KEYS.includes(k));
    if (unknownKeys.length)
      errors.push(
        `${name}: 알 수 없는 키 ${unknownKeys.join(", ")} (사용 가능: ${STACK_KEYS.join(", ")})`,
      );
    if (typeof def.description !== "string" || !def.description)
      errors.push(`${name}: description이 필요합니다`);
    if (def.conflicts !== undefined) {
      if (!Array.isArray(def.conflicts))
        errors.push(`${name}: conflicts는 스택 이름 배열이어야 합니다`);
      else
        for (const other of def.conflicts) {
          if (other === name) errors.push(`${name}: 자기 자신과 conflicts`);
          else if (!(other in defined))
            errors.push(`${name}: conflicts의 ${other}는 정의되지 않은 스택`);
        }
    }
  }
  return errors;
}

/**
 * 선택한 스택 목록의 오류(정의 없음, 상호 배타 조합)를 찾는다.
 * @returns {string[]} 오류 메시지 목록 (없으면 빈 배열)
 */
export function checkStackSelection(defined, stacks) {
  const unknown = stacks.filter((s) => !(s in defined));
  if (unknown.length)
    return [
      `알 수 없는 스택 ${unknown.join(", ")} (사용 가능: ${Object.keys(defined).join(", ") || "없음"})`,
    ];
  const errors = [];
  const seen = new Set();
  for (const a of stacks) {
    for (const b of stacks) {
      if (a === b) continue;
      const key = [a, b].sort().join("|");
      if (seen.has(key)) continue;
      const conflict =
        defined[a].conflicts?.includes(b) || defined[b].conflicts?.includes(a);
      if (conflict) {
        seen.add(key);
        errors.push(`${a}와 ${b}는 함께 선택할 수 없습니다`);
      }
    }
  }
  return errors;
}
