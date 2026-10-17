/**
 * boundary element 목록을 분류 우선순위 순으로 정렬한다.
 * 분류는 "목록에서 먼저 맞는 element 하나"라서, `fallback: true`인 catch-all
 * (예: `src/app` 전체를 받는 `page`)이 앞에 있으면 뒤에 오는 스택·프로젝트
 * element가 절대 매칭되지 않는다. fallback만 맨 뒤로 보내고 나머지는
 * 입력 순서(base → 스택 → kelo.lint.json)를 그대로 유지한다.
 * `fallback` 키는 플러그인 설정에 넘기지 않도록 제거한다.
 */
export function orderBoundaryElements(elements) {
  const strip = ({ fallback: _fallback, ...element }) => element;
  return [
    ...elements.filter((e) => !e.fallback).map(strip),
    ...elements.filter((e) => e.fallback).map(strip),
  ];
}
