// node --test test/*.test.mjs
// 문서 대신 테스트로 지키는 저장소 불변식.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

// 두 npm 패키지는 분리 배포라 서로 import할 수 없어 같은 파일을 복사해 둔다.
const SHARED_FILES = [
  "lib/factory-helpers.mjs",
  "lib/run-lint-cli.mjs",
  "base/eslint-rules/builders/to-boundaries-policies.mjs",
  "base/eslint-rules/quality/sonarjs.mjs",
  "base/custom-rules/boundaries-unknown.mjs",
];

for (const file of SHARED_FILES) {
  test(`rules/nextjs·nestjs ${file} 내용이 같다`, () => {
    assert.equal(read(`rules/nextjs/${file}`), read(`rules/nestjs/${file}`));
  });
}

test("Flutter lint 코드 접두어·패키지가 kelo_analysis verify에 등록돼 있다", () => {
  const verify = read(
    "rules/flutter/base/analysis/kelo_analysis/bin/verify.dart",
  );
  const prefixes = [
    ...verify
      .match(/_pluginCodePrefixes = \[([^\]]*)\]/)[1]
      .matchAll(/'([^']+)'/g),
  ].map((m) => m[1]);
  const plugins = [
    ...verify.match(/_keloPlugins = \{([^}]*)\}/)[1].matchAll(/'([^']+)'/g),
  ].map((m) => m[1]);

  const stacks = YAML.parse(read("rules/flutter/stacks.yaml"));
  const packages = [
    {
      name: "architecture_lint",
      path: "rules/flutter/base/custom-lint/architecture_lint",
    },
    ...Object.values(stacks)
      .filter((s) => s?.lintPackage)
      .map((s) => s.lintPackage),
  ];

  for (const pkg of packages) {
    assert.ok(plugins.includes(pkg.name), `_keloPlugins에 ${pkg.name} 없음`);
    const lintsDir = path.join(ROOT, pkg.path, "lib/src/lints");
    for (const file of fs
      .readdirSync(lintsDir)
      .filter((f) => f.endsWith(".dart"))) {
      const src = fs.readFileSync(path.join(lintsDir, file), "utf8");
      for (const [, code] of src.matchAll(
        /LintCode\(\s*['"]([a-z][a-z0-9_]*)['"]/g,
      )) {
        assert.ok(
          prefixes.some((p) => code.startsWith(p)),
          `${pkg.name}/${file}: 코드 ${code}의 접두어가 _pluginCodePrefixes(${prefixes.join(", ")})에 없음`,
        );
      }
    }
  }
});
