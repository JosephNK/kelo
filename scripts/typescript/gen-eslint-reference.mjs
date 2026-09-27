#!/usr/bin/env node
// =============================================================================
// Kelo Lint Rules Reference Generator
// -----------------------------------------------------------------------------
// 지정된 ESLint/Stylelint 설정 파일(.mjs)을 파싱하여 Lint 규칙 참조 문서를
// 자동 생성한다.
//
// 사용법:
//   node scripts/typescript/gen-eslint-reference.mjs <path-to-lint-file> [options]
//
// 옵션:
//   --out-dir <dir>   출력 디렉토리 (기본: 입력 파일과 동일)
//   --check           드리프트 검사: 기존 파일과 다르면 exit 1
//   -h, --help        도움말
//
// 생성 파일:
//   - lint-rules-structure-reference.md  (baseBoundaryElements가 있을 때만)
//   - lint-rules-reference.md            (그 외 규칙 전체)
//
// 파싱 전략:
//   - acorn으로 AST 추출 (ecmaVersion: latest, sourceType: module)
//   - 최상위 export const 선언에서 raw data 배열/객체 리터럴만 값으로 변환
//   - JSDoc(블록 주석)을 직후 export와 매핑
//   - 배열 요소와 같은 줄의 라인 주석을 "설명" 컬럼으로 매핑
//   - 미지원 노드(스프레드·변수 참조·메타 프로퍼티 등)는 해당 항목만 건너뜀
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import * as acorn from "acorn";

// ─── CLI ────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { input: null, outDir: null, check: false };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "-h" || a === "--help") {
      printHelp();
      process.exit(0);
    } else if (a === "--out-dir") {
      args.outDir = rest[++i];
    } else if (a === "--check") {
      args.check = true;
    } else if (a.startsWith("-")) {
      console.error(`알 수 없는 옵션: ${a}`);
      printHelp();
      process.exit(1);
    } else if (!args.input) {
      args.input = a;
    } else {
      console.error(`초과 인자: ${a}`);
      process.exit(1);
    }
  }
  if (!args.input) {
    console.error("입력 파일 경로가 필요합니다.");
    printHelp();
    process.exit(1);
  }
  return args;
}

function printHelp() {
  console.log(`사용법: node scripts/typescript/gen-eslint-reference.mjs <path-to-lint-file> [options]

옵션:
  --out-dir <dir>   출력 디렉토리 (기본: 입력 파일과 동일)
  --check           드리프트 검사 (다르면 exit 1)
  -h, --help        도움말
`);
}

// ─── AST 유틸 ───────────────────────────────────────────────────────────────

/**
 * AST 리터럴 노드를 순수 JS 값으로 변환.
 * 지원:
 *   - Literal, TemplateLiteral, ArrayExpression, ObjectExpression
 *   - UnaryExpression (`-literal`)
 *   - BinaryExpression `+` (문자열/숫자 concat)
 *   - Identifier — localConsts 에서 해결 시
 *   - TemplateLiteral with expressions — 각 식이 Identifier로 resolve되면 concat
 * 그 외는 Error throw.
 *
 * @param {object} node
 * @param {Map<string, any>} [localConsts] — 로컬 최상위 `const NAME = <리터럴>` 맵
 */
function nodeToValue(node, localConsts) {
  if (!node) return undefined;
  switch (node.type) {
    case "Literal":
      return node.value;
    case "TemplateLiteral": {
      if (node.expressions.length === 0) {
        return node.quasis.map((q) => q.value.cooked).join("");
      }
      // expression이 있으면 각각 nodeToValue로 해결한 후 quasi와 interleave
      const parts = [];
      for (let i = 0; i < node.quasis.length; i++) {
        parts.push(node.quasis[i].value.cooked);
        if (i < node.expressions.length) {
          const v = nodeToValue(node.expressions[i], localConsts);
          if (typeof v !== "string" && typeof v !== "number") {
            throw new Error(
              "TemplateLiteral expression did not resolve to a primitive",
            );
          }
          parts.push(String(v));
        }
      }
      return parts.join("");
    }
    case "ArrayExpression": {
      const result = [];
      for (const el of node.elements) {
        if (!el) {
          result.push(null);
          continue;
        }
        if (el.type === "SpreadElement") {
          const v = nodeToValue(el.argument, localConsts);
          if (!Array.isArray(v)) {
            throw new Error("SpreadElement argument is not an array");
          }
          result.push(...v);
          continue;
        }
        result.push(nodeToValue(el, localConsts));
      }
      return result;
    }
    case "ObjectExpression": {
      const obj = {};
      for (const prop of node.properties) {
        if (prop.type !== "Property") {
          throw new Error(`Unsupported property kind: ${prop.type}`);
        }
        const key =
          prop.key.type === "Identifier" ? prop.key.name : prop.key.value;
        obj[key] = nodeToValue(prop.value, localConsts);
      }
      return obj;
    }
    case "UnaryExpression":
      if (node.operator === "-" && node.argument.type === "Literal") {
        return -node.argument.value;
      }
      throw new Error(`Unsupported UnaryExpression: ${node.operator}`);
    case "BinaryExpression": {
      if (node.operator !== "+") {
        throw new Error(
          `Unsupported BinaryExpression operator: ${node.operator}`,
        );
      }
      const l = nodeToValue(node.left, localConsts);
      const r = nodeToValue(node.right, localConsts);
      return l + r;
    }
    case "Identifier": {
      if (localConsts && localConsts.has(node.name))
        return localConsts.get(node.name);
      throw new Error(`Unresolved identifier: ${node.name}`);
    }
    case "CallExpression": {
      // `[literal, literal, ...].join(separator)` 만 지원 — baseLayerSemantics.example 용
      if (
        node.callee.type === "MemberExpression" &&
        !node.callee.computed &&
        node.callee.property.type === "Identifier" &&
        node.callee.property.name === "join"
      ) {
        const target = nodeToValue(node.callee.object, localConsts);
        if (!Array.isArray(target)) {
          throw new Error("join() target is not an array");
        }
        const arg = node.arguments[0];
        const sep = arg != null ? nodeToValue(arg, localConsts) : ",";
        return target.join(sep);
      }
      throw new Error(`Unsupported CallExpression`);
    }
    default:
      throw new Error(`Unsupported node type: ${node.type}`);
  }
}

/**
 * 최상위 `const NAME = <expression>` 중 nodeToValue로 즉시 해결 가능한 것만 수집.
 * (export되지 않은 local const; TOKEN_KEYS 같은 템플릿 치환용 상수 지원)
 */
function collectTopLevelConsts(program) {
  const out = new Map();
  for (const stmt of program.body) {
    if (stmt.type !== "VariableDeclaration" || stmt.kind !== "const") continue;
    for (const d of stmt.declarations) {
      if (d.id.type !== "Identifier" || !d.init) continue;
      try {
        out.set(d.id.name, nodeToValue(d.init, out));
      } catch {
        // 해결 불가한 const는 skip (e.g. 함수 호출, 런타임 표현식)
      }
    }
  }
  return out;
}

/**
 * 최상위 `export const NAME = <expression>` 들을 수집.
 * returns Map<name, { declarator, exportNode }>
 */
