// =============================================================================
// Rule: no-nested-feature-dir
// -----------------------------------------------------------------------------
// `src/{domain,http}/<feature>/` 직속에 하위 디렉토리 금지 (flat-only).
//
// boundary `no-unknown-files`는 lint 대상이 된 파일만 검사한다. 빈 폴더나
// boundary pattern에 매치되지 않는 파일로 구성된 폴더의 *디렉토리 존재 자체*는
// 별도 lint 없이는 그대로 통과한다. 이 룰은 sibling 파일이 lint될 때 형제
// 디렉토리를 readdirSync로 스캔해 누락 영역을 보강한다.
//
// 위반 예:
//   src/domain/user/utils/helper.ts   ❌ (utils/ 디렉토리)
//   src/domain/user/types/index.ts    ❌ (types/ 디렉토리)
//   src/http/user/dto/foo.ts          ❌ (dto/ 디렉토리)
//
// 정상 예:
//   src/domain/user/model.ts          ✅
//   src/domain/user/service.ts        ✅
//   src/http/user/repository.ts       ✅
//
// 적용 범위:
//   src/domain/<feature>/   — 직속 하위 폴더 금지
//   src/http/<feature>/     — 직속 하위 폴더 금지
//
// 적용 제외:
//   src/http/_generated/    — generator 산출물 (client.ts·index.ts·types·endpoints·services 전부; 구조 고정, layer root 허용 항목)
//
// 보완 룰:
//   - local/no-unknown-files: 어떤 element pattern에도 매치되지 않는 파일 차단
// =============================================================================

import fs from "node:fs";

const FEATURE_LAYERS = [
  {
    prefix: "/src/domain/",
    layerName: "domain",
    layerRootAllowed: new Set(),
  },
  {
    prefix: "/src/http/",
    layerName: "http",
    layerRootAllowed: new Set(["_generated"]),
  },
];

const reportedDirs = new Set();

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow subdirectories inside src/{domain,http}/<feature>/ folders (flat-only)",
    },
    messages: {
      nestedDir:
        '"{{ subdir }}/" inside src/{{ layer }}/{{ feature }}/ is not allowed. Feature folders are flat — move files directly into <feature>/.',
    },
    schema: [],
  },
  create(context) {
    return {
      Program(node) {
        const filename = context.filename ?? context.getFilename?.() ?? "";
        if (!filename) return;

        let layer = null;
        let prefixIdx = -1;
        for (const candidate of FEATURE_LAYERS) {
          const idx = filename.indexOf(candidate.prefix);
          if (idx !== -1) {
            layer = candidate;
            prefixIdx = idx;
            break;
          }
        }
        if (!layer) return;

        const after = filename.slice(prefixIdx + layer.prefix.length);
        const segments = after.split("/");
        if (segments.length < 2) return;

        const feature = segments[0];
        if (layer.layerRootAllowed.has(feature)) return;

        const featureAbsPath =
          filename.slice(0, prefixIdx + layer.prefix.length) + feature;

        let entries;
        try {
          entries = fs.readdirSync(featureAbsPath, { withFileTypes: true });
        } catch {
          return;
        }

        for (const entry of entries) {
          if (!entry.isDirectory()) continue;

          const dirAbsPath = `${featureAbsPath}/${entry.name}`;
          if (reportedDirs.has(dirAbsPath)) continue;
          reportedDirs.add(dirAbsPath);

          context.report({
            node,
            messageId: "nestedDir",
            data: {
              subdir: entry.name,
              layer: layer.layerName,
              feature,
            },
          });
        }
      },
    };
  },
};
