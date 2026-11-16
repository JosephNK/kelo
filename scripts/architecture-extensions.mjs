// =============================================================================
// ARCHITECTURE.md의 "프로젝트 확장" 섹션 — 프로젝트 `kelo.lint.json`이 추가한
// 레이어·import 규칙·경계 제외를 문서에 드러낸다. 기본 트리는 kelo 기본 규칙만
// 담으므로, 이 섹션이 없으면 문서만 보는 사람·AI가 확장 레이어를 알 수 없다.
// =============================================================================

import fs from "node:fs";
import path from "node:path";

const LINT_CONFIG_FILE = "kelo.lint.json";

const toList = (v) => (v === undefined || v === null ? [] : [v].flat());
const code = (v) => `\`${String(v).replaceAll("|", "\\|")}\``;

// 선택자 형태: "page" | ["page"] | { type: "page" | [...] } | { to|from: { type } }
function selectorTypes(selector) {
  return toList(selector).flatMap((s) => {
    if (typeof s === "string") return [s];
    if (!s || typeof s !== "object") return [];
    if (s.type !== undefined) return toList(s.type).map(String);
    if (s.to !== undefined) return selectorTypes(s.to);
    if (s.from !== undefined) return selectorTypes(s.from);
    return [JSON.stringify(s)];
  });
}

/** `<projectRoot>/kelo.lint.json`을 읽는다. 없거나 깨졌으면 null (lint가 따로 에러를 낸다). */
export function readProjectLintConfig(projectRoot) {
  const file = path.join(projectRoot, LINT_CONFIG_FILE);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/** 확장이 있으면 markdown 섹션 문자열을, 없으면 ""를 돌려준다. */
export function renderProjectExtensions(lintConfig) {
  const elements = lintConfig?.boundaryElements ?? [];
  const rules = lintConfig?.boundaryRules ?? [];
  const ignores = lintConfig?.boundaryIgnores ?? [];
  if (elements.length + rules.length + ignores.length === 0) return "";

  const out = [
    "## 프로젝트 확장",
    "",
    `이 프로젝트가 \`${LINT_CONFIG_FILE}\`으로 kelo 기본 규칙에 추가한 내용이다. 위 트리와 똑같이 lint로 강제된다.`,
  ];

  if (elements.length > 0) {
    out.push(
      "",
      "### 추가 레이어",
      "",
      "| 레이어(type) | 위치 | 단위 |",
      "|---|---|---|",
      ...elements.map(
        (e) =>
          `| ${code(e.type)} | ${toList(e.pattern).map(code).join(", ")} | ${e.mode === "full" ? "파일" : "폴더"} |`,
      ),
    );
  }

  if (rules.length > 0) {
    out.push(
      "",
      "### 추가 import 규칙",
      "",
      "| 레이어 | import할 수 있는 레이어 |",
      "|---|---|",
      ...rules.map((r) => {
        const from = selectorTypes(r.from).map(code).join(", ");
        const allow = selectorTypes(r.allow).map(code).join(", ");
        return `| ${from} | ${allow || "(없음)"} |`;
      }),
    );
  }

  if (ignores.length > 0) {
    out.push(
      "",
      "### 경계 검사 제외",
      "",
      ...ignores.map((p) => `- ${code(p)}`),
    );
  }

  return out.join("\n");
}
