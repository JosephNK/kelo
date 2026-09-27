#!/usr/bin/env node
// =============================================================================
// Next.js OpenAPI Code Generator
// -----------------------------------------------------------------------------
// Reads an OpenAPI 3.x spec and emits (all under <project-root>/src/http/_generated/):
//   - _generated/types.ts        DTO interfaces (components/schemas)
//   - _generated/endpoints.ts    URL helpers (paths)
//   - _generated/services/*.ts   tag별 API 서비스 클래스
//   - _generated/client.ts       config-injection factory
//   - _generated/index.ts        public barrel (import surface: @/http/_generated)
//
// Every file lives in _generated/ and is overwritten on each run. Stale service
// files for renamed tags are removed each run. client.ts/index.ts are GENERATED
// too — per-app auth/hooks/prefix are injected at call sites via
// createApiClient(config), not edited here. Per-feature mapper.ts /
// repository.ts / hook.ts (src/http/<feature>/) are user-authored and never
// touched by this script.
//
// Usage:
//   node scripts/nextjs/openapi/generate-api.mjs <spec> [--dry-run] [--out-dir <dir>]
//   node scripts/nextjs/openapi/generate-api.mjs --config <file> [--dry-run]
//
// <spec> is a file path or HTTP(S) URL. URL specs are saved to
// <project-root>/specs/openapi.{yaml,json} for VCS tracking.
//
// By default <project-root> is the nearest package.json above cwd. In a
// monorepo, pass --out-dir <pkg-dir> to target a specific package — output then
// goes to <out-dir>/src/http/... and the spec to <out-dir>/specs/ (e.g.
// --out-dir packages/http → packages/http/src/http/_generated/...).
//
// --config <file> runs multiple spec→outDir targets in one pass. The file is a
// JSON manifest read relative to cwd:
//   { "targets": [ { "spec": "<path|url>", "outDir": "<dir>" } ] }
// Each target's spec/outDir is resolved from cwd (monorepo root). outDir is
// required per target so each goes to its own package. --config cannot be mixed
// with <spec>/--out-dir.
//
// With no <spec> and no --config, ./kelo.openapi.json is auto-used if it exists.
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import YAML from "yaml";

// Default manifest auto-detected (relative to cwd) when no <spec>/--config given.
const DEFAULT_CONFIG = "kelo.openapi.json";
const LEGACY_DEFAULT_CONFIG = "jkit.openapi.json";

// ─── CLI ────────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`Usage: generate-api.mjs <spec> [--dry-run] [--out-dir <dir>]
       generate-api.mjs --config <file> [--dry-run]

Arguments:
  <spec>            OpenAPI 3.x spec file path or URL

Options:
  --dry-run         Preview only — no files written
  --out-dir <dir>   Output project root (contains src/http). Resolved from cwd.
                    Default: nearest package.json above cwd. Use in monorepos to
                    target a package, e.g. --out-dir packages/http
  --config <file>   JSON manifest with a "targets" array; runs each spec→outDir
                    in one pass. Mutually exclusive with <spec>/--out-dir
                    (set outDir per target in the manifest).
  -h, --help        Show this help

