#!/usr/bin/env node
// =============================================================================
// kelo GitHub Release tarball 의존성(eslint-config-kelo-*)의 lockfile integrity를
// 점검하고, 빠진 값은 Release 자산을 받아 sha512로 계산해 채운다.
//
//   - 빠짐      → 채운다 (pnpm은 tarball URL 의존성의 integrity를 일정하지 않게 기록한다.
//                 `pnpm install --fix-lockfile`은 이를 채우지 못하고 deprecated 메타데이터만 지운다)
//   - 있음·일치 → 그대로 둔다
//   - 있음·불일치 → 에러 (같은 URL의 Release 자산이 교체됐다는 뜻 — 덮어쓰지 않는다)
//
// 지원: pnpm-lock.yaml (해당 줄만 수정해 파일 포맷 유지), package-lock.json.
// lockfile은 --project-dir부터 git 루트까지 올라가며 찾는다 (모노레포 앱 경로를 줘도 된다).
//
// Usage:
//   fill-tarball-integrity.mjs --project-dir <dir> [--dry-run]
// =============================================================================

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { KELO_RELEASE_BASE } from "../../common.mjs";

const HELP = `Usage: fill-tarball-integrity.mjs --project-dir <dir> [--dry-run]

Checks lockfile integrity of kelo Release tarball dependencies
(${KELO_RELEASE_BASE}/...) and fills missing values with the sha512 of the
downloaded asset. Existing values that do not match the asset are reported
as errors and left unchanged.

Supports pnpm-lock.yaml and package-lock.json (searched from --project-dir up
to the git root).

Options:
  --project-dir <dir>  Project (or monorepo app) directory (required)
  --dry-run            Report only, do not modify the lockfile
  -h, --help           Show this help
`;

function parseArgs(argv) {
  const args = { projectDir: "", dryRun: false };
  const rest = argv.slice(2);
  while (rest.length > 0) {
    const a = rest.shift();
    if (a === "--project-dir") args.projectDir = rest.shift() ?? "";
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "-h" || a === "--help") {
      process.stdout.write(HELP);
      process.exit(0);
    } else {
      process.stderr.write(`Unknown argument: ${a}\n${HELP}`);
      process.exit(1);
    }
  }
  if (!args.projectDir) {
    process.stderr.write(HELP);
    process.exit(1);
  }
  return args;
}

// --project-dir부터 git 루트(.git 보유)까지 올라가며 첫 lockfile을 찾는다.
function findLockfile(start) {
  let dir = path.resolve(start);
  for (;;) {
    for (const name of ["pnpm-lock.yaml", "package-lock.json", "yarn.lock"]) {
      const p = path.join(dir, name);
      if (fs.existsSync(p)) return p;
    }
    if (fs.existsSync(path.join(dir, ".git"))) return null;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const isKeloTarball = (url) => url.startsWith(`${KELO_RELEASE_BASE}/`);

const digestCache = new Map();
async function assetIntegrity(url) {
  if (!digestCache.has(url)) {
    digestCache.set(
      url,
      (async () => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`download failed (${res.status}) ${url}`);
        const buf = Buffer.from(await res.arrayBuffer());
        return `sha512-${crypto.createHash("sha512").update(buf).digest("base64")}`;
      })(),
    );
  }
  return digestCache.get(url);
}

// 한 항목을 판정한다. 반환: { action: "fill"|"ok"|"mismatch"|"error", integrity?, message }
async function check(url, existing) {
  let actual;
  try {
    actual = await assetIntegrity(url);
  } catch (err) {
    return { action: "error", message: err.message };
  }
  if (!existing) return { action: "fill", integrity: actual };
  if (!existing.startsWith("sha512-")) {
    return {
      action: "ok",
      message: `기존 값이 sha512가 아니라 비교 생략 (${existing.split("-")[0]})`,
    };
  }
  return existing === actual
    ? { action: "ok" }
    : {
        action: "mismatch",
        message: `lockfile ${existing}\n              asset    ${actual}`,
      };
}

// pnpm-lock.yaml: `resolution: {tarball: URL}` 줄에 integrity를 앞에 넣는다 (pnpm이 쓰는 순서).
async function processPnpm(file, dryRun) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const RE = /^(\s*resolution: \{)(.*)\}\s*$/;
  const results = [];
  for (let i = 0; i < lines.length; i++) {
    const m = RE.exec(lines[i]);
    if (!m) continue;
    const fields = Object.fromEntries(
      m[2].split(/,\s*/).map((kv) => {
        const at = kv.indexOf(":");
        return [kv.slice(0, at).trim(), kv.slice(at + 1).trim()];
      }),
    );
    if (!fields.tarball || !isKeloTarball(fields.tarball)) continue;
    const r = await check(fields.tarball, fields.integrity);
    results.push({ url: fields.tarball, ...r });
    if (r.action === "fill") {
      lines[i] =
        `${m[1]}integrity: ${r.integrity}, tarball: ${fields.tarball}}`;
    }
  }
  if (!dryRun && results.some((r) => r.action === "fill")) {
    fs.writeFileSync(file, lines.join("\n"));
  }
  return results;
}

// package-lock.json: packages[*].resolved가 kelo tarball인 항목의 integrity를 채운다.
async function processNpm(file, dryRun) {
  const lock = JSON.parse(fs.readFileSync(file, "utf8"));
  const results = [];
  for (const entry of Object.values(lock.packages ?? {})) {
    if (!entry?.resolved || !isKeloTarball(entry.resolved)) continue;
    const r = await check(entry.resolved, entry.integrity);
    results.push({ url: entry.resolved, ...r });
    if (r.action === "fill") entry.integrity = r.integrity;
  }
  if (!dryRun && results.some((r) => r.action === "fill")) {
    fs.writeFileSync(file, JSON.stringify(lock, null, 2) + "\n");
  }
  return results;
}

async function main() {
  const args = parseArgs(process.argv);
  const lockfile = findLockfile(args.projectDir);
  if (!lockfile) {
    process.stderr.write(
      `Error: lockfile을 찾지 못했습니다 (${args.projectDir}부터 git 루트까지)\n`,
    );
    process.exit(1);
  }
  const name = path.basename(lockfile);
  if (name === "yarn.lock") {
    process.stdout.write(
      `yarn.lock은 지원하지 않습니다 — 건너뜁니다 (${lockfile})\n`,
    );
    return;
  }

  process.stdout.write(
    `Lockfile: ${lockfile}${args.dryRun ? " (dry-run)" : ""}\n`,
  );
  const results =
    name === "pnpm-lock.yaml"
      ? await processPnpm(lockfile, args.dryRun)
      : await processNpm(lockfile, args.dryRun);

  if (results.length === 0) {
    process.stdout.write("  kelo Release tarball 의존성이 없습니다.\n");
    return;
  }
  const label = {
    fill: args.dryRun ? "Would fill" : "Filled",
    ok: "OK",
    mismatch: "MISMATCH",
    error: "ERROR",
  };
  for (const r of results) {
    const short = r.url.slice(KELO_RELEASE_BASE.length + 1);
    process.stdout.write(`  ${label[r.action].padEnd(10)} ${short}\n`);
    if (r.message) process.stdout.write(`              ${r.message}\n`);
  }

  if (results.some((r) => r.action === "mismatch")) {
    process.stderr.write(
      "\nlockfile integrity가 Release 자산과 다릅니다. 자산이 교체됐는지 확인하세요 (자동으로 덮어쓰지 않음).\n",
    );
  }
  if (results.some((r) => r.action === "mismatch" || r.action === "error")) {
    process.exit(1);
  }
}

main();
