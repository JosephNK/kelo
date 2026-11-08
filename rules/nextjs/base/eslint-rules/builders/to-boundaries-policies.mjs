/**
 * boundary 데이터(v6 형태)를 eslint-plugin-boundaries v7 설정으로 변환한다.
 * 데이터 파일은 v6 형태를 유지해 reference 문서 generator가 그대로 읽게 하고,
 * 설정을 만들 때만 변환한다.
 *
 * - element: v7은 폴더 단위 매칭만 지원(`mode` deprecated). `mode: "full"`로
 *   단일 파일을 레이어로 지정한 element는 file descriptor(`boundaries/files`,
 *   category = 기존 type)로 옮긴다. 나머지는 `mode` 없이 폴더 element로 둔다.
 * - 정책: `rules` → `policies`. 선택자의 type 중 파일 레이어는
 *   `{ file: { categories } }`, 폴더 레이어는 `{ element: { type } }`로 바꾼다.
 * - 내부 의존: internalDependencyOptions 참조.
 * - v6 분류는 "목록에서 먼저 맞는 element 하나"였다. 이를 유지하려고
 *   file descriptor는 `stopMatching`(첫 카테고리만)으로 두고, 폴더 레이어
 *   파일에는 기본 카테고리를 붙이고, 폴더 레이어 선택자는 목록상 앞선 파일
 *   레이어 카테고리를 `noneOf`로 제외한다
 *   (예: `src/app/**\/route.ts`는 `page` 폴더 안이지만 `route-handler`로만 취급).
 * - 모듈 격리: `capture: ["module"]`을 가진 element가 모듈 레이어다. 규칙의
 *   `scope: "module"`은 모듈 레이어로 가는 `to`에 `captured.module`을 from의
 *   모듈로 묶고(같은 모듈만), `scope: "cross-module"`은 묶지 않는다(어느 모듈이든).
 *   `scope`가 없으면 기존과 같다 (kelo.lint.json 프로젝트 규칙 포함).
 */

const FOLDER_FILE_CATEGORY = "kelo:folder-file";
const MODULE_CAPTURE = "module";
const EMPTY_CLASSIFICATION = {
  fileTypes: new Set(),
  excludedCategories: new Map(),
  moduleTypes: new Set(),
};

export function splitBoundaryElements(elements) {
  const folderElements = [];
  const fileDescriptors = [];
  // 폴더 레이어 type → 목록상 그보다 앞선 파일 레이어 카테고리 (v6 first-match 재현)
  const excludedCategories = new Map();
  for (const { mode, ...element } of elements) {
    if (mode === "full") {
      const { type, pattern, ...rest } = element;
      fileDescriptors.push({
        ...rest,
        pattern,
        category: type,
        stopMatching: true,
      });
    } else {
      folderElements.push(element);
      excludedCategories.set(
        element.type,
        fileDescriptors.map((d) => d.category),
      );
    }
  }
  // 폴더 레이어 파일에도 카테고리를 붙여(null 방지) `noneOf` 제외가 동작하게 한다.
  // 폴더 element 아래만 대상이라, 어느 element에도 속하지 않는 파일은 여전히
  // no-unknown-files로 잡힌다.
  for (const element of folderElements) {
    const patterns = Array.isArray(element.pattern)
      ? element.pattern
      : [element.pattern];
    fileDescriptors.push({
      pattern: patterns.map((p) => `${p}/**`),
      category: FOLDER_FILE_CATEGORY,
      stopMatching: true,
    });
  }
  return {
    folderElements,
    fileDescriptors,
    classification: {
      fileTypes: new Set(
        fileDescriptors
          .map((d) => d.category)
          .filter((c) => c !== FOLDER_FILE_CATEGORY),
      ),
      excludedCategories,
      moduleTypes: new Set(
        elements
          .filter((e) => e.capture?.includes(MODULE_CAPTURE))
          .map((e) => e.type),
      ),
    },
  };
}

const typesOf = (side) =>
  (Array.isArray(side) ? side : [side])
    .map((s) => (typeof s === "string" ? s : s?.type))
    .flat()
    .filter((t) => typeof t === "string");