With no <spec> and no --config, ./kelo.openapi.json is auto-used if present.
`);
}

function fail(msg) {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {
    spec: null,
    dryRun: false,
    outDir: null,
    config: null,
  };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--config" || a === "-c") {
      const v = rest[++i];
      if (!v || v.startsWith("-")) fail(`${a} requires a file argument`);
      args.config = v;
    } else if (a.startsWith("--config=")) {
      const v = a.slice("--config=".length);
      if (!v) fail(`--config requires a file argument`);
      args.config = v;
    } else if (a === "--out-dir" || a === "-o") {
      const v = rest[++i];
      if (!v || v.startsWith("-")) fail(`${a} requires a directory argument`);
      args.outDir = v;
    } else if (a.startsWith("--out-dir=")) {
      const v = a.slice("--out-dir=".length);
      if (!v) fail(`--out-dir requires a directory argument`);
      args.outDir = v;
    } else if (a === "-h" || a === "--help") {
      printHelp();
      process.exit(0);
    } else if (a.startsWith("-")) {
      fail(`unknown option: ${a}`);
    } else if (!args.spec) {
      args.spec = a;
    } else {
      fail(`unexpected argument: ${a}`);
    }
  }
  if (args.config) {
    if (args.spec) fail(`cannot combine <spec> with --config`);
    if (args.outDir)
      fail(`cannot combine --out-dir with --config (set outDir per target)`);
  } else if (!args.spec) {
    // No <spec> and no --config: auto-use ./kelo.openapi.json if present.
    if (fs.existsSync(path.resolve(process.cwd(), DEFAULT_CONFIG))) {
      args.config = DEFAULT_CONFIG;
    } else if (
      fs.existsSync(path.resolve(process.cwd(), LEGACY_DEFAULT_CONFIG))
    ) {
      args.config = LEGACY_DEFAULT_CONFIG;
    } else {
      printHelp();
      process.exit(1);
    }
  }
  return args;
}

// ─── Config manifest ─────────────────────────────────────────────────────────

function loadConfig(configPath) {
  const resolved = path.resolve(process.cwd(), configPath);
  if (!fs.existsSync(resolved)) fail(`config not found: ${configPath}`);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(resolved, "utf8"));
  } catch (e) {
    fail(`failed to parse config ${configPath}: ${e.message}`);
  }
  const targets = Array.isArray(parsed) ? parsed : parsed?.targets;
  if (!Array.isArray(targets) || targets.length === 0) {
    fail(`config ${configPath} must have a non-empty "targets" array`);
  }
  targets.forEach((t, i) => {
    if (!t || typeof t.spec !== "string" || !t.spec) {
      fail(`config targets[${i}]: "spec" (string) is required`);
    }
    if (typeof t.outDir !== "string" || !t.outDir) {
      fail(`config targets[${i}]: "outDir" (string) is required`);
    }
  });
  return targets;
}

// ─── Spec loading ───────────────────────────────────────────────────────────

function isUrl(s) {
  return s.startsWith("http://") || s.startsWith("https://");
}

async function fetchText(url) {
  let res;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json, application/yaml, text/yaml" },
      signal: AbortSignal.timeout(30000),
    });
  } catch (e) {
    return { error: `fetch failed: ${e.message}` };
  }
  if (!res.ok) {
    return { error: `HTTP ${res.status} ${res.statusText}` };
  }
  const text = await res.text();
  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  return { text, contentType };
}

function looksLikeHtml(text, contentType) {
  if (contentType.includes("text/html")) return true;
  const t = text.trimStart().toLowerCase();
  return (
    t.startsWith("<!doctype") || t.startsWith("<html") || t.startsWith("<")
  );
}

function tryParseSpec(text) {
  const trimmed = text.trim();
  const isJson = trimmed.startsWith("{") || trimmed.startsWith("[");
  try {
    const obj = isJson ? JSON.parse(text) : YAML.parse(text);
    if (obj && typeof obj === "object" && typeof obj.openapi === "string") {
      return { spec: obj, isJson };
    }
  } catch {
    // not parseable
  }
  return null;
}

/**
 * Derive common OpenAPI spec endpoint candidates from a Swagger UI URL.
 * 입력이 NestJS `/api-docs`처럼 HTML을 반환할 때 자동 fallback 대상으로 사용.
 */
function deriveSpecCandidates(originalUrl) {
  let parsed;
  try {
    parsed = new URL(originalUrl);
  } catch {
    return [];
  }
  const base = `${parsed.protocol}//${parsed.host}`;
  const orig = parsed.pathname.replace(/\/$/, "");
  const candidates = new Set();
  // Sibling-of-input first (e.g. /api-docs → /api-docs-json, /api-docs.json)
  if (orig) {
    candidates.add(`${base}${orig}-json`);
    candidates.add(`${base}${orig}.json`);
    candidates.add(`${base}${orig}-yaml`);
    candidates.add(`${base}${orig}.yaml`);
  }
  // Host-level common patterns (NestJS, SpringDoc, FastAPI 등)
  for (const p of [
    "/api-docs-json",
    "/api-json",
    "/api-docs.json",
    "/swagger-json",
    "/swagger.json",
    "/openapi.json",
    "/openapi.yaml",
    "/v3/api-docs",
    "/v3/api-docs.yaml",
  ]) {
    candidates.add(`${base}${p}`);
  }
  candidates.delete(originalUrl);
  return [...candidates];
}

