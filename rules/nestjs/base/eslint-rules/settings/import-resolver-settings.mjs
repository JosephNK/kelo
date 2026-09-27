/**
 * eslint-plugin-import / boundaries 공용 resolver 설정.
 * NodeNext의 `.js` 확장자 ESM import + `@/*` path alias 해석 위해 필수.
 * 미설정 시 boundaries/no-unknown-dependencies 오발화·import/no-cycle silent fail.
 * 다운스트림은 `eslint-import-resolver-typescript`를 dev dep으로 설치해야 한다.
 */
export const baseImportResolverSettings = {
  "import/resolver": {
    typescript: { alwaysTryTypes: true, project: "./tsconfig.json" },
    node: { extensions: [".js", ".ts", ".tsx"] },
  },
};
