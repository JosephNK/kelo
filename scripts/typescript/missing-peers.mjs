#!/usr/bin/env node
// =============================================================================
// peer 보강 명령에 넘길 패키지 중 실제로 설치가 필요한 것만 출력한다.
//   - package.json(dependencies/devDependencies)에 없으면 → 출력
//   - 있고 스펙에 범위가 없으면(`name`) → 건너뜀
//   - 있고 스펙에 범위가 있으면(`name@^7`) → 기존 범위 하한이 그 이상이면 건너뜀
//     (예: 기존 `^16.3.6`은 `eslint-config-next@^16`을 만족하므로 `^16`으로 덮어쓰지 않는다)
//
// Usage:
//   missing-peers.mjs -p <project-dir> <spec>...
//   PEERS=$(missing-peers.mjs -p . eslint-plugin-boundaries@^7 typescript-eslint)
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { compareFloor, rangeFloor } from "../common.mjs";

const HELP = `Usage: missing-peers.mjs -p <project-dir> <spec>...

Prints (space-separated) the specs from <spec>... that still need installing in
<project-dir>/package.json. Already-installed packages whose range satisfies the
requested floor are skipped, so existing ranges are never loosened.
`;

function parseSpec(spec) {
  // @scope/name@range 또는 name@range — 첫 글자 이후의 마지막 '@'가 구분자
  const at = spec.lastIndexOf("@");
  if (at > 0) return { name: spec.slice(0, at), range: spec.slice(at + 1) };
  return { name: spec, range: "" };
}

function main() {
  const argv = process.argv.slice(2);
  let dir = "";
  const specs = [];
  while (argv.length > 0) {
    const a = argv.shift();
    if (a === "-p") dir = argv.shift() ?? "";
    else if (a === "-h" || a === "--help") {
      process.stdout.write(HELP);
      process.exit(0);
    } else specs.push(a);
  }
  if (!dir) {
    process.stderr.write(HELP);
    process.exit(1);
  }

  const pkgPath = path.join(dir, "package.json");
  const pkg = fs.existsSync(pkgPath)
    ? JSON.parse(fs.readFileSync(pkgPath, "utf8"))
    : {};
  const installed = { ...pkg.dependencies, ...pkg.devDependencies };

  const needed = specs.filter((spec) => {
    const { name, range } = parseSpec(spec);
    const current = installed[name];
    if (!current) return true;
    if (!range) return false;
    const want = rangeFloor(range);
    const have = rangeFloor(current);
    // 비교할 수 없는 값(URL·workspace: 등)은 사용자가 의도적으로 지정한 것으로 보고 건드리지 않는다
    if (!want || !have) return false;
    return compareFloor(have, want) < 0;
  });

  process.stdout.write(needed.join(" "));
}

main();
