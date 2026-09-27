#!/usr/bin/env node
// =============================================================================
// Kelo Stylelint Rules Reference Generator
// -----------------------------------------------------------------------------
// stylelint.rules.mjs 파일을 파싱하여 LLM이 소비하기 좋은 컨벤션 스타일 규약 MD를
// 자동 생성한다. 소스 JSDoc이 `Purpose / Why / Bad / Good` 구조를 따를 때 최적.
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
  console.log(`사용법: node scripts/typescript/gen-stylelint-reference.mjs <path-to-stylelint.rules.mjs> [options]

옵션:
  --out-dir <dir>   출력 디렉토리 (기본: 입력 파일과 동일)
  --check           드리프트 검사 (다르면 exit 1)
  -h, --help        도움말
`);
}

// ─── AST 유틸 ───────────────────────────────────────────────────────────────

function src(node, source) {
  return source.slice(node.start, node.end);
}

function nodeToValue(node, localConsts, source) {
  if (!node) return undefined;
  switch (node.type) {
    case "Literal":
      return node.value;
    case "TemplateLiteral": {
      if (node.expressions.length === 0) {
        return node.quasis.map((q) => q.value.cooked).join("");
      }
      const parts = [];
      for (let i = 0; i < node.quasis.length; i++) {
        parts.push(node.quasis[i].value.cooked);
        if (i < node.expressions.length) {
          const v = nodeToValue(node.expressions[i], localConsts, source);
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
    case "ArrayExpression":
      return node.elements.map((el) =>
        el ? nodeToValue(el, localConsts, source) : null,
      );
    case "ObjectExpression": {
      const obj = {};
      for (const prop of node.properties) {
        if (prop.type !== "Property") {
          throw new Error(`Unsupported property kind: ${prop.type}`);
        }
        let key;
        if (prop.computed) {
          key = nodeToValue(prop.key, localConsts, source);
        } else {
          key = prop.key.type === "Identifier" ? prop.key.name : prop.key.value;
        }
        obj[key] = nodeToValue(prop.value, localConsts, source);
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
      return (
        nodeToValue(node.left, localConsts, source) +
        nodeToValue(node.right, localConsts, source)
      );
    }
    case "Identifier": {
      if (localConsts && localConsts.has(node.name))
        return localConsts.get(node.name);
      throw new Error(`Unresolved identifier: ${node.name}`);
    }
    case "CallExpression": {
      if (
        node.callee.type === "MemberExpression" &&
        !node.callee.computed &&
        node.callee.property.type === "Identifier" &&
        node.callee.property.name === "join"
      ) {
        const arr = nodeToValue(node.callee.object, localConsts, source);
        if (!Array.isArray(arr)) throw new Error("join called on non-array");
        const sep = node.arguments[0]
          ? nodeToValue(node.arguments[0], localConsts, source)
          : ",";
        return arr.join(sep);
      }
      throw new Error(`Unsupported CallExpression: ${node.callee.type}`);
    }
    case "ArrowFunctionExpression":
    case "FunctionExpression": {
      if (source) return { __source: src(node, source) };
      throw new Error("Function node without source");
    }
    default:
      throw new Error(`Unsupported node type: ${node.type}`);
  }
}

function collectTopLevelConsts(program, source) {
  const out = new Map();
  for (const stmt of program.body) {
    if (stmt.type !== "VariableDeclaration" || stmt.kind !== "const") continue;
    for (const d of stmt.declarations) {
      if (d.id.type !== "Identifier" || !d.init) continue;
      try {
        out.set(d.id.name, nodeToValue(d.init, out, source));
      } catch {
        // skip
      }
    }
  }
  return out;
}

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

function findPrecedingJSDoc(startPos, source, blockComments) {
  let best = null;
  for (const c of blockComments) {
    if (c.end > startPos) break;
    best = c;
  }
  if (!best) return null;
  const between = source.slice(best.end, startPos);
  if (!/^\s*$/.test(between)) return null;
  if (!best.value.startsWith("*")) return null;
  const body = best.value
    .replace(/^\*/, "")
    .split("\n")
    .map((l) => l.replace(/^\s*\*\s?/, "").trimEnd())
    .join("\n")
    .trim();
  return body || null;
}

// ─── 추출 ───────────────────────────────────────────────────────────────────

function findConfigExport(exportsMap) {
  const pattern = /^[a-z][A-Za-z0-9]*Config$/;
  for (const [name, info] of exportsMap) {
    if (pattern.test(name)) return { name, ...info };
  }
  return null;
}

function extractConfig(configDecl, localConsts, source, blockComments) {
  if (
    !configDecl ||
    !configDecl.init ||
    configDecl.init.type !== "ObjectExpression"
  ) {
    return null;
  }
  const result = { extends: [], plugins: [], rules: [] };
  for (const prop of configDecl.init.properties) {
    if (prop.type !== "Property" || prop.computed) continue;
    const key = prop.key.type === "Identifier" ? prop.key.name : prop.key.value;

    if (key === "extends") {
      try {
        const v = nodeToValue(prop.value, localConsts, source);
        result.extends = Array.isArray(v) ? v : [v];
      } catch {
        result.extends = [];
      }
    } else if (key === "plugins") {
      try {
        const v = nodeToValue(prop.value, localConsts, source);
        result.plugins = Array.isArray(v) ? v : [v];
      } catch {
        result.plugins = [];
      }
    } else if (key === "rules") {
      if (prop.value.type !== "ObjectExpression") continue;
      for (const rprop of prop.value.properties) {
        if (rprop.type !== "Property") continue;
        const rkey =
          rprop.key.type === "Literal"
            ? rprop.key.value
            : rprop.key.type === "Identifier"
              ? rprop.key.name
              : null;
        if (rkey == null) continue;

        let value = null;
        try {
          value = nodeToValue(rprop.value, localConsts, source);
        } catch {
          value = { __source: src(rprop.value, source) };
        }

        const jsdoc = findPrecedingJSDoc(rprop.start, source, blockComments);
        result.rules.push({ name: rkey, value, jsdoc });
      }
    }
  }
  return result;
}

// ─── JSDoc 파싱 (Purpose / Why / Bad / Good) ────────────────────────────────

function extractBacktickContent(s) {
  const m = s.match(/^`(.+?)`\s*$/);
  return m ? m[1] : s.trim();
}

function parseRuleDoc(text) {
  const out = { purpose: "", why: "", bad: "", good: "" };
  if (!text) return out;
  const paragraphs = text.split(/\n\s*\n/);

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    const whyMatch = trimmed.match(/^(?:Why|이유)\s*:\s*([\s\S]+)$/i);
    if (whyMatch) {
      out.why = (out.why ? out.why + "\n\n" : "") + whyMatch[1].trim();
      continue;
    }

    const lines = trimmed.split("\n");
    let anyExample = false;
    for (const line of lines) {
      const bm = line.match(/^Bad\s*:\s*(.+)$/);
      const gm = line.match(/^Good\s*:\s*(.+)$/);
      if (bm) {
        out.bad = extractBacktickContent(bm[1]);
        anyExample = true;
      } else if (gm) {
        out.good = extractBacktickContent(gm[1]);
        anyExample = true;
      }
    }
    if (anyExample) continue;

    out.purpose = out.purpose ? out.purpose + "\n\n" + trimmed : trimmed;
  }
  return out;
}

function formatCssSnippet(s) {
  return s
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => x + ";")
    .join("\n");
}

// ─── 렌더러 ─────────────────────────────────────────────────────────────────

function mdCode(s) {
  return "`" + String(s).replace(/`/g, "\\`") + "`";
}

function renderInline(list) {
  return list.map((x) => mdCode(x)).join(", ");
}

function decomposeRegexPipeGroup(re) {
  const m = /^\/\^\(([^)]+)\)\$\/$/.exec(String(re));
  return m ? m[1].split("|") : null;
}

function extractRuleData(rule) {
  const sections = [];
  if (!Array.isArray(rule.value)) {
    if (
      rule.value &&
      typeof rule.value === "object" &&
      "__source" in rule.value
    ) {
      sections.push({
        label: "Raw source",
        kind: "code",
        lang: "js",
        value: rule.value.__source,
      });
    }
    return sections;
  }
  const [primary, secondary] = rule.value;

  const pushObjectEntries = (entry) => {
    for (const [k, v] of Object.entries(entry)) {
      const decomposed = decomposeRegexPipeGroup(k);
      if (decomposed) {
        sections.push({
          label: "Enforced properties",
          kind: "inline-list",
          value: decomposed,
        });
      } else {
        sections.push({ label: "Property matcher", kind: "inline", value: k });
      }
      if (Array.isArray(v)) {
        sections.push({
          label: "Disallowed value patterns",
          kind: "inline-list",
          value: v,
        });
      } else if (typeof v === "string") {
        sections.push({
          label: "Disallowed value pattern",
          kind: "inline",
          value: v,
        });
      }
    }
  };

  if (Array.isArray(primary)) {
    if (primary.every((x) => typeof x === "string")) {
      sections.push({
        label: "Enforced properties",
        kind: "inline-list",
        value: primary,
      });
    } else {
      for (const entry of primary) {
        if (entry && typeof entry === "object" && !("__source" in entry)) {
          pushObjectEntries(entry);
        }
      }
    }
  } else if (
    primary &&
    typeof primary === "object" &&
    !("__source" in primary)
  ) {
    pushObjectEntries(primary);
  } else if (typeof primary === "string") {
    sections.push({ label: "Primary", kind: "inline", value: primary });
  }

  if (
    secondary &&
    typeof secondary === "object" &&
    !("__source" in secondary)
  ) {
    if ("ignoreValues" in secondary && Array.isArray(secondary.ignoreValues)) {
      sections.push({
        label: "Allowed values (ignoreValues)",
        kind: "inline-list",
        value: secondary.ignoreValues,
      });
    }
    if (
      "ignoreFunctions" in secondary &&
      Array.isArray(secondary.ignoreFunctions)
    ) {
      sections.push({
        label: "Allowed functions (ignoreFunctions)",
        kind: "inline-list",
        value: secondary.ignoreFunctions,
      });
    }
    if ("severity" in secondary) {
      sections.push({
        label: "Severity",
        kind: "inline",
        value: secondary.severity,
      });
    }
    if ("message" in secondary) {
      const msg = secondary.message;
      if (typeof msg === "string") {
        sections.push({
          label: "Stylelint message",
          kind: "quote",
          value: msg,
        });
      } else if (msg && typeof msg === "object" && "__source" in msg) {
        sections.push({
          label: "Stylelint message (fn)",
          kind: "code",
          lang: "js",
          value: msg.__source,
        });
      }
    }
  }

  return sections;
}

function renderDataSection(sec) {
  const lines = [];
  switch (sec.kind) {
    case "inline-list":
      lines.push(`- **${sec.label}**: ${renderInline(sec.value)}`);
      break;
    case "inline":
      lines.push(`- **${sec.label}**: ${mdCode(sec.value)}`);
      break;
    case "quote":
      lines.push(`- **${sec.label}**:`);
      lines.push("  > " + String(sec.value).replace(/\n/g, "\n  > "));
      break;
    case "code":
      lines.push(`- **${sec.label}**:`);
      lines.push("  ```" + (sec.lang || ""));
      for (const l of String(sec.value).split("\n")) lines.push("  " + l);
      lines.push("  ```");
      break;
    default:
      break;
  }
  return lines.join("\n");
}

function renderBaselineSection(extendsList, pluginsList, baseJSDoc) {
  const lines = [];
  lines.push("## Baseline");
  lines.push("");
  lines.push(
    `- **Extends**: ${extendsList.length ? renderInline(extendsList) : "_(없음)_"}`,
  );
  lines.push(
    `- **Plugins**: ${pluginsList.length ? renderInline(pluginsList) : "_(없음)_"}`,
  );
  lines.push("");
  if (baseJSDoc) {
    lines.push(baseJSDoc);
    lines.push("");
  }
  return lines.join("\n");
}

function renderRuleSection(rule, idx) {
  const lines = [];
  lines.push(`## Rule ${idx + 1}: \`${rule.name}\``);
  lines.push("");

  const doc = parseRuleDoc(rule.jsdoc || "");
  if (doc.purpose) {
    lines.push(doc.purpose);
    lines.push("");
  }

  const dataSections = extractRuleData(rule);
  if (dataSections.length) {
    lines.push("### Configuration");
    lines.push("");
    for (const sec of dataSections) {
      lines.push(renderDataSection(sec));
    }
    lines.push("");
  }

  if (doc.why) {
    lines.push("### Why");
    lines.push("");
    lines.push(doc.why);
    lines.push("");
  }

  if (doc.bad || doc.good) {
    lines.push("### Examples");
    lines.push("");
    if (doc.bad) {
      lines.push("**Bad**");
      lines.push("");
      lines.push("```css");
      lines.push(formatCssSnippet(doc.bad));
      lines.push("```");
      lines.push("");
    }
    if (doc.good) {
      lines.push("**Good**");
      lines.push("");
      lines.push("```css");
      lines.push(formatCssSnippet(doc.good));
      lines.push("```");
      lines.push("");
    }
  }

  return lines.join("\n");
}

function renderReference({
  inputRelPath,
  stackLabel,
  configExportName,
  config,
  baseJSDoc,
}) {
  const scriptPath = "scripts/typescript/gen-stylelint-reference.mjs";
  const lines = [];
  lines.push("<!-- GENERATED DOCUMENT - DO NOT MODIFY BY HAND -->");
  lines.push(`<!-- Generator: ${scriptPath} -->`);
  lines.push(`<!-- Source: ${inputRelPath} -->`);
  lines.push(`<!-- Export: ${configExportName} -->`);
  lines.push("");
  lines.push(`# Stylelint Rules Reference (${stackLabel})`);
  lines.push("");
  lines.push(renderBaselineSection(config.extends, config.plugins, baseJSDoc));
  for (let i = 0; i < config.rules.length; i++) {
    lines.push(renderRuleSection(config.rules[i], i));
  }
  return (
    lines
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trimEnd() + "\n"
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv);
  const inputPath = path.resolve(args.input);
  if (!fs.existsSync(inputPath)) {
    console.error(`입력 파일을 찾을 수 없습니다: ${inputPath}`);
    process.exit(1);
  }
  const source = fs.readFileSync(inputPath, "utf8");

  const comments = [];
  const program = acorn.parse(source, {
    ecmaVersion: "latest",
    sourceType: "module",
    locations: true,
    onComment: comments,
  });

  const blockComments = comments.filter((c) => c.type === "Block");

  const exportsMap = collectTopLevelExports(program);
  const localConsts = collectTopLevelConsts(program, source);

  const resolved = findConfigExport(exportsMap);
  if (!resolved) {
    console.error(
      "stylelint config export 를 찾지 못했습니다 (`*Config` suffix).",
    );
    process.exit(1);
  }

  const config = extractConfig(
    resolved.declarator,
    localConsts,
    source,
    blockComments,
  );
  if (!config) {
    console.error(
      "config 객체 구조를 파싱하지 못했습니다 (ObjectExpression 아님).",
    );
    process.exit(1);
  }

  const baseJSDoc = findPrecedingJSDoc(
    resolved.exportNode.start,
    source,
    blockComments,
  );

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
      ? `${parts[rulesIdx + 1]}/${parts[rulesIdx + 2]}`
      : path.basename(path.dirname(inputPath));

  const content = renderReference({
    inputRelPath,
    stackLabel,
    configExportName: resolved.name,
    config,
    baseJSDoc,
  });

  const outPath = path.join(outDir, "stylelint-rules-reference.md");

  if (args.check) {
    if (!fs.existsSync(outPath)) {
      console.error(`Drift: ${outPath} 가 없습니다.`);
      process.exit(1);
    }
    const current = fs.readFileSync(outPath, "utf8");
    if (current !== content) {
      console.error(`Drift detected: ${outPath}`);
      process.exit(1);
    }
    console.log(`OK: ${outPath} (no drift)`);
    return;
  }

  fs.writeFileSync(outPath, content);
  console.log(`Wrote: ${outPath}`);
}

main();