function collectTopLevelExports(program) {
  const map = new Map();
  for (const stmt of program.body) {
    if (stmt.type !== "ExportNamedDeclaration") continue;
    if (!stmt.declaration || stmt.declaration.type !== "VariableDeclaration")
      continue;
    for (const d of stmt.declaration.declarations) {
      if (d.id.type !== "Identifier") continue;
      map.set(d.id.name, { declarator: d, exportNode: stmt });
    }
  }
  return map;
}

/**
 * 단일 파일을 파싱해 export/JSDoc/localConsts/comments 컨텍스트를 빌드.
 * 상대경로 `import { X } from './sub.mjs'`를 따라가서 sub-file의 export 값을
 * nodeToValue로 평가해 localConsts에 주입한다 (X를 일반 const처럼 사용 가능).
 * cross-file inline comment 추적을 위해 `localImports`(localName → sub-file
 * 컨텍스트 + exportedName)도 함께 빌드한다.
 *
 * @param {string} filePath
 * @param {Map<string, object>} [fileCache] 같은 파일 중복 파싱 방지
 * @returns {{ filePath, source, program, comments, exportsMap, localConsts,
 *            localImports, jsdocMap }}
 */
function parseFile(filePath, fileCache) {
  if (fileCache && fileCache.has(filePath)) return fileCache.get(filePath);
  const source = fs.readFileSync(filePath, "utf8");
  const comments = [];
  const program = acorn.parse(source, {
    ecmaVersion: "latest",
    sourceType: "module",
    locations: true,
    onComment: comments,
  });
  const exportsMap = collectTopLevelExports(program);
  const localConsts = collectTopLevelConsts(program);
  const localImports = new Map();
  const file = {
    filePath,
    source,
    program,
    comments,
    exportsMap,
    localConsts,
    localImports,
    jsdocMap: null,
  };
  if (fileCache) fileCache.set(filePath, file);

  // 상대경로 named import만 따라감 — npm/scoped 패키지는 무시.
  // 순환 import이 있어도 fileCache가 미완성 file을 이미 가지고 있어 무한 재귀를 차단.
  for (const stmt of program.body) {
    if (stmt.type !== "ImportDeclaration") continue;
    const src = stmt.source.value;
    if (typeof src !== "string" || !src.startsWith(".")) continue;
    const subPath = path.resolve(path.dirname(filePath), src);
    if (!fs.existsSync(subPath)) continue;
    const subFile = parseFile(subPath, fileCache);
    for (const spec of stmt.specifiers) {
      if (spec.type !== "ImportSpecifier") continue;
      const importedName = spec.imported.name;
      const localName = spec.local.name;
      const subInfo = subFile.exportsMap.get(importedName);
      if (!subInfo) continue;
      try {
        const value = nodeToValue(subInfo.declarator.init, subFile.localConsts);
        localConsts.set(localName, value);
        localImports.set(localName, {
          sourceFile: subFile,
          exportedName: importedName,
        });
      } catch {
        // 평가 실패 시 skip — Identifier resolve 실패는 nodeToValue가 throw
      }
    }
  }

  file.jsdocMap = buildJSDocMap(source, exportsMap, comments);
  return file;
}

/**
 * 진입 파일에서 `export { ... } from './sub.mjs'` 형태의 re-export를 따라가며
 * 모든 export를 단일 맵으로 통합. 각 export 엔트리에 원본 파일 컨텍스트(`file`)를 부착해
 * tryValue / mapInlineTypeCommentsOnArray 등이 올바른 localConsts/comments를 사용할 수 있게 한다.
 *
 * @param {string} entryPath
 * @returns {{ entry, exportsMap: Map<string, {declarator, exportNode, file}>, jsdocMap: Record<string, string> }}
 */
function parseAndResolveExports(entryPath) {
  const fileCache = new Map();
  const entry = parseFile(entryPath, fileCache);
  const merged = new Map();
  const mergedJsdoc = {};

  // 진입 파일의 직접 export
  for (const [name, info] of entry.exportsMap) {
    merged.set(name, { ...info, file: entry });
  }
  for (const [name, doc] of Object.entries(entry.jsdocMap)) {
    mergedJsdoc[name] = doc;
  }

  // re-export (`export { x } from './sub.mjs'`) 추적
  for (const stmt of entry.program.body) {
    if (stmt.type !== "ExportNamedDeclaration") continue;
    if (!stmt.source) continue;
    const sourcePath = path.resolve(
      path.dirname(entry.filePath),
      stmt.source.value,
    );
    if (!fs.existsSync(sourcePath)) {
      console.warn(`[warn] re-export 대상을 찾을 수 없음: ${sourcePath}`);
      continue;
    }
    const subFile = parseFile(sourcePath, fileCache);
    for (const spec of stmt.specifiers) {
      if (spec.type !== "ExportSpecifier") continue;
      const localName = spec.local?.name;
      const exportedName = spec.exported?.name;
      if (!localName || !exportedName) continue;
      const subInfo = subFile.exportsMap.get(localName);
      if (!subInfo) continue;
      merged.set(exportedName, { ...subInfo, file: subFile });
      if (subFile.jsdocMap[localName]) {
        mergedJsdoc[exportedName] = subFile.jsdocMap[localName];
      }
    }
  }

  return { entry, exportsMap: merged, jsdocMap: mergedJsdoc };
}

/**
 * 각 export 직전의 JSDoc(블록 주석 + value가 '*'로 시작)을 매핑.
 * 주석 끝과 export 시작 사이에 공백 외 문자가 있으면 매칭 제외.
 */
function buildJSDocMap(source, exportsMap, comments) {
  const jsdocs = comments.filter(
    (c) => c.type === "Block" && c.value.startsWith("*"),
  );
  const result = {};
  for (const [name, { exportNode }] of exportsMap) {
    const exportStart = exportNode.start;
    let best = null;
    for (const c of jsdocs) {
      if (c.end > exportStart) break;
      best = c;
    }
    if (!best) continue;
    const between = source.slice(best.end, exportStart);
    if (!/^\s*$/.test(between)) continue;
    const body = best.value
      .replace(/^\*/, "")
      .split("\n")
      .map((l) => l.replace(/^\s*\*\s?/, "").trimEnd())
      .join("\n")
      .trim();
    if (body) result[name] = body;
  }
  return result;
}

/**
 * 배열 엘리먼트(ObjectExpression) 중 `type: '<key>'` 프로퍼티를 가진 것에 대해,
 * 같은 줄의 라인 주석을 { [typeValue]: commentText } 로 매핑.
 * SpreadElement는 import된 식별자를 따라가 sub-file의 ArrayExpression + 그
 * 파일의 comments로 같은 매핑을 재귀 수행 — cross-file 코멘트도 surface.
 *
 * @param {object} arrayNode  ArrayExpression 노드
 * @param {object} file       arrayNode가 속한 파일 컨텍스트(comments + localImports)
 */
function mapInlineTypeCommentsOnArray(arrayNode, file) {
  const map = {};
  if (!arrayNode || arrayNode.type !== "ArrayExpression") return map;
  const visited = new Set();
  collectInlineTypeComments(arrayNode, file, map, visited);
  return map;
}

