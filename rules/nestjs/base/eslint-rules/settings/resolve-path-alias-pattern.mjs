import fs from "node:fs";
import path from "node:path";

import { basePathAliasPattern } from "./path-alias-pattern.mjs";

/**
 * 소비 프로젝트 package.json의 `kelo-rules.pathAliasCheck`(레거시 `jkit-rules`)를 읽어
 * `basePathAliasPattern` 또는 `null`을 반환. ESLint config 로드 시점에
 * 평가되므로 package.json만 수정하면 재생성(sync/init) 없이 토글된다.
 *
 * 기본값: 검사 활성. `pathAliasCheck: false`일 때만 `null` 반환 → `../**`
 * 차단 패턴이 buildLayerRestrictions의 patterns 배열에서 제외된다.
 */
export function resolvePathAliasPattern(rootDir = process.cwd()) {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(rootDir, "package.json"), "utf8"),
    );
    const options = pkg?.["kelo-rules"] ?? pkg?.["jkit-rules"];
    if (options?.pathAliasCheck === false) return null;
  } catch {
    /* package.json 없거나 파싱 실패 → 기본값 유지 */
  }
  return basePathAliasPattern;
}
