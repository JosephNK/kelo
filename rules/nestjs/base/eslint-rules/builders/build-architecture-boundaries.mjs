import { defineConfig } from "eslint/config";
import boundaries from "eslint-plugin-boundaries";

import { baseBoundaryIgnores } from "../boundaries/boundary-ignores.mjs";
import { baseImportResolverSettings } from "../settings/import-resolver-settings.mjs";
import {
  internalDependencyOptions,
  splitBoundaryElements,
  toBoundariesPolicies,
} from "./to-boundaries-policies.mjs";

/**
 * boundaries 플러그인 룰 생성기. elements ↔ rules 매핑으로
 * from→to 의존을 allow-list 검사 (default: disallow).
 *
 * `root`(소비 프로젝트 루트)를 받으면 그것을 경로 기준으로 삼고, 그 밖으로
 * resolve되는 import(모노레포 형제 workspace 등)는 외부 의존으로 본다.
 * 기준이 `process.cwd()`면 실행 위치에 따라 분류가 달라지고, 바깥 파일을
 * glob ignore로 빼면 경로에 점 디렉터리(`~/.cache/...`)가 끼었을 때 `**`가
 * 건너지 못해 `no-unknown-dependencies`가 오발화한다.
 */
export function buildArchitectureBoundaries(
  elements,
  rules,
  ignores = baseBoundaryIgnores,
  root = undefined,
) {
  const { folderElements, fileDescriptors, classification } =
    splitBoundaryElements(elements);
  const internal = internalDependencyOptions(folderElements, classification);
  return defineConfig({
    plugins: { boundaries },
    settings: {
      ...baseImportResolverSettings,
      "boundaries/elements": folderElements,
      "boundaries/files": fileDescriptors,
      "boundaries/ignore": ignores,
      ...(root
        ? {
            "boundaries/root-path": root,
            "boundaries/flag-as-external": { outsideRootPath: true },
          }
        : {}),
    },
    rules: {
      "boundaries/no-unknown-dependencies": "error",
      "boundaries/no-unknown-files": "error",
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          checkInternals: internal.checkInternals,
          policies: [
            ...toBoundariesPolicies(rules, classification),
            ...internal.policies,
          ],
        },
      ],
    },
  });
}