function collectInlineTypeComments(arrayNode, file, map, visited) {
  if (visited.has(arrayNode)) return;
  visited.add(arrayNode);
  const lineComments = file.comments.filter((c) => c.type === "Line");
  for (const el of arrayNode.elements) {
    if (!el) continue;
    if (el.type === "SpreadElement") {
      // import된 배열 식별자만 follow — 다른 표현식은 skip
      if (el.argument.type !== "Identifier") continue;
      const importInfo = file.localImports?.get(el.argument.name);
      if (!importInfo) continue;
      const subFile = importInfo.sourceFile;
      const subInfo = subFile.exportsMap.get(importInfo.exportedName);
      if (!subInfo) continue;
      const subInit = subInfo.declarator.init;
      if (subInit && subInit.type === "ArrayExpression") {
        collectInlineTypeComments(subInit, subFile, map, visited);
      }
      continue;
    }
    if (el.type !== "ObjectExpression") continue;
    const typeProp = el.properties.find(
      (p) =>
        p.type === "Property" &&
        !p.computed &&
        ((p.key.type === "Identifier" && p.key.name === "type") ||
          (p.key.type === "Literal" && p.key.value === "type")),
    );
    if (!typeProp || typeProp.value.type !== "Literal") continue;
    const typeValue = typeProp.value.value;
    const endLine = el.loc.end.line;
    const sameLineComment = lineComments.find(
      (c) => c.loc.start.line === endLine,
    );
    if (sameLineComment) map[typeValue] = sameLineComment.value.trim();
  }
}

/**
 * 특정 ObjectExpression이 `files:` 속성을 가지는지 검사 — 파일 스코프 블록 판별.
 * file-scoped override는 production 코드 전반에 적용되는 룰 테이블에 포함하면
 * 의도하지 않게 base 설정을 가리므로 메인 테이블 집계에서 제외한다.
 */
function hasFilesProperty(objExpr) {
  if (!objExpr || objExpr.type !== "ObjectExpression") return false;
  return objExpr.properties.some(
    (p) =>
      p.type === "Property" &&
      !p.computed &&
      ((p.key.type === "Identifier" && p.key.name === "files") ||
        (p.key.type === "Literal" && p.key.value === "files")),
  );
}

/**
 * 임의 AST 서브트리를 내려가며 `rules: { ... }` 꼴 ObjectExpression 값을 수집해
 * unscoped/scoped 두 버킷으로 분리 반환.
 *
 * - unscoped: 파일 제한 없이 모든 파일에 적용되는 rules 블록
 * - scoped  : `files: [...]`로 범위가 지정된 rules 블록 (테스트/특정 경로 override 등)
 *
 * 둘로 나누는 이유: scoped override가 unscoped base를 가리지 않도록 렌더 시
 * unscoped가 scoped를 덮어쓰게 합치기 위함. scoped-only 룰은 여전히 포함된다.
 */
function findRuleOverrideBlocks(node, localConsts) {
  const unscoped = [];
  const scoped = [];
  const visit = (n, parentBlock) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) {
      for (const x of n) visit(x, parentBlock);
      return;
    }
    const nextParent = n.type === "ObjectExpression" ? n : parentBlock;
    if (n.type === "Property" && !n.computed) {
      const keyName =
        n.key.type === "Identifier"
          ? n.key.name
          : n.key.type === "Literal"
            ? n.key.value
            : null;
      if (keyName === "rules" && n.value.type === "ObjectExpression") {
        const target = hasFilesProperty(parentBlock) ? scoped : unscoped;
        try {
          target.push(nodeToValue(n.value, localConsts));
        } catch {
          // 일부 값이 미지원 노드(MetaProperty 등)일 수 있음 — 해당 블록만 누락 처리
          const partial = {};
          let anySuccess = false;
          for (const prop of n.value.properties) {
            if (prop.type !== "Property" || prop.computed) continue;
            const k =
              prop.key.type === "Identifier"
                ? prop.key.name
                : prop.key.type === "Literal"
                  ? prop.key.value
                  : null;
            if (k == null) continue;
            try {
              partial[k] = nodeToValue(prop.value, localConsts);
              anySuccess = true;
            } catch {
              partial[k] = "(동적 값)";
              anySuccess = true;
            }
          }
          if (anySuccess) target.push(partial);
        }
      }
    }
    for (const key of Object.keys(n)) {
      if (key === "loc" || key === "start" || key === "end") continue;
      visit(n[key], nextParent);
    }
  };
  visit(node, null);
  return { unscoped, scoped };
}

/**
 * `export const NAME = func([...])` 꼴에서 첫 인자 ArrayExpression 노드 반환.
 */
function getCallArgArray(declarator) {
  const init = declarator.init;
  if (!init || init.type !== "CallExpression") return null;
  const arg0 = init.arguments[0];
  if (!arg0 || arg0.type !== "ArrayExpression") return null;
  return arg0;
}

// ─── 렌더러 ─────────────────────────────────────────────────────────────────

function escapePipe(s) {
  return String(s).replace(/\|/g, "\\|");
}

/**
 * 엘리먼트 배열을 경로 세그먼트 트리로 변환.
 * 각 노드: { name, children: [], element?: <원본 엘리먼트> }
 * 같은 경로에 여러 엘리먼트가 매핑되면 마지막 것이 덮어씀 (실제 충돌은 드묾).
 */
function buildPathTree(elements) {
  const root = { name: "", children: [] };
  for (const el of elements) {
    const patterns = Array.isArray(el.pattern) ? el.pattern : [el.pattern];
    for (const p of patterns) {
      const segments = p.split("/").filter((s) => s.length > 0);
      let cur = root;
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        let child = cur.children.find((c) => c.name === seg);
        if (!child) {
          child = { name: seg, children: [] };
          cur.children.push(child);
        }
        if (i === segments.length - 1) child.element = el;
        cur = child;
      }
    }
  }
  return root;
}

/**
 * 세그먼트 표시명: 파일/glob는 그대로, 일반 디렉토리는 '/' 접미.
 * 패턴의 `\[locale\]` 같은 escape 된 bracket은 `[locale]` 로 복원하여 표시.
 * Next.js dynamic/group/catch-all 세그먼트(`[x]`, `[...x]`, `(x)`)는 디렉토리로 취급.
 */
function formatSegment(name) {
  const clean = name.replace(/\\\[/g, "[").replace(/\\\]/g, "]");
  if (clean === "*" || clean === "**") return clean;
  if (clean.startsWith("[") || clean.startsWith("(")) return clean + "/";
  if (/\.[a-z0-9]+$/i.test(clean)) return clean; // 확장자 있으면 파일
  return clean + "/";
}

/**
 * 경로 문자열로 트리에서 노드를 찾는다. 세그먼트 단위 정확 매칭.
 * 없으면 null.
 */
function findNodeByPath(root, pathStr) {
  const segs = pathStr.split("/").filter(Boolean);
  let cur = root;
  for (const s of segs) {
    const child = cur.children.find((c) => c.name === s);
    if (!child) return null;
    cur = child;
  }
  return cur;
}

/**
 * annotation 노드 객체를 트리 노드로 변환.
 * name이 boundary element의 마지막 세그먼트(bracket unescape 후)와 일치하면
 * 해당 element를 node.element에 주입하여 type 주석이 자동으로 붙도록 한다.
 */
function annotationToTreeNode(a, lintElementByName) {
  const node = { name: a.name, children: [] };
  if (a.note) node._note = a.note;
  if (a.placeholder) node._placeholder = true;
  const cleanName = a.name.replace(/\\\[/g, "[").replace(/\\\]/g, "]");
  const matched = lintElementByName.get(cleanName);
  if (matched) node.element = matched;
  if (Array.isArray(a.children)) {
    for (const c of a.children) {
      node.children.push(annotationToTreeNode(c, lintElementByName));
    }
  }
  return node;
}