/** from 파일의 모듈을 가리키는 템플릿 (파일 레이어는 file, 폴더 레이어는 element의 captured). */
function moduleTemplate(fromType, classification) {
  if (!classification.moduleTypes?.has(fromType)) return null;
  const source = classification.fileTypes.has(fromType) ? "file" : "element";
  return `{{from.${source}.captured.${MODULE_CAPTURE}}}`;
}

/**
 * `sameModule`(from 모듈 템플릿)이 있으면 모듈 레이어 대상에 `captured.module`
 * 조건을 붙인다. 공유 레이어 대상은 그대로.
 */
function convertSelector(selector, classification, sameModule = null) {
  const { fileTypes, excludedCategories } = classification;
  const moduleTypes = classification.moduleTypes ?? new Set();
  const s = typeof selector === "string" ? { type: selector } : selector;
  if (!s || typeof s !== "object" || "element" in s || "file" in s) {
    return [s];
  }
  const { type, ...rest } = s;
  const types = Array.isArray(type) ? type : [type];
  const bind = (t) => sameModule !== null && moduleTypes.has(t);
  const captured = { [MODULE_CAPTURE]: sameModule };
  const folderTypes = types.filter((t) => !fileTypes.has(t));
  const categories = types.filter((t) => fileTypes.has(t));
  const out = [];
  for (const folderType of folderTypes) {
    const element = {
      ...rest,
      type: folderType,
      ...(bind(folderType) ? { captured } : {}),
    };
    const excluded = excludedCategories.get(folderType) ?? [];
    out.push(
      excluded.length === 0
        ? { element }
        : { element, file: { categories: { noneOf: excluded } } },
    );
  }
  const boundCategories = categories.filter(bind);
  const freeCategories = categories.filter((t) => !bind(t));
  if (freeCategories.length > 0) {
    out.push({ file: { categories: freeCategories } });
  }
  if (boundCategories.length > 0) {
    out.push({ file: { categories: boundCategories, captured } });
  }
  return out;
}

function convertSide(value, classification, sameModule = null) {
  const list = (Array.isArray(value) ? value : [value]).flatMap((s) =>
    convertSelector(s, classification, sameModule),
  );
  return list.length === 1 ? list[0] : list;
}

function convertClause(clause, classification, sameModule = null) {
  if (!clause || typeof clause !== "object") return clause;
  if (Array.isArray(clause))
    return clause.map((c) => convertClause(c, classification, sameModule));
  const next = { ...clause };
  if ("to" in next) next.to = convertSide(next.to, classification, sameModule);
  if ("from" in next) next.from = convertSide(next.from, classification);
  return next;
}

function convertRule(rule, classification, sameModule = null) {
  const { scope: _scope, ...policy } = rule;
  if ("from" in policy) policy.from = convertSide(policy.from, classification);
  if ("to" in policy) policy.to = convertSide(policy.to, classification);
  if ("allow" in policy)
    policy.allow = convertClause(policy.allow, classification, sameModule);
  if ("disallow" in policy) {
    policy.disallow = convertClause(
      policy.disallow,
      classification,
      sameModule,
    );
  }
  return policy;
}

/**
 * `scope: "module"` 규칙은 from type마다 정책을 나눠 from의 모듈 템플릿을 붙인다
 * (파일·폴더 레이어는 템플릿 경로가 다르다).
 */
function expandModuleRule(rule, classification) {
  const fromTypes = typesOf(rule.from);
  if (fromTypes.length === 0) return [convertRule(rule, classification)];
  const others =
    rule.from && typeof rule.from === "object" && !Array.isArray(rule.from)
      ? rule.from
      : {};
  return fromTypes.map((type) =>
    convertRule(
      { ...rule, from: { ...others, type } },
      classification,
      moduleTemplate(type, classification),
    ),
  );
}

/**
 * v6 규칙 → v7 정책. 순서: 레이어 규칙(같은 모듈 한정 포함) → 모듈 간 공개 계약
 * (`scope: "cross-module"`). 모두 허용 정책이라 순서는 가독성용이다.
 */
export function toBoundariesPolicies(
  rules,
  classification = EMPTY_CLASSIFICATION,
) {
  const cross = rules.filter((r) => r.scope === "cross-module");
  const layer = rules.filter((r) => r.scope !== "cross-module");
  return [
    ...layer.flatMap((rule) =>
      rule.scope === "module"
        ? expandModuleRule(rule, classification)
        : [convertRule(rule, classification)],
    ),
    ...cross.map((rule) => convertRule(rule, classification)),
  ];
}