async function loadSpec(specArg, projectRoot) {
  let text;
  let source;
  let isJson;
  let spec;

  if (isUrl(specArg)) {
    let res = await fetchText(specArg);
    let parsed =
      !res.error && !looksLikeHtml(res.text, res.contentType)
        ? tryParseSpec(res.text)
        : null;

    // 초기 URL이 (a) HTTP 에러 (b) HTML 응답 (c) OpenAPI가 아닌 텍스트 중 하나면
    // sibling/host-level 엔드포인트(/api-docs-json, /v3/api-docs 등)를 순차 탐지.
    if (!parsed) {
      const candidates = deriveSpecCandidates(specArg);
      const reason = res.error
        ? `Spec URL failed (${res.error})`
        : `Spec URL did not return OpenAPI JSON/YAML`;
      if (candidates.length) {
        console.log(`${reason}. Probing common endpoints...`);
        for (const url of candidates) {
          const r = await fetchText(url);
          if (r.error) continue;
          if (looksLikeHtml(r.text, r.contentType)) continue;
          const p = tryParseSpec(r.text);
          if (p) {
            res = r;
            parsed = p;
            console.log(`Found spec at: ${url}`);
            break;
          }
        }
      }
      if (!parsed) {
        fail(
          `${reason}` +
            (candidates.length
              ? ` (also tried: ${candidates.join(", ")})`
              : ""),
        );
      }
    }

    text = res.text;
    spec = parsed.spec;
    isJson = parsed.isJson;
    const ext = isJson ? "json" : "yaml";
    const specsDir = path.join(projectRoot, "specs");
    fs.mkdirSync(specsDir, { recursive: true });
    source = path.join(specsDir, `openapi.${ext}`);
    fs.writeFileSync(source, text);
    console.log(`Saved spec: ${path.relative(projectRoot, source)}`);
  } else {
    source = path.resolve(specArg);
    if (!fs.existsSync(source)) fail(`spec not found: ${specArg}`);
    text = fs.readFileSync(source, "utf8");
    try {
      spec = source.endsWith(".json") ? JSON.parse(text) : YAML.parse(text);
    } catch (e) {
      fail(`failed to parse spec: ${e.message}`);
    }
    if (!spec || typeof spec !== "object") fail("spec is empty or invalid");
  }

  return { spec, source };
}

function validateOpenApi(spec) {
  if (
    !spec.openapi ||
    typeof spec.openapi !== "string" ||
    !spec.openapi.startsWith("3.")
  ) {
    fail(`only OpenAPI 3.x is supported (found: ${spec.openapi ?? "none"})`);
  }
}

// ─── Naming utils ───────────────────────────────────────────────────────────

function toPascalCase(s) {
  return String(s)
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^[^a-zA-Z0-9]+/, "")
    .replace(/^(.)/, (_, c) => c.toUpperCase());
}

function toCamelCase(s) {
  const p = toPascalCase(s);
  return p ? p[0].toLowerCase() + p.slice(1) : "";
}

function dtoName(schemaName) {
  const pascal = toPascalCase(schemaName);
  return pascal.endsWith("Dto") ? pascal : `${pascal}Dto`;
}

