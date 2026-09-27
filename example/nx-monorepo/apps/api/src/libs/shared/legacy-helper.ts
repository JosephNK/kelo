// 외부 서브모듈(nest-leaf-libs 역할)을 흉내 낸 파일 — kelo 레이어 규칙 대상이 아니므로
// vocabit처럼 lint에서 제외한다 (legacy: --ignore-pattern, 새 방식: kelo.lint.json ignores).
export const legacyHelper = (value: any) => value;