/**
 * baseStructureAnnotations를 트리에 병합.
 * - parentPath 노드 아래 glob 자식('*', '**')은 제거
 * - override 배열을 새 자식으로 추가 (annotation → tree node 변환)
 * - annotation name이 boundary element 마지막 세그먼트와 일치하면 type 자동 부착
 */
function mergeAnnotations(tree, annotations, boundaryElements) {
  if (!annotations || typeof annotations !== "object") return;
  const byName = new Map();
  for (const el of boundaryElements) {
    const patterns = Array.isArray(el.pattern) ? el.pattern : [el.pattern];
    for (const p of patterns) {
      const segs = p.split("/").filter(Boolean);
      const last = segs[segs.length - 1];
      if (!last) continue;
      const clean = last.replace(/\\\[/g, "[").replace(/\\\]/g, "]");
      if (!byName.has(clean)) byName.set(clean, el);
    }
  }
  // bracket escape를 제거한 정규화된 이름으로 비교 (tree 세그먼트는 `\[locale\]`,
  // annotation name은 `[locale]` 형태라 직접 비교하면 어긋남)
  const unescape = (s) => s.replace(/\\\[/g, "[").replace(/\\\]/g, "]");
  for (const [parentPath, spec] of Object.entries(annotations)) {
    if (!spec || !Array.isArray(spec.override)) continue;
    const node = findNodeByPath(tree, parentPath);
    if (!node) continue;
    const overrideNames = new Set(spec.override.map((a) => unescape(a.name)));
    node.children = node.children.filter(
      (c) =>
        c.name !== "*" &&
        c.name !== "**" &&
        !overrideNames.has(unescape(c.name)),
    );
    for (const a of spec.override) {
      node.children.push(annotationToTreeNode(a, byName));
    }
  }
}

/**
 * 트리를 ASCII box-drawing 문자로 렌더링 (project-structure.md 스타일).
 * 각 노드 끝에 `# <type> — <설명>` 주석을 붙인다.
 */
function renderPathTree(root, inlineComments) {
  const rows = []; // { display, comment|null }
  const walk = (node, prefix, isLast, isRoot) => {
    if (!isRoot) {
      const connector = isLast ? "└── " : "├── ";
      const display = prefix + connector + formatSegment(node.name);
      let comment = null;
      if (node.element) {
        const t = node.element.type;
        // annotation의 _note가 있으면 우선, 없으면 boundary inline comment
        const desc = node._note || inlineComments[t];
        comment = desc ? `${t} — ${desc}` : t;
      } else if (node._note) {
        comment = node._note;
      }
      rows.push({ display, comment });
    }
    const childPrefix = isRoot ? "" : prefix + (isLast ? "    " : "│   ");
    const sorted = [...node.children].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    sorted.forEach((c, i) => {
      walk(c, childPrefix, i === sorted.length - 1, false);
    });
  };
  walk(root, "", true, true);

  const maxDisplay = Math.max(0, ...rows.map((r) => r.display.length));
  const lines = ["```"];
  for (const r of rows) {
    if (r.comment) {
      const pad = " ".repeat(maxDisplay - r.display.length + 2);
      lines.push(`${r.display}${pad}# ${r.comment}`);
    } else {
      lines.push(r.display);
    }
  }
  lines.push("```");
  return lines.join("\n");
}