function refName(ref) {
  if (typeof ref !== "string") return null;
  const m = ref.match(/^#\/components\/schemas\/(.+)$/);
  return m ? dtoName(m[1]) : null;
}

function isSafeIdent(s) {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(s);
}

function escapeSingle(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

// ─── Schema → TS type ───────────────────────────────────────────────────────

function renderType(schema) {
  if (!schema || typeof schema !== "object") return "unknown";

  if (schema.$ref) {
    return refName(schema.$ref) || "unknown";
  }

  // OpenAPI 3.1: `type` can be an array including 'null'
  let baseType = schema.type;
  let nullableFromTypeArray = false;
  if (Array.isArray(baseType)) {
    const filtered = baseType.filter((t) => t !== "null");
    nullableFromTypeArray = filtered.length !== baseType.length;
    baseType =
      filtered.length === 1
        ? filtered[0]
        : filtered.length === 0
          ? undefined
          : filtered;
  }
  const nullable = Boolean(schema.nullable) || nullableFromTypeArray;

  // oneOf / anyOf → union
  if (Array.isArray(schema.oneOf) || Array.isArray(schema.anyOf)) {
    const variants = (schema.oneOf || schema.anyOf).map((s) => renderType(s));
    return wrapNullable(unionOf(variants), nullable);
  }

  // allOf → intersection
  if (Array.isArray(schema.allOf)) {
    const parts = schema.allOf.map((s) => renderType(s)).filter(Boolean);
    const intersection =
      parts.length === 0
        ? "unknown"
        : parts.length === 1
          ? parts[0]
          : parts.join(" & ");
    return wrapNullable(intersection, nullable);
  }

  // enum
  if (Array.isArray(schema.enum)) {
    const lits = schema.enum.map((v) =>
      typeof v === "string" ? `'${escapeSingle(v)}'` : JSON.stringify(v),
    );
    return wrapNullable(unionOf(lits) || "never", nullable);
  }

  let ts;
  switch (baseType) {
    case "string":
      ts = "string";
      break;
    case "integer":
    case "number":
      ts = "number";
      break;
    case "boolean":
      ts = "boolean";
      break;
    case "array": {
      const item = renderType(schema.items || {});
      ts = needsParensForArray(item) ? `(${item})[]` : `${item}[]`;
      break;
    }
    case "object": {
      if (schema.properties) {
        ts = renderInlineObject(schema);
      } else if (
        schema.additionalProperties !== undefined &&
        schema.additionalProperties !== false
      ) {
        const v =
          schema.additionalProperties === true
            ? "unknown"
            : renderType(schema.additionalProperties);
        ts = `Record<string, ${v}>`;
      } else {
        ts = "Record<string, unknown>";
      }
      break;
    }
    default:
      ts = "unknown";
  }
  return wrapNullable(ts, nullable);
}

function unionOf(parts) {
  const uniq = [...new Set(parts.filter(Boolean))];
  if (uniq.length === 0) return "unknown";
  return uniq.length === 1 ? uniq[0] : uniq.join(" | ");
}

function wrapNullable(ts, nullable) {
  if (!nullable) return ts;
  if (ts === "unknown" || ts === "null" || ts === "never") return ts;
  return `${ts} | null`;
}

function needsParensForArray(t) {
  return t.includes("|") || t.includes("&");
}

function renderInlineObject(schema) {
  const props = schema.properties || {};
  const required = new Set(schema.required || []);
  const entries = Object.entries(props);
  if (entries.length === 0) return "Record<string, unknown>";
  const lines = ["{"];
  for (const [name, prop] of entries) {
    const optional = required.has(name) ? "" : "?";
    const ty = renderType(prop);
    const safe = isSafeIdent(name) ? name : `'${escapeSingle(name)}'`;
    lines.push(`  ${safe}${optional}: ${ty};`);
  }
  lines.push("}");
  return lines.join("\n");
}

// ─── Top-level schema rendering ─────────────────────────────────────────────

function renderTopLevelSchema(name, schema) {
  const tn = dtoName(name);

  // Pure enum → `export type`
  if (
    Array.isArray(schema.enum) &&
    !schema.properties &&
    !schema.oneOf &&
    !schema.anyOf &&
    !schema.allOf
  ) {
    return { code: `export type ${tn} = ${renderType(schema)};` };
  }

  // Object with properties → `export interface`
  if (
    (schema.type === "object" || (!schema.type && schema.properties)) &&
    schema.properties &&
    !schema.oneOf &&
    !schema.anyOf &&
    !schema.allOf
  ) {
    const required = new Set(schema.required || []);
    const lines = [`export interface ${tn} {`];
    for (const [pname, prop] of Object.entries(schema.properties)) {
      const optional = required.has(pname) ? "" : "?";
      const ty = indentNested(renderType(prop), 2);
      const safe = isSafeIdent(pname) ? pname : `'${escapeSingle(pname)}'`;
      lines.push(`  ${safe}${optional}: ${ty};`);
    }
    lines.push("}");
    return { code: lines.join("\n") };
  }

  // Everything else (oneOf/anyOf/allOf/scalar/array at top level) → `export type`
  return {
    code: `export type ${tn} = ${indentNested(renderType(schema), 0)};`,
  };
}

function indentNested(ts, spaces) {
  if (!ts.includes("\n")) return ts;
  const pad = " ".repeat(spaces);
  return ts
    .split("\n")
    .map((line, i) => (i === 0 ? line : pad + line))
    .join("\n");
}

// ─── Endpoints rendering ────────────────────────────────────────────────────

const HTTP_METHODS = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
  "trace",
];

function collectOperations(paths) {
  const ops = [];
  for (const [pathStr, pathItem] of Object.entries(paths || {})) {
    if (!pathItem || typeof pathItem !== "object") continue;
    for (const method of HTTP_METHODS) {
      const op = pathItem[method];
      if (!op || typeof op !== "object") continue;
      ops.push({ path: pathStr, method, op, pathItem });
    }
  }
  return ops;
}

function deriveOpName(op, method, pathStr, used) {
  let name;
  if (op.operationId && typeof op.operationId === "string") {
    name = toCamelCase(op.operationId);
  } else {
    const pathPascal = pathStr
      .split("/")
      .filter(Boolean)
      .map((seg) => toPascalCase(seg.replace(/[{}]/g, "")))
      .join("");
    name = `${method.toLowerCase()}${pathPascal}` || method.toLowerCase();
  }
  if (!name) name = method.toLowerCase();
  let unique = name;
  let i = 2;
  while (used.has(unique)) unique = `${name}${i++}`;
  used.add(unique);
  return unique;
}

function extractPathParams(pathStr, op, pathItem) {
  const names = [...pathStr.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
  const paramDefs = [...(pathItem.parameters || []), ...(op.parameters || [])];
  return names.map((n) => {
    const def = paramDefs.find((p) => p && p.in === "path" && p.name === n);
    let ty = "string";
    if (def && def.schema) {
      const rendered = renderType(def.schema);
      if (
        rendered === "number" ||
        rendered === "string" ||
        rendered === "boolean"
      ) {
        ty = rendered;
      }
    }
    return {
      name: isSafeIdent(n) ? n : `_${n.replace(/[^a-zA-Z0-9]/g, "_")}`,
      type: ty,
    };
  });
}

function renderEndpoint({
  path: pathStr,
  method: _method,
  op,
  pathItem,
  opName,
}) {
  const params = extractPathParams(pathStr, op, pathItem);
  const args = params.map((p) => `${p.name}: ${p.type}`).join(", ");
  const template = pathStr.replace(/\{([^}]+)\}/g, (_, n) => {
    const safe = isSafeIdent(n) ? n : `_${n.replace(/[^a-zA-Z0-9]/g, "_")}`;
    return "${" + safe + "}";
  });
  return `  ${opName}: (${args}) => \`${template}\`,`;
}

// Assign a unique camelCase method name to each operation, shared between
// endpoints.ts entries and service class methods (so service method calls
// `endpoints.X(...)` resolve to the matching helper).
function assignOpNames(operations) {
  const used = new Set();
  return operations.map((opData) => ({
    ...opData,
    opName: deriveOpName(opData.op, opData.method, opData.path, used),
  }));
}

// ─── Services rendering ─────────────────────────────────────────────────────

function extractRequestBodyType(op) {
  const json = op.requestBody?.content?.["application/json"];
  if (!json || !json.schema) return null;
  return renderType(json.schema);
}

function extractSuccessResponseType(op) {
  const r = op.responses || {};
  for (const code of ["200", "201", "202", "2XX"]) {
    const resp = r[code];
    if (!resp) continue;
    const json = resp.content?.["application/json"];
    if (!json || !json.schema) return "void";
    return renderType(json.schema);
  }
  return "void";
}

function extractQueryParams(op, pathItem) {
  const all = [...(pathItem.parameters || []), ...(op.parameters || [])];
  return all
    .filter((p) => p && p.in === "query" && p.name)
    .map((p) => ({
      name: p.name,
      required: Boolean(p.required),
      type: renderType(p.schema || { type: "string" }),
    }));
}

function renderQueryParamType(params) {
  const parts = params.map((p) => {
    const safe = isSafeIdent(p.name) ? p.name : `'${escapeSingle(p.name)}'`;
    const optional = p.required ? "" : "?";
    return `${safe}${optional}: ${p.type}`;
  });
  return compactInlineObject(
    `{\n${parts.map((p) => `    ${p};`).join("\n")}\n  }`,
  );
}

// Collapse short multi-line object literals to single line for service signatures.
// `renderInlineObject` emits multi-line by default (good for top-level interfaces in
// types.ts), but service method signatures benefit from compact inline forms.
function compactInlineObject(typeStr) {
  if (!typeStr) return typeStr;
  if (!typeStr.startsWith("{") || !typeStr.endsWith("}")) return typeStr;
  if (!typeStr.includes("\n")) return typeStr;
  const inner = typeStr
    .slice(1, -1)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");
  const candidate = `{ ${inner} }`;
  return candidate.length <= 80 ? candidate : typeStr;
}

function renderServiceMethod({ path: pathStr, method, op, pathItem, opName }) {
  const pathParams = extractPathParams(pathStr, op, pathItem);
  const queryParams = extractQueryParams(op, pathItem);
  const bodyType = compactInlineObject(extractRequestBodyType(op));
  const respType = compactInlineObject(extractSuccessResponseType(op));

  const args = [];
  for (const p of pathParams) args.push(`${p.name}: ${p.type}`);
  if (bodyType) args.push(`body: ${indentNested(bodyType, 4)}`);
  if (queryParams.length > 0) {
    const queryRequired = queryParams.some((p) => p.required);
    const optional = queryRequired ? "" : "?";
    args.push(`query${optional}: ${renderQueryParamType(queryParams)}`);
  }
  const argStr = args.join(", ");

  const endpointArgs = pathParams.map((p) => p.name).join(", ");
  const urlExpr = `endpoints.${opName}(${endpointArgs})`;

  const optsParts = [];
  if (bodyType) optsParts.push("json: body");
  if (queryParams.length > 0)
    optsParts.push("searchParams: this.toSearchParams(query)");
  const optsExpr = optsParts.length > 0 ? `, { ${optsParts.join(", ")} }` : "";

  const httpMethod = method.toLowerCase();
  const body =
    respType === "void"
      ? `    await this.api.${httpMethod}(${urlExpr}${optsExpr});`
      : `    return this.api.${httpMethod}(${urlExpr}${optsExpr}).json<${respType}>();`;

  return `  async ${opName}(${argStr}): Promise<${respType}> {\n${body}\n  }`;
}

function collectMethodDtos(opData) {
  const dtos = new Set();
  const bodyType = extractRequestBodyType(opData.op);
  const respType = extractSuccessResponseType(opData.op);
  const queryParams = extractQueryParams(opData.op, opData.pathItem);
  const allTypes = [bodyType, respType, ...queryParams.map((q) => q.type)];
  for (const t of allTypes) {
    if (!t) continue;
    for (const m of t.matchAll(/\b([A-Z][a-zA-Z0-9]*Dto)\b/g)) {
      dtos.add(m[1]);
    }
  }
  return dtos;
}

function kebabCase(s) {
  return String(s)
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
}

function groupOperationsByTag(namedOperations) {
  const groups = new Map();
  for (const opData of namedOperations) {
    const tag = opData.op.tags?.[0] || "Default";
    if (!groups.has(tag)) groups.set(tag, []);
    groups.get(tag).push(opData);
  }
  return groups;
}

function renderServiceFile(tag, ops) {
  const className = `${toPascalCase(tag)}Service`;

  const dtoSet = new Set();
  for (const op of ops) {
    for (const name of collectMethodDtos(op)) dtoSet.add(name);
  }
  const dtoNames = [...dtoSet].sort();
  const dtoImport =
    dtoNames.length > 0
      ? `\nimport type {\n${dtoNames.map((n) => `  ${n},`).join("\n")}\n} from "../types";\n`
      : "";

  const hasQueryParams = ops.some(
    (op) => extractQueryParams(op.op, op.pathItem).length > 0,
  );
  const searchParamsHelper = hasQueryParams
    ? `\n  private toSearchParams(q: Record<string, unknown> | undefined): URLSearchParams {
    const p = new URLSearchParams();
    if (!q) return p;
    for (const [k, v] of Object.entries(q)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) for (const item of v) p.append(k, String(item));
      else p.set(k, String(v));
    }
    return p;
  }
`
    : "";

  const methods = ops.map(renderServiceMethod).join("\n\n");

  return [
    GEN_HEADER,
    "",
    `import type { KyInstance } from "ky";`,
    "",
    `import { endpoints } from "../endpoints";`,
    dtoImport,
    `export class ${className} {`,
    `  constructor(private readonly api: KyInstance) {}`,
    searchParamsHelper,
    methods,
    `}`,
    "",
  ].join("\n");
}

// ─── File renderers ─────────────────────────────────────────────────────────

const GEN_HEADER =
  "// GENERATED CODE - DO NOT MODIFY BY HAND\n// Source: kelo nextjs-openapi-gen";

function renderTypesFile(schemas) {
  const entries = Object.entries(schemas);
  if (entries.length === 0) {
    return `${GEN_HEADER}\n\nexport {};\n`;
  }
  const ordered = entries.sort(([a], [b]) => a.localeCompare(b));
  const blocks = ordered.map(
    ([name, schema]) => renderTopLevelSchema(name, schema).code,
  );
  return `${GEN_HEADER}\n\n${blocks.join("\n\n")}\n`;
}

function renderEndpointsFile(namedOperations) {
  if (namedOperations.length === 0) {
    return `${GEN_HEADER}\n\nexport const endpoints = {} as const;\n`;
  }
  const lines = namedOperations.map(renderEndpoint);
  return `${GEN_HEADER}\n\nexport const endpoints = {\n${lines.join("\n")}\n} as const;\n`;
}

// ─── _generated/client.ts · _generated/index.ts (GENERATED, overwritten) ─────
//
// client.ts는 config 주입 팩토리라 비즈니스 로직(인증·hooks·prefix)을 담지 않는다 —
// 앱이 createApiClient(config)로 주입한다. 따라서 결정적이며 매 실행 덮어써도 안전.
// index.ts도 generated 산출물(client 헬퍼·endpoints·types·services)만 re-export한다.

// _generated/index.ts barrel: client 헬퍼 + endpoints + 전체 DTO 타입 + 모든 service를
// re-export (공개 import 표면 = @/http/_generated). client/endpoints/types/services가
// 모두 같은 _generated/ 안에 있으므로 상대 경로는 형제 참조다. services는 spec에 따라
// 늘고 줄므로 services/index.ts를 거쳐 끌어와 항상 동기화된다.
function renderIndexFile() {
  return `${GEN_HEADER}

export { getApi, resetApiInstance, createApiClient } from "./client";
export type { ApiClientConfig } from "./client";
export { endpoints } from "./endpoints";
export type * from "./types";
export * from "./services";
`;
}

// _generated/services/index.ts: 모든 service 파일을 re-export하는 GENERATED 배럴.
// 매 실행 덮어쓰기되어 tag 추가/삭제가 즉시 반영된다.
function renderServicesBarrel(serviceFiles) {
  if (serviceFiles.length === 0) {
    return `${GEN_HEADER}\n\nexport {};\n`;
  }
  const lines = [...serviceFiles]
    .map((f) => path.basename(f.path, ".ts"))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => `export * from "./${name}";`);
  return `${GEN_HEADER}\n\n${lines.join("\n")}\n`;
}