const sortedList = (set) => [...set].sort().join(", ");

/**
 * 안내 메시지의 허용 목록. 모듈 레이어는 같은 모듈 / 다른 모듈 / 공유로 나눈다
 * (`scope: "module"` 대상은 같은 모듈만, 그 외 모듈 레이어 대상은 어느 모듈이든).
 */
function allowText(type, entry, classification) {
  const all = new Set([...entry.same, ...entry.any, ...entry.shared]);
  if (all.size === 0) return `${type}는 다른 레이어를 import할 수 없습니다.`;
  if (!classification.moduleTypes?.has(type)) {
    return `${type}가 import할 수 있는 레이어: ${sortedList(all)}.`;
  }
  const same = new Set([...entry.same, ...entry.any]);
  const parts = [
    `같은 모듈: ${same.size ? sortedList(same) : "없음"}`,
    `다른 모듈: ${entry.any.size ? sortedList(entry.any) : "없음"}`,
  ];
  if (entry.shared.size) parts.push(`공유: ${sortedList(entry.shared)}`);
  return `${type}가 import할 수 있는 레이어 — ${parts.join(" / ")}.`;
}

/**
 * 레이어마다 "전부 금지 + 안내 메시지" 정책을 만든다. 정책은 뒤에서 매칭된 것이
 * 이기므로 이 정책들을 허용 정책보다 앞에 두면, 허용되지 않은 import만 이 정책에
 * 걸려 레이어별 메시지(허용 레이어 목록 포함)가 나온다.
 */
export function guidancePolicies(
  rules,
  elements,
  classification = EMPTY_CLASSIFICATION,
) {
  const moduleTypes = classification.moduleTypes ?? new Set();
  const allowed = new Map();
  for (const rule of rules) {
    const targets = (Array.isArray(rule.allow) ? rule.allow : [rule.allow])
      .filter(Boolean)
      .flatMap((a) => typesOf(a.to));
    for (const from of typesOf(rule.from)) {
      if (!allowed.has(from)) {
        allowed.set(from, {
          same: new Set(),
          any: new Set(),
          shared: new Set(),
        });
      }
      const entry = allowed.get(from);
      const sameOnly = rule.scope === "module" && moduleTypes.has(from);
      for (const to of targets) {
        if (!moduleTypes.has(to)) entry.shared.add(to);
        else (sameOnly ? entry.same : entry.any).add(to);
      }
    }
  }
  const empty = { same: new Set(), any: new Set(), shared: new Set() };
  const types = [...new Set(elements.map((e) => e.type))];
  return types.map((type) => {
    const text = allowText(type, allowed.get(type) ?? empty, classification);
    return {
      from: convertSide({ type }, classification),
      disallow: [
        { to: { element: { type: "*" } } },
        { to: { file: { categories: "*" } } },
      ],
      message: `[경계 위반] ${type} 레이어에서 '{{dependency.source}}'를 import할 수 없습니다. ${text} 레이어별 폴더 위치는 docs/ARCHITECTURE.md 참고.`,
    };
  });
}

/**
 * 파일 레이어가 있으면 같은 폴더 element 안의 파일이 서로 다른 레이어일 수 있다
 * (예: `page` 폴더 안의 `route.ts`). v7은 같은 element 내부 의존을 기본으로
 * 검사하지 않으므로 `checkInternals`를 켜고, v6에서 검사하지 않던
 * "일반 폴더 파일끼리의 내부 의존"은 자동 허용해 결과를 v6과 같게 유지한다.
 */
export function internalDependencyOptions(folderElements, classification) {
  if (classification.fileTypes.size === 0) {
    return { checkInternals: false, policies: [] };
  }
  const folderFile = { categories: FOLDER_FILE_CATEGORY };
  const policies = [...new Set(folderElements.map((e) => e.type))].map(
    (type) => ({
      from: { element: { type }, file: folderFile },
      allow: {
        to: { element: { type }, file: folderFile },
        dependency: { relationship: { to: "internal" } },
      },
    }),
  );
  return { checkInternals: true, policies };
}