function renderStructure({
  jsdocMap,
  elements,
  inlineComments,
  annotations,
  stackLabel,
  inputRelPath,
  elementsExportName,
  annotationsExportName,
}) {
  const lines = [];
  const sourceExports = [elementsExportName, annotationsExportName]
    .filter(Boolean)
    .join(", ");
  lines.push("<!-- GENERATED DOCUMENT - DO NOT MODIFY BY HAND -->");
  lines.push("<!-- Generator: scripts/typescript/gen-eslint-reference.mjs -->");
  lines.push(
    `<!-- Source: ${inputRelPath}${sourceExports ? ` (${sourceExports})` : ""} -->`,
  );
  lines.push("");
  lines.push(`# Lint Rules — Structure Reference (${stackLabel})`);
  lines.push("");

  if (jsdocMap.boundaryElements) {
    lines.push("## 개요");
    lines.push("");
    lines.push(jsdocMap.boundaryElements);
    lines.push("");
  }

  lines.push("## 프로젝트 구조");
  lines.push("");
  lines.push(
    "> 아래 트리는 **대표 구조 예시**입니다. 표기 컨벤션: `<name>` = doc placeholder (실제 폴더는 구체 이름, 예: `<feature>` → `users/`/`products/`). `[name]`/`[...name]`/`(name)` = Next.js 라우팅 컨벤션 (브래킷/괄호가 진짜 폴더명의 일부). lint는 glob(`**`, `*`)로 유연 매칭, `[locale]`처럼 명시된 literal bracket은 그대로 강제합니다.",
  );
  lines.push("");
  const tree = buildPathTree(elements);
  mergeAnnotations(tree, annotations, elements);
  lines.push(renderPathTree(tree, inlineComments));
  lines.push("");

  lines.push("## 레이어별 경로 매핑");
  lines.push("");
  lines.push("| 타입 | 경로 패턴 | 모드 | 설명 |");
  lines.push("| --- | --- | --- | --- |");
  for (const el of elements) {
    const type = el.type;
    const patterns = Array.isArray(el.pattern) ? el.pattern : [el.pattern];
    const patternStr = patterns.map((p) => `\`${p}\``).join(" / ");
    const mode = el.mode ? `\`${el.mode}\`` : "—";
    const desc = inlineComments[type] || "—";
    lines.push(
      `| \`${type}\` | ${patternStr} | ${mode} | ${escapePipe(desc)} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

/**
 * boundary rule의 allow를 항상 `[{to:{type:string}}]` 배열로 정규화.
 * eslint-plugin-boundaries 문법상 두 가지 형태를 모두 허용하기 때문:
 *   - 객체: `allow: { to: { type: 'model' } }`
 *   - 배열: `allow: [ { to: { type: 'model' } } ]`
 * 또한 `to.type`이 문자열/배열 모두 가능하므로 각 타입을 개별 엔트리로 펼친다.
 */
function normalizeAllows(rule) {
  if (!rule.allow) return [];
  const raw = Array.isArray(rule.allow) ? rule.allow : [rule.allow];
  const out = [];
  for (const entry of raw) {
    const toType = entry?.to?.type;
    if (!toType) continue;
    const types = Array.isArray(toType) ? toType : [toType];
    for (const t of types) out.push({ to: { type: t } });
  }
  return out;
}

/**
 * Mermaid 다이어그램 렌더.
 * - 자기 참조 엣지는 제거 (매트릭스에 이미 표현됨, 시각 노이즈 방지)
 * - prefix-* 패턴으로 subgraph 자동 클러스터링 (domain-*, api-*, page-* 등)
 * - 단독 prefix(1개뿐)는 그룹화하지 않음
 */
function renderMermaid(rules) {
  const nodes = new Set();
  const edges = [];
  for (const r of rules) {
    const from = r.from?.type;
    if (!from) continue;
    nodes.add(from);
    for (const a of normalizeAllows(r)) {
      const to = a.to?.type;
      if (!to) continue;
      nodes.add(to);
      if (from !== to) edges.push([from, to]);
    }
  }

  const sanitize = (s) => s.replace(/-/g, "_");
  const prefixOf = (t) => {
    const idx = t.indexOf("-");
    return idx === -1 ? t : t.slice(0, idx);
  };

  const groups = new Map();
  const ungrouped = [];
  for (const n of nodes) {
    const p = prefixOf(n);
    if (!groups.has(p)) groups.set(p, []);
    groups.get(p).push(n);
  }
  for (const [p, members] of [...groups]) {
    if (members.length < 2) {
      ungrouped.push(...members);
      groups.delete(p);
    }
  }

  const lines = [];
  lines.push("```mermaid");
  lines.push("graph LR");
  // subgraph ID는 노드 ID와 충돌하지 않도록 `g_` 접두사를 붙이고, 표시명은 대괄호로 지정
  for (const [prefix, members] of groups) {
    lines.push(`  subgraph g_${prefix} [${prefix}]`);
    for (const m of members) lines.push(`    ${sanitize(m)}["${m}"]`);
    lines.push("  end");
  }
  for (const n of ungrouped) lines.push(`  ${sanitize(n)}["${n}"]`);
  for (const [f, t] of edges) lines.push(`  ${sanitize(f)} --> ${sanitize(t)}`);
  lines.push("```");
  return lines.join("\n");
}

function renderMatrix(rules) {
  const lines = [];
  lines.push("| From | Allow → To |");
  lines.push("| --- | --- |");
  for (const r of rules) {
    const from = r.from?.type || "—";
    const allows = normalizeAllows(r).map((a) => `\`${a.to.type}\``);
    lines.push(
      `| \`${from}\` | ${allows.length ? allows.join(", ") : "_(no layer imports)_"} |`,
    );
  }
  return lines.join("\n");
}

function renderPatterns(patterns) {
  const lines = [];
  lines.push("| 패턴 | 메시지 |");
  lines.push("| --- | --- |");
  for (const p of patterns) {
    const groups = Array.isArray(p.group) ? p.group : [p.group];
    const groupStr = groups.map((g) => `\`${g}\``).join(", ");
    lines.push(`| ${groupStr} | ${escapePipe(p.message || "")} |`);
  }
  return lines.join("\n");
}

function renderSyntax(entries) {
  const lines = [];
  lines.push("| Selector | 메시지 |");
  lines.push("| --- | --- |");
  for (const e of entries) {
    lines.push(
      `| \`${escapePipe(e.selector || "")}\` | ${escapePipe(e.message || "")} |`,
    );
  }
  return lines.join("\n");
}

function renderBulletList(items) {
  return items.map((i) => `- \`${i}\``).join("\n");
}

function collapsePackagePairs(items) {
  const info = new Map();
  for (const p of items) {
    const match = p.match(/^(.+?)\/(\*{1,2})$/);
    if (match) {
      const base = match[1];
      if (!info.has(base))
        info.set(base, { hasRoot: false, hasWild: false, wildcard: "" });
      const entry = info.get(base);
      entry.hasWild = true;
      entry.wildcard = match[2];
    } else {
      if (!info.has(p))
        info.set(p, { hasRoot: false, hasWild: false, wildcard: "" });
      info.get(p).hasRoot = true;
    }
  }
  const seen = new Set();
  const result = [];
  for (const p of items) {
    const match = p.match(/^(.+?)\/(\*{1,2})$/);
    const base = match ? match[1] : p;
    if (seen.has(base)) continue;
    seen.add(base);
    const meta = info.get(base);
    if (meta.hasRoot && meta.hasWild) {
      result.push({ pattern: base, subpaths: true });
    } else {
      result.push({ pattern: p, subpaths: false });
    }
  }
  return result;
}

function renderPackageBulletList(items) {
  const collapsed = collapsePackagePairs(items);
  return collapsed
    .map((c) =>
      c.subpaths ? `- \`${c.pattern}\` (+ 서브경로)` : `- \`${c.pattern}\``,
    )
    .join("\n");
}

/**
 * 무시 패턴을 의미 카테고리로 분류 — 카테고리별 그루핑 렌더용.
 * 매칭 안 되는 패턴은 `special` (프로젝트 고유 예외).
 */
function categorizeIgnorePattern(p) {
  // 구체 경로 매칭 먼저 (regex 오탐 방지):
  // - `next-env.d.ts`는 `.d.ts`지만 자동 생성 메타 → build
  // - `eslint.config.mjs`는 `.config.`지만 ESLint 자체 설정 → build
  if (p === "next-env.d.ts" || p === "eslint.config.mjs") return "build";
  if (
    /^(?:dist|build|coverage|\.next|out|\.kelo|scripts|e2e|node_modules|eslint-rules|migrations)(?:\/|$)/.test(
      p,
    )
  )
    return "build";
  if (/\.(?:spec|test)\.(?:ts|tsx|js|jsx)$/.test(p)) return "test";
  if (/^test\/|\/test\/|^src\/test\//.test(p)) return "test";
  if (/\.config\./.test(p)) return "test";
  if (/\.module\.(?:ts|tsx)$/.test(p)) return "module";
  if (/\.d\.ts$/.test(p) || p === "*.ts" || /(^|\/)types\//.test(p))
    return "meta";
  if (/^src\/main\.|^src\/app\./.test(p)) return "bootstrap";
  return "special";
}

/**
 * 무시 패턴을 카테고리별로 묶어 렌더.
 * 빌드 산출물은 "코드 작성 무관"임을 명시해 LLM이 관심 두지 않도록 유도.
 */
function renderIgnoredPaths(patterns) {
  const groups = [
    { key: "test", label: "테스트/설정 파일", items: [] },
    { key: "module", label: "NestJS DI 조립", items: [] },
    { key: "meta", label: "타입/메타 파일", items: [] },
    { key: "bootstrap", label: "앱 부트스트랩", items: [] },
    { key: "special", label: "특수 경로", items: [] },
    { key: "build", label: "빌드/툴 산출물 (코드 작성 무관)", items: [] },
  ];
  const byKey = new Map(groups.map((g) => [g.key, g]));
  const seen = new Set();
  for (const p of patterns) {
    if (seen.has(p)) continue;
    seen.add(p);
    const cat = categorizeIgnorePattern(p);
    (byKey.get(cat) || byKey.get("special")).items.push(p);
  }
  const out = [];
  for (const g of groups) {
    if (g.items.length === 0) continue;
    const patt = g.items.map((p) => `\`${p}\``).join(", ");
    out.push(`- **${g.label}**: ${patt}`);
  }
  return out.join("\n");
}

/**
 * 레이어 글로서리 렌더. baseBoundaryElements 순서로 각 타입의 semantics를 섹션화한다.
 * semantics가 없는 레이어는 건너뛴다 (부분 정의 가능).
 *
 * 각 레이어 섹션 구조:
 *   ### `<type>`
 *   **Role** — ...
 *   **Contains** — bullet list
 *   **Forbids** — bullet list
 *   **Scope** — ...         (선택)
 *   (code block)            (선택, example 있을 때)
 */
function renderLayerGlossary(elements, layerSemantics) {
  if (!layerSemantics || typeof layerSemantics !== "object") return "";
  const order =
    Array.isArray(elements) && elements.length > 0
      ? elements.map((e) => e?.type).filter(Boolean)
      : Object.keys(layerSemantics);

  const blocks = [];
  for (const type of order) {
    const s = layerSemantics[type];
    if (!s) continue;
    const lines = [];
    lines.push(`### \`${type}\``);
    lines.push("");
    if (s.role) {
      lines.push(`**Role** — ${s.role}`);
      lines.push("");
    }
    if (Array.isArray(s.contains) && s.contains.length) {
      lines.push("**Contains**");
      lines.push("");
      for (const c of s.contains) lines.push(`- ${c}`);
      lines.push("");
    }
    if (Array.isArray(s.forbids) && s.forbids.length) {
      lines.push("**Forbids**");
      lines.push("");
      for (const f of s.forbids) lines.push(`- ${f}`);
      lines.push("");
    }
    if (s.scope) {
      lines.push(`**Scope** — ${s.scope}`);
      lines.push("");
    }
    if (s.example) {
      lines.push("```ts");
      lines.push(s.example);
      lines.push("```");
      lines.push("");
    }
    blocks.push(lines.join("\n").replace(/\n+$/, ""));
  }
  return blocks.join("\n\n");
}

/**
 * LLM이 코드 작성 시 실제로 따라야 할 ESLint 규칙 힌트 맵.
 * - autofix-only (import-sort, prettier)는 제외 — tool이 처리하므로 LLM이 몰라도 됨
 * - LLM 기본 동작과 일치하는 규칙 (prefer-const 등)도 제외 — 노이즈
 * - 새 규칙을 config에 추가해도 이 맵에 없으면 렌더되지 않음 (의도적 allowlist).
 */
const RULE_OVERRIDE_HINTS = {
  "@typescript-eslint/consistent-type-imports":
    'type-only import은 `import type { X } from "..."` 인라인 형식으로 작성.',
  "@typescript-eslint/no-explicit-any":
    "`any` 금지 — 정확한 타입 또는 `unknown` 사용.",
  "@typescript-eslint/no-floating-promises":
    "Promise는 반드시 `await` 또는 `.catch()` 체이닝 (방치 금지).",
  "@typescript-eslint/no-unsafe-argument":
    "`any` 값을 타입된 파라미터에 전달 금지 — 타입 가드/단언으로 좁힌 뒤 전달.",
  "@typescript-eslint/no-deprecated":
    "deprecated API 사용 금지 — 대체 API로 마이그레이션.",
  "no-console":
    "`console.warn` / `console.error`만 허용. `console.log` / `console.debug` 금지.",
  "no-warning-comments":
    "TODO / FIXME / HACK 주석 추적 (warn) — 차단하지 않음, 장기 방치 금지.",
  "sonarjs/no-nested-conditional":
    "중첩 삼항 연산자 금지 — `if/else` 블록 또는 함수 추출.",
  "unused-imports/no-unused-vars":
    "사용 안 하는 변수/파라미터는 `_` prefix (예: `_unused`, `_ctx`).",
};

/**
 * Rule Overrides 렌더 — LLM이 코드 작성 시 주의할 규칙만 선별하여 bullet + 힌트로 출력.
 * 입력 shape: { unscoped: [...], scoped: [...] }.
 * scoped를 먼저 적용하고 unscoped로 덮어써서 "unscoped 우선" 의미론 구현.
 *   - 양쪽에 같은 룰이 있으면 unscoped 값 (프로덕션 전반 정책)
 *   - scoped에만 있는 룰은 그대로 포함
 * severity `off` 또는 hint 맵에 없는 규칙은 렌더 제외.
 */
function renderRuleOverrides(collected) {
  const merged = {};
  const unscopedBlocks = collected?.unscoped || [];
  const scopedBlocks = collected?.scoped || [];
  for (const b of scopedBlocks)
    for (const [k, v] of Object.entries(b)) merged[k] = v;
  for (const b of unscopedBlocks)
    for (const [k, v] of Object.entries(b)) merged[k] = v;

  const parseEntry = (v) => {
    if (typeof v === "string") return { severity: v };
    if (Array.isArray(v)) {
      const [sev] = v;
      return { severity: typeof sev === "string" ? sev : String(sev) };
    }
    return { severity: "(동적)" };
  };

  const rows = [];
  for (const rule of Object.keys(RULE_OVERRIDE_HINTS)) {
    if (!(rule in merged)) continue;
    const { severity } = parseEntry(merged[rule]);
    if (severity === "off") continue;
    rows.push({ rule, hint: RULE_OVERRIDE_HINTS[rule] });
  }
  if (rows.length === 0) return "";
  rows.sort((a, b) => a.rule.localeCompare(b.rule));
  return rows.map((r) => `- \`${r.rule}\` — ${r.hint}`).join("\n");
}

/**
 * Boundary Allow Patches 렌더.
 * 스택이 base 규칙에 추가 허용을 주입할 때 사용 (예: api-repository → new-type).
 * 각 엔트리 형태: { from: 'type', allow: { to: { type: 'X' } } } 또는 배열.
 */
function renderBoundaryAllowPatches(patches) {
  const rows = new Map(); // from → Set<allowType>
  for (const p of patches) {
    const from = p?.from;
    if (!from) continue;
    const allows = Array.isArray(p.allow) ? p.allow : [p.allow];
    for (const entry of allows) {
      const toType = entry?.to?.type;
      if (!toType) continue;
      const types = Array.isArray(toType) ? toType : [toType];
      if (!rows.has(from)) rows.set(from, new Set());
      for (const t of types) rows.get(from).add(t);
    }
  }
  const lines = [];
  lines.push("| From | 추가 허용 (To) |");
  lines.push("| --- | --- |");
  for (const [from, toSet] of rows) {
    const tos = [...toSet].map((t) => `\`${t}\``).join(", ");
    lines.push(`| \`${from}\` | ${tos} |`);
  }
  return lines.join("\n");
}

/**
 * `lint-rules-diagram.md` — Mermaid 기반 의존성 그래프 전용 문서.
 * 사람 독자용 시각화 (LLM/텍스트 조회는 lint-rules-reference.md의 Allow 매트릭스 사용).
 */
function renderDiagram({ boundaryRules, stackLabel, inputRelPath }) {
  const out = [];
  out.push("<!-- GENERATED DOCUMENT - DO NOT MODIFY BY HAND -->");
  out.push("<!-- Generator: scripts/typescript/gen-eslint-reference.mjs -->");
  out.push(`<!-- Source: ${inputRelPath} (baseBoundaryRules) -->`);
  out.push("");
  out.push(`# Lint Rules — Dependency Diagram (${stackLabel})`);
  out.push("");
  out.push("> 레이어 간 의존성 시각화 (`baseBoundaryRules` allow-list 기반).");
  out.push(
    "> 텍스트 조회 / Allow 매트릭스 / 레이어별 상세: `lint-rules-reference.md` 참조.",
  );
  out.push("");
  out.push(renderMermaid(boundaryRules));
  out.push("");
  return out.join("\n");
}

function renderReference({
  jsdocMap,
  boundaryElements,
  layerSemantics,
  boundaryRules,
  boundaryAllowPatches,
  restrictedPatterns,
  restrictedSyntax,
  domainBannedPackages,
  frameworkBannedPackages,
  infraBannedPackages,
  ruleOverrides,
  ignoredPaths,
  stackLabel,
  inputRelPath,
}) {
  const out = [];
  out.push("<!-- GENERATED DOCUMENT - DO NOT MODIFY BY HAND -->");
  out.push("<!-- Generator: scripts/typescript/gen-eslint-reference.mjs -->");
  out.push(`<!-- Source: ${inputRelPath} -->`);
  out.push("");
  out.push(`# Lint Rules Reference (${stackLabel})`);
  out.push("");

  const sections = [];

  const glossary = renderLayerGlossary(boundaryElements, layerSemantics);
  if (glossary) {
    const body = [];
    body.push("## 레이어 글로서리 (Layer Glossary)");
    body.push("");
    if (jsdocMap.layerSemantics) {
      body.push(jsdocMap.layerSemantics);
      body.push("");
    }
    body.push(glossary);
    sections.push(body.join("\n"));
  }

  if (boundaryRules?.length) {
    const body = [];
    body.push("## 의존성 규칙 (Dependency Rules)");
    body.push("");
    if (jsdocMap.boundaryRules) {
      body.push(jsdocMap.boundaryRules);
      body.push("");
    }
    body.push("시각화된 의존성 그래프는 `lint-rules-diagram.md` 참조.");
    body.push("");
    body.push("### Allow 매트릭스");
    body.push("");
    body.push(renderMatrix(boundaryRules));
    sections.push(body.join("\n"));
  }

  if (boundaryAllowPatches?.length) {
    const body = [];
    body.push("## Boundary Allow Patches (base 규칙 추가 허용)");
    body.push("");
    if (jsdocMap.boundaryAllowPatches) {
      body.push(jsdocMap.boundaryAllowPatches);
      body.push("");
    }
    body.push(renderBoundaryAllowPatches(boundaryAllowPatches));
    sections.push(body.join("\n"));
  }

  if (restrictedPatterns?.length) {
    const body = [];
    body.push("## Restricted Patterns (Import 금지 패턴)");
    body.push("");
    if (jsdocMap.restrictedPatterns) {
      body.push(jsdocMap.restrictedPatterns);
      body.push("");
    }
    body.push(renderPatterns(restrictedPatterns));
    sections.push(body.join("\n"));
  }

  if (restrictedSyntax?.length) {
    const body = [];
    body.push("## Restricted Syntax (AST 금지 구문)");
    body.push("");
    if (jsdocMap.restrictedSyntax) {
      body.push(jsdocMap.restrictedSyntax);
      body.push("");
    }
    body.push(renderSyntax(restrictedSyntax));
    sections.push(body.join("\n"));
  }

  if (domainBannedPackages?.length) {
    const body = [];
    body.push("## Domain Purity (도메인 순수성)");
    body.push("");
    if (jsdocMap.domainBannedPackages) {
      body.push(jsdocMap.domainBannedPackages);
      body.push("");
    }
    body.push("### 도메인 레이어 금지 패키지");
    body.push("");
    body.push(renderPackageBulletList(domainBannedPackages));
    sections.push(body.join("\n"));
  }

  if (frameworkBannedPackages?.length) {
    const body = [];
    body.push("## Framework 금지 패키지 (순수 레이어 차단)");
    body.push("");
    if (jsdocMap.frameworkBannedPackages) {
      body.push(jsdocMap.frameworkBannedPackages);
      body.push("");
    }
    body.push(renderPackageBulletList(frameworkBannedPackages));
    sections.push(body.join("\n"));
  }

  if (infraBannedPackages?.length) {
    const body = [];
    body.push("## Infra 금지 패키지 (service 레이어 차단)");
    body.push("");
    if (jsdocMap.infraBannedPackages) {
      body.push(jsdocMap.infraBannedPackages);
      body.push("");
    }
    body.push(renderPackageBulletList(infraBannedPackages));
    sections.push(body.join("\n"));
  }

  const overrideTable = renderRuleOverrides(ruleOverrides);
  if (overrideTable) {
    const body = [];
    body.push("## Rule Overrides (코드 작성 주의)");
    body.push("");
    body.push(
      "ESLint 오버라이드 중 **LLM이 코드 작성 시 명시적으로 따라야 할 규칙만 선별**.",
    );
    body.push("(autofix가 처리하거나 LLM 기본 동작과 동일한 규칙은 생략.)");
    body.push("");
    body.push(overrideTable);
    sections.push(body.join("\n"));
  }

  if (ignoredPaths?.length) {
    const body = [];
    body.push("## Ignored Paths (무시 경로)");
    body.push("");
    if (jsdocMap.boundaryIgnores || jsdocMap.ignores) {
      body.push(jsdocMap.boundaryIgnores || jsdocMap.ignores);
      body.push("");
    }
    body.push("### 무시 패턴 목록");
    body.push("");
    body.push(renderIgnoredPaths(ignoredPaths));
    sections.push(body.join("\n"));
  }

  out.push(sections.join("\n\n"));
  out.push("");
  return out.join("\n");
}

// ─── 메인 ───────────────────────────────────────────────────────────────────

function tryValue(declarator, localConsts) {
  try {
    return nodeToValue(declarator.init, localConsts);
  } catch {
    return null;
  }
}

/**
 * suffix(PascalCase)로 끝나는 top-level export를 찾는다.
 * - `base<Suffix>` 를 우선 (base 파일 legacy 호환), 없으면 `<prefix><Suffix>` 중 첫 매치.
 * - 매칭 대상 export 이름 규칙: 첫 글자 소문자 + 이후 PascalCase (e.g. `gcpFrameworkBannedPackages`).
 */
function findExportBySuffix(exportsMap, suffix) {
  const baseKey = `base${suffix}`;
  if (exportsMap.has(baseKey))
    return { name: baseKey, ...exportsMap.get(baseKey) };
  const pattern = new RegExp(`^[a-z][A-Za-z0-9]*${suffix}$`);
  for (const [name, info] of exportsMap) {
    if (pattern.test(name) && name !== suffix) return { name, ...info };
  }
  return null;
}

/**
 * export 이름에서 suffix를 제외한 prefix를 추출 후, suffix 기준 key로 JSDoc 재매핑.
 * 예: { baseBoundaryRules: '...' } / { gcpFrameworkBannedPackages: '...' }
 *  → { boundaryRules: '...', frameworkBannedPackages: '...' }
 */
function normalizeJsdocBySuffix(rawJsdocMap, resolved) {
  const out = {};
  for (const [suffixKey, found] of Object.entries(resolved)) {
    if (!found) continue;
    const doc = rawJsdocMap[found.name];
    if (doc) out[suffixKey] = doc;
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  const inputPath = path.resolve(args.input);
  if (!fs.existsSync(inputPath)) {
    console.error(`입력 파일을 찾을 수 없습니다: ${inputPath}`);
    process.exit(1);
  }
  // 진입 파일을 파싱하고, `export { x } from './sub.mjs'` 형식 re-export를 따라가
  // 모든 export를 단일 맵으로 통합. 각 엔트리에는 원본 파일 컨텍스트(`file`)가 부착된다.
  const { exportsMap, jsdocMap: rawJsdocMap } =
    parseAndResolveExports(inputPath);

  // suffix → 발견된 export 정보 (없으면 null)
  const resolved = {
    boundaryElements: findExportBySuffix(exportsMap, "BoundaryElements"),
    structureAnnotations: findExportBySuffix(
      exportsMap,
      "StructureAnnotations",
    ),
    layerSemantics: findExportBySuffix(exportsMap, "LayerSemantics"),
    boundaryRules: findExportBySuffix(exportsMap, "BoundaryRules"),
    boundaryAllowPatches: findExportBySuffix(
      exportsMap,
      "BoundaryAllowPatches",
    ),
    restrictedPatterns: findExportBySuffix(exportsMap, "RestrictedPatterns"),
    restrictedSyntax: findExportBySuffix(exportsMap, "RestrictedSyntax"),
    domainBannedPackages: findExportBySuffix(
      exportsMap,
      "DomainBannedPackages",
    ),
    frameworkBannedPackages: findExportBySuffix(
      exportsMap,
      "FrameworkBannedPackages",
    ),
    infraBannedPackages: findExportBySuffix(exportsMap, "InfraBannedPackages"),
    boundaryIgnores: findExportBySuffix(exportsMap, "BoundaryIgnores"),
    ignores: findExportBySuffix(exportsMap, "Ignores"),
    config: findExportBySuffix(exportsMap, "Config"),
  };
  const jsdocMap = normalizeJsdocBySuffix(rawJsdocMap, resolved);

  // 각 declarator에 부착된 file 컨텍스트(localConsts/comments)로 값을 평가하는 헬퍼.
  // re-export 통해 들어온 export는 원본 sub-파일의 컨텍스트를 사용해야 한다.
  const evalArr = (info, fallback = []) =>
    info?.declarator
      ? tryValue(info.declarator, info.file.localConsts) || fallback
      : fallback;
  const evalObj = (info, fallback = {}) =>
    info?.declarator
      ? tryValue(info.declarator, info.file.localConsts) || fallback
      : fallback;

  const elements = evalArr(resolved.boundaryElements);
  const inlineComments = resolved.boundaryElements?.declarator
    ? mapInlineTypeCommentsOnArray(
        resolved.boundaryElements.declarator.init,
        resolved.boundaryElements.file,
      )
    : {};
  const annotations = evalObj(resolved.structureAnnotations);
  const layerSemantics = evalObj(resolved.layerSemantics);
  const boundaryRules = evalArr(resolved.boundaryRules);
  const boundaryAllowPatches = evalArr(resolved.boundaryAllowPatches);
  const restrictedPatterns = evalArr(resolved.restrictedPatterns);
  const restrictedSyntax = evalArr(resolved.restrictedSyntax);
  const domainBannedPackages = evalArr(resolved.domainBannedPackages);
  const frameworkBannedPackages = evalArr(resolved.frameworkBannedPackages);
  const infraBannedPackages = evalArr(resolved.infraBannedPackages);

  let ignoredPaths = [];
  if (resolved.boundaryIgnores) {
    ignoredPaths = ignoredPaths.concat(evalArr(resolved.boundaryIgnores));
  }
  if (resolved.ignores?.declarator) {
    const arrNode = getCallArgArray(resolved.ignores.declarator);
    if (arrNode) {
      try {
        ignoredPaths = ignoredPaths.concat(
          nodeToValue(arrNode, resolved.ignores.file.localConsts),
        );
      } catch {
        // skip
      }
    }
  }
  ignoredPaths = Array.from(new Set(ignoredPaths));

  // baseConfig는 두 가지 호출 형태 모두 지원:
  //   1) `defineConfig([...blocks])`   — 단일 배열 인자 (nextjs)
  //   2) `defineConfig(a, b, c, ...)`  — spread 인자 (nestjs)
  // 두 경우 모두 CallExpression.arguments를 순회해 각 인자에서 rules 블록을 수집한다.
  const ruleOverrides = { unscoped: [], scoped: [] };
  if (resolved.config?.declarator) {
    const init = resolved.config.declarator.init;
    const configLocalConsts = resolved.config.file.localConsts;
    if (init?.type === "CallExpression") {
      for (const arg of init.arguments) {
        const { unscoped, scoped } = findRuleOverrideBlocks(
          arg,
          configLocalConsts,
        );
        ruleOverrides.unscoped.push(...unscoped);
        ruleOverrides.scoped.push(...scoped);
      }
    }
  }

  const outDir = args.outDir
    ? path.resolve(args.outDir)
    : path.dirname(inputPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const repoRoot = process.cwd();
  const inputRelPath = path.relative(repoRoot, inputPath);
  const parts = inputRelPath.split(path.sep);
  const rulesIdx = parts.indexOf("rules");
  const stackLabel =
    rulesIdx >= 0 && parts.length > rulesIdx + 2
      ? parts.slice(rulesIdx + 1, parts.length - 1).join("/")
      : path.basename(path.dirname(inputPath));

  const writes = [];

  if (elements.length) {
    writes.push({
      path: path.join(outDir, "lint-rules-structure-reference.md"),
      content: renderStructure({
        jsdocMap,
        elements,
        inlineComments,
        annotations,
        stackLabel,
        inputRelPath,
        elementsExportName: resolved.boundaryElements?.name,
        annotationsExportName: resolved.structureAnnotations?.name,
      }),
    });
  }

  const referenceContent = renderReference({
    jsdocMap,
    boundaryElements: elements,
    layerSemantics,
    boundaryRules,
    boundaryAllowPatches,
    restrictedPatterns,
    restrictedSyntax,
    domainBannedPackages,
    frameworkBannedPackages,
    infraBannedPackages,
    ruleOverrides,
    ignoredPaths,
    stackLabel,
    inputRelPath,
  });

  // 섹션이 하나도 없으면 헤더만 남는 빈 문서. 그럴 땐 쓰지 않음.
  const hasAnySection =
    Object.keys(layerSemantics).length ||
    boundaryRules.length ||
    boundaryAllowPatches.length ||
    restrictedPatterns.length ||
    restrictedSyntax.length ||
    domainBannedPackages.length ||
    frameworkBannedPackages.length ||
    infraBannedPackages.length ||
    ruleOverrides.unscoped.length + ruleOverrides.scoped.length ||
    ignoredPaths.length;

  if (hasAnySection) {
    writes.push({
      path: path.join(outDir, "lint-rules-reference.md"),
      content: referenceContent,
    });
  } else {
    console.warn(
      `[skip] ${inputRelPath}: 렌더할 섹션이 없어 lint-rules-reference.md를 생성하지 않습니다.`,
    );
  }

  // Mermaid 의존성 그래프는 별도 파일로 분리 — 사람 독자용 시각화 전용.
  // boundaryRules가 있을 때만 생성 (allow-list 데이터가 있어야 그래프 의미가 있음).
  if (boundaryRules.length) {
    writes.push({
      path: path.join(outDir, "lint-rules-diagram.md"),
      content: renderDiagram({ boundaryRules, stackLabel, inputRelPath }),
    });
  }

  if (args.check) {
    let drift = false;
    for (const w of writes) {
      const cur = fs.existsSync(w.path) ? fs.readFileSync(w.path, "utf8") : "";
      if (cur !== w.content) {
        console.error(`[DRIFT] ${path.relative(repoRoot, w.path)}`);
        drift = true;
      }
    }
    if (drift) {
      console.error(
        "\n생성물이 커밋된 파일과 다릅니다. `node scripts/typescript/gen-eslint-reference.mjs <파일>` 을 실행하고 결과를 커밋하세요.",
      );
      process.exit(1);
    }
    console.log("드리프트 없음.");
    return;
  }

  for (const w of writes) {
    fs.writeFileSync(w.path, w.content);
    console.log(`생성: ${path.relative(repoRoot, w.path)}`);
  }
}

main();