function renderClientFile() {
  return `${GEN_HEADER}

import ky, { type Hooks, type KyInstance, type Options } from "ky";

const API_PROXY_PATH = "/api/proxy";

// 재시도는 ky(transport) 레이어에 일원화한다. ky는 SSR·route handler·브라우저 등
// 모든 호출부를 덮으므로 단일 권위로 두기 적합하다. TanStack Query를 쓰면 RQ의 기본
// 재시도(3회)와 곱해져 요청이 폭증하므로, QueryClient에서 \`retry: false\`로 끈다.
const DEFAULT_RETRY: Options["retry"] = {
  limit: 2,
  methods: ["get"],
  statusCodes: [408, 429, 500, 502, 503, 504],
};

// 앱별로 다르게 주입하는 설정. 모노레포에서 공유 패키지를 쓸 때 apps/a·apps/b가
// 각자 apiUrl·proxyPath·hooks(인증·401 refresh·인터셉터)를 넘겨 동일 service를
// 서로 다른 설정으로 공유한다.
export interface ApiClientConfig {
  apiUrl?: string; // 서버사이드 base URL (브라우저는 proxyPath를 거치므로 무시)
  proxyPath?: string; // 브라우저 프록시 경로 (기본 \`/api/proxy\`)
  hooks?: Hooks; // ky hooks — 인증 헤더·401 refresh·인터셉터
  retry?: Options["retry"]; // 기본 override
  timeout?: Options["timeout"];
  headers?: Record<string, string>;
}

// 브라우저는 proxyPath를 거치므로 apiUrl을 무시하고, 서버(SSR·route handler)에서만
// apiUrl로 백엔드에 직통한다.
function getPrefix(apiUrl: string, proxyPath: string): string {
  if (typeof window !== "undefined") {
    return \`\${window.location.origin}\${proxyPath}\`;
  }

  if (!apiUrl) {
    throw new Error("server-side API base URL is required");
  }
  return apiUrl;
}

// config를 주입받아 KyInstance를 만든다. 멀티 앱은 각 앱이 자기 config로 호출한다.
export function createApiClient(config: ApiClientConfig = {}): KyInstance {
  return ky.create({
    prefix: getPrefix(config.apiUrl ?? "", config.proxyPath ?? API_PROXY_PATH),
    retry: config.retry ?? DEFAULT_RETRY,
    timeout: config.timeout ?? 30_000,
    headers: { Accept: "application/json", ...config.headers },
    hooks: config.hooks,
  });
}

// 단일 앱 편의용 싱글톤. 최초 1회 config로 초기화되고 이후 동일 인스턴스를 반환한다.
// 멀티 앱이면 각 앱이 createApiClient(config)로 자기 인스턴스를 만들어 쓰는 걸 권장.
let api: KyInstance | null = null;

export function getApi(config?: ApiClientConfig): KyInstance {
  if (api === null) {
    api = createApiClient(config);
  }
  return api;
}

export function resetApiInstance(): void {
  api = null;
}
`;
}

