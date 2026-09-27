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
 */

const FOLDER_FILE_CATEGORY = "kelo:folder-file";

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
    },
  };
}

function convertSelector(selector, classification) {
  const { fileTypes, excludedCategories } = classification;
  const s = typeof selector === "string" ? { type: selector } : selector;
  if (!s || typeof s !== "object" || "element" in s || "file" in s) {
    return [s];
  }
  const { type, ...rest } = s;
  const types = Array.isArray(type) ? type : [type];
  const folderTypes = types.filter((t) => !fileTypes.has(t));
  const categories = types.filter((t) => fileTypes.has(t));
  const out = [];
  for (const folderType of folderTypes) {
    const element = { ...rest, type: folderType };
    const excluded = excludedCategories.get(folderType) ?? [];
    out.push(
      excluded.length === 0
        ? { element }
        : { element, file: { categories: { noneOf: excluded } } },
    );
  }
  if (categories.length > 0) {
    out.push({ file: { categories } });
  }
  return out;
}

function convertSide(value, classification) {
  const list = (Array.isArray(value) ? value : [value]).flatMap((s) =>
    convertSelector(s, classification),
  );
  return list.length === 1 ? list[0] : list;
}

function convertClause(clause, classification) {
  if (!clause || typeof clause !== "object") return clause;
  if (Array.isArray(clause))
    return clause.map((c) => convertClause(c, classification));
  const next = { ...clause };
  if ("to" in next) next.to = convertSide(next.to, classification);
  if ("from" in next) next.from = convertSide(next.from, classification);
  return next;
}

export function toBoundariesPolicies(
  rules,
  classification = { fileTypes: new Set(), excludedCategories: new Map() },
) {
  return rules.map((rule) => {
    const policy = { ...rule };
    if ("from" in policy)
      policy.from = convertSide(policy.from, classification);
    if ("to" in policy) policy.to = convertSide(policy.to, classification);
    if ("allow" in policy)
      policy.allow = convertClause(policy.allow, classification);
    if ("disallow" in policy) {
      policy.disallow = convertClause(policy.disallow, classification);
    }
    return policy;
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
