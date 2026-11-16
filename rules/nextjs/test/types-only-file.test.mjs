// node --test rules/nextjs/test
// local/types-only-file — src/lib/types는 타입 선언만 허용한다.
import { createRequire } from "node:module";
import { test } from "node:test";

import rule from "../base/custom-rules/types-only-file.mjs";

// eslint·typescript-eslint는 example/nextjs에 설치된 것을 쓴다 (루트에는 없다).
// 설치돼 있지 않으면(새 clone 등) 테스트를 건너뛴다.
const require = createRequire(
  new URL("../../../example/nextjs/package.json", import.meta.url),
);
let tester = null;
try {
  const { RuleTester } = require("eslint");
  const tseslint = require("typescript-eslint");
  tester = new RuleTester({ languageOptions: { parser: tseslint.parser } });
} catch {
  // example/nextjs/node_modules 없음
}
const filename = "src/lib/types/sample.ts";

test("types-only-file", { skip: tester === null }, () => {
  tester.run("types-only-file", rule, {
    valid: [
      'import type { en } from "@/i18n/dictionaries/en";\nexport type Dictionary = typeof en;',
      'import { type User } from "@/domain/user/model";\nexport interface Page { items: User[] }',
      'export type { User } from "@/domain/user/model";',
      'export type * from "./other";',
      "interface A { a: string }\ntype B = A;\nexport { A, B };",
      "declare global { interface Window { x: string } }\nexport {};",
      "export declare const VERSION: string;",
      { code: "export const x = 1;", filename: "src/lib/types/env.d.ts" },
    ].map((c) => (typeof c === "string" ? { code: c, filename } : c)),
    invalid: [
      ["export const ROLES = ['admin'];", "runtimeCode"],
      ["export function isAdmin() { return true; }", "runtimeCode"],
      ["export enum Role { Admin }", "runtimeCode"],
      ["export default class Foo {}", "runtimeCode"],
      ["const local = 1;\nexport type A = typeof local;", "runtimeCode"],
      [
        'import { api } from "@/http/client";\nexport type A = typeof api;',
        "valueImport",
      ],
      ['import "@/http/client";', "valueImport"],
      ['export { api } from "@/http/client";', "valueExport"],
      ['export * from "./other";', "valueExport"],
    ].map(([code, messageId]) => ({ code, filename, errors: [{ messageId }] })),
  });
});