// ─── Main ───────────────────────────────────────────────────────────────────

// Resolve the consuming project's root, starting from the current working
// directory. The script is referenced via ${CLAUDE_PLUGIN_ROOT} while cwd stays
// in the project (see SKILL.md), so cwd is the natural anchor — but walking up
// to the nearest `package.json` makes it robust to being run from a
// subdirectory. Stops at the first `package.json` (the Next.js app root) rather
// than `.git`, so it does not overshoot to a monorepo root. Falls back to cwd.
function findProjectRoot(startDir) {
  let dir = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(dir, "package.json"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }
  return path.resolve(startDir);
}

async function runOne({ spec: specArg, outDir, dryRun }) {
  const projectRoot = outDir
    ? path.resolve(process.cwd(), outDir)
    : findProjectRoot(process.cwd());
  const { spec, source } = await loadSpec(specArg, projectRoot);
  validateOpenApi(spec);

  const schemas = spec.components?.schemas ?? {};
  const operations = collectOperations(spec.paths ?? {});
  const namedOperations = assignOpNames(operations);

  const typesContent = renderTypesFile(schemas);
  const endpointsContent = renderEndpointsFile(namedOperations);
  const serviceGroups = groupOperationsByTag(namedOperations);

  const httpDir = path.join(projectRoot, "src", "http");
  const genDir = path.join(httpDir, "_generated");
  const clientPath = path.join(genDir, "client.ts");
  const indexPath = path.join(genDir, "index.ts");
  const typesPath = path.join(genDir, "types.ts");
  const endpointsPath = path.join(genDir, "endpoints.ts");
  const servicesDir = path.join(genDir, "services");
  const servicesIndexPath = path.join(servicesDir, "index.ts");
  const schemaCount = Object.keys(schemas).length;

  const serviceFiles = [...serviceGroups.entries()].map(([tag, ops]) => ({
    tag,
    count: ops.length,
    path: path.join(servicesDir, `${kebabCase(tag)}.ts`),
    content: renderServiceFile(tag, ops),
  }));

  if (dryRun) {
    console.log(
      `[dry-run] would write: ${path.relative(projectRoot, clientPath)} (client factory)`,
    );
    console.log(
      `[dry-run] would write: ${path.relative(projectRoot, typesPath)} (${schemaCount} schemas)`,
    );
    console.log(
      `[dry-run] would write: ${path.relative(projectRoot, endpointsPath)} (${operations.length} operations)`,
    );
    for (const f of serviceFiles) {
      console.log(
        `[dry-run] would write: ${path.relative(projectRoot, f.path)} (${f.count} methods, tag: ${f.tag})`,
      );
    }
    console.log(
      `[dry-run] would write: ${path.relative(projectRoot, servicesIndexPath)} (${serviceFiles.length} services barrel)`,
    );
    console.log(
      `[dry-run] would write: ${path.relative(projectRoot, indexPath)} (barrel)`,
    );
    console.log(`Spec: ${path.relative(projectRoot, source)}`);
    return;
  }

  fs.mkdirSync(genDir, { recursive: true });
  fs.writeFileSync(clientPath, renderClientFile());
  fs.writeFileSync(typesPath, typesContent);
  fs.writeFileSync(endpointsPath, endpointsContent);

  // Clear stale service files (tag renames between runs would otherwise leave orphans)
  fs.mkdirSync(servicesDir, { recursive: true });
  for (const entry of fs.readdirSync(servicesDir)) {
    if (entry.endsWith(".ts")) {
      fs.unlinkSync(path.join(servicesDir, entry));
    }
  }
  for (const f of serviceFiles) {
    fs.writeFileSync(f.path, f.content);
  }
  fs.writeFileSync(servicesIndexPath, renderServicesBarrel(serviceFiles));
  fs.writeFileSync(indexPath, renderIndexFile());

  console.log(
    `Generated: ${path.relative(projectRoot, clientPath)} (client factory)`,
  );
  console.log(
    `Generated: ${path.relative(projectRoot, typesPath)} (${schemaCount} schemas)`,
  );
  console.log(
    `Generated: ${path.relative(projectRoot, endpointsPath)} (${operations.length} operations)`,
  );
  for (const f of serviceFiles) {
    console.log(
      `Generated: ${path.relative(projectRoot, f.path)} (${f.count} methods)`,
    );
  }
  console.log(
    `Generated: ${path.relative(projectRoot, servicesIndexPath)} (${serviceFiles.length} services barrel)`,
  );
  console.log(`Generated: ${path.relative(projectRoot, indexPath)} (barrel)`);
  console.log(`Spec: ${path.relative(projectRoot, source)}`);
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.config) {
    const targets = loadConfig(args.config);
    console.log(
      `Config: ${args.config} — ${targets.length} target${targets.length === 1 ? "" : "s"}`,
    );
    for (const t of targets) {
      console.log(`\n=== ${t.spec} → ${t.outDir} ===`);
      await runOne({ spec: t.spec, outDir: t.outDir, dryRun: args.dryRun });
    }
    return;
  }

  await runOne({ spec: args.spec, outDir: args.outDir, dryRun: args.dryRun });
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
