// =============================================================================
// Rule: types-only-file
// -----------------------------------------------------------------------------
// `src/lib/types/**`는 타입 선언 전용 — 런타임 코드를 두면 안 된다.
//
// 이 폴더는 boundary 검사에서 제외되어(`baseBoundaryIgnores`) 어느 레이어에서든
// import할 수 있고, 이 폴더 파일의 import도 검사하지 않는다. 런타임 코드를 넣으면
// 레이어 규칙을 우회하는 통로가 되므로, 최상위 문장을 타입 선언으로 제한한다.
//
// 위반 예:
//   export const ROLES = ["admin"];          ❌ 값 export
//   export function isAdmin() {}             ❌ 함수
//   export enum Role {}                      ❌ enum (런타임 객체)
//   import { api } from "@/http/client";     ❌ 값 import
//   export { api } from "@/http/client";     ❌ 값 re-export
//
// 정상 예:
//   import type { en } from "@/i18n/dictionaries/en";
//   import { type User } from "@/domain/user/model";
//   export type Dictionary = typeof en;
//   export interface Page<T> { items: T[] }
//   export type { User } from "@/domain/user/model";
//   declare global { ... }
// =============================================================================

const TYPE_DECLARATIONS = new Set([
  "TSTypeAliasDeclaration",
  "TSInterfaceDeclaration",
  "TSDeclareFunction",
]);

function isTypeOnlyImport(node) {
  if (node.importKind === "type") return true;
  return (
    node.specifiers.length > 0 &&
    node.specifiers.every(
      (s) => s.type === "ImportSpecifier" && s.importKind === "type",
    )
  );
}

function isTypeOnlyExportList(node) {
  if (node.exportKind === "type") return true;
  // source 없는 `export { A }`는 로컬 선언을 내보낸다 — 로컬에 런타임 선언이 없으면 타입뿐이다.
  if (!node.source) return true;
  return (
    node.specifiers.length > 0 &&
    node.specifiers.every((s) => s.exportKind === "type")
  );
}

function isTypeDeclaration(node) {
  if (!node) return false;
  if (TYPE_DECLARATIONS.has(node.type)) return true;
  // `declare const x`, `declare class X`, `declare module "x"`, `declare global`
  if (node.declare === true) return true;
  return node.type === "TSModuleDeclaration" && node.kind === "global";
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Allow only type declarations in src/lib/types (no runtime code)",
    },
    messages: {
      runtimeCode:
        "src/lib/types는 타입 선언 전용입니다 — 런타임 코드({{ kind }})를 둘 수 없습니다. 값·함수는 해당 레이어(domain, lib/utils 등)로 옮기세요.",
      valueImport:
        "src/lib/types에서는 타입만 import할 수 있습니다 — `import type` 또는 `import { type X }`를 쓰세요.",
      valueExport:
        "src/lib/types에서는 타입만 re-export할 수 있습니다 — `export type { X } from`을 쓰세요.",
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename ?? "";
    // `.d.ts`는 그 자체로 선언 전용
    if (filename.endsWith(".d.ts")) return {};

    return {
      Program(program) {
        for (const node of program.body) {
          switch (node.type) {
            case "ImportDeclaration":
              if (!isTypeOnlyImport(node)) {
                context.report({ node, messageId: "valueImport" });
              }
              break;
            case "ExportAllDeclaration":
              if (node.exportKind !== "type") {
                context.report({ node, messageId: "valueExport" });
              }
              break;
            case "ExportNamedDeclaration":
              if (node.declaration) {
                if (!isTypeDeclaration(node.declaration)) {
                  context.report({
                    node,
                    messageId: "runtimeCode",
                    data: { kind: node.declaration.type },
                  });
                }
              } else if (!isTypeOnlyExportList(node)) {
                context.report({ node, messageId: "valueExport" });
              }
              break;
            default:
              if (!isTypeDeclaration(node)) {
                context.report({
                  node,
                  messageId: "runtimeCode",
                  data: { kind: node.type },
                });
              }
          }
        }
      },
    };
  },
};
