#!/usr/bin/env node
// =============================================================================
// Bumps the plugin version, commits, tags, and pushes in one shot.
//
// Usage:
//   deploy.mjs [<version>|patch|minor|major] [--yes] [--otp <code>] [--no-publish] [--no-release]
// =============================================================================

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const HELP = `Usage: ./deploy.mjs [<version>|patch|minor|major] [--yes] [--otp <code>] [--no-publish] [--no-release]

Bumps the plugin version, commits, tags, pushes, publishes the ESLint config
packages to the npm registry, and creates the GitHub Release in one shot.

Updates:
  - .codex-plugin/plugin.json             (version)
  - .claude-plugin/plugin.json            (version)
  - .claude-plugin/marketplace.json       (version)
  - .agents/plugins/marketplace.json      (version)
  - package.json                          (version)
  - rules/nextjs/package.json             (version — eslint-config-kelo-nextjs)
  - rules/nestjs/package.json             (version — eslint-config-kelo-nestjs)
  - rules/flutter/base/custom-lint/architecture_lint/pubspec.yaml      (version)
  - rules/flutter/leaf-kit/custom-lint/leaf_kit_lint/pubspec.yaml      (version)
  - rules/flutter/freezed/custom-lint/freezed_lint/pubspec.yaml        (version)
  - rules/flutter/base/analysis/kelo_analysis/pubspec.yaml             (version)

Then:
  - git add + commit "chore: 버전 <new> 범프"
  - git tag v<new>
  - npm publish ./rules/nextjs, ./rules/nestjs → npm registry (needs 'npm login')
  - git push origin <branch> --follow-tags   (after publish — on failure the remote is untouched)
  - npm pack ./rules/nextjs, ./rules/nestjs → GitHub Release v<new> assets (gh)

Arguments:
  <version>  Explicit version (e.g. 0.1.28)
  patch      Increment patch (0.1.27 → 0.1.28) [default]
  minor      Increment minor (0.1.27 → 0.2.0)
  major      Increment major (0.1.27 → 1.0.0)

Options:
  --yes, -y     Skip confirmation prompt
  --otp <code>  npm 2FA one-time password, passed to every npm publish.
                Required when npm 2FA covers writes and stdin is not a TTY
                (e.g. Claude Code '!' commands) — npm can't prompt there.
  --no-publish  Skip npm publish
  --no-release  Skip the GitHub Release
  -h, --help Show this help

Examples:
  ./deploy.mjs
  ./deploy.mjs patch
  ./deploy.mjs 0.1.28
  ./deploy.mjs minor --yes
  ./deploy.mjs patch --yes --otp 123456
`;

function usage(code = 1) {
  (code === 0 ? process.stdout : process.stderr).write(HELP);
  process.exit(code);
}

function parseArgs(argv) {
  const args = {
    bump: "patch",
    explicitVersion: "",
    yes: false,
    otp: "",
    publish: true,
    release: true,
  };
  const rest = argv.slice(2);

  while (rest.length > 0) {
    const a = rest.shift();
    switch (a) {
      case "patch":
      case "minor":
      case "major":
        args.bump = a;
        break;
      case "--yes":
      case "-y":
        args.yes = true;
        break;
      case "--otp":
        args.otp = rest.shift() ?? "";
        if (!/^\d{6,8}$/.test(args.otp)) {
          process.stderr.write("Error: --otp needs a 6-8 digit code\n");
          usage();
        }
        break;
      case "--no-publish":
        args.publish = false;
        break;
      case "--no-release":
        args.release = false;
        break;
      case "-h":
      case "--help":
        usage(0);
        break;
      default:
        if (/^\d+\.\d+\.\d+$/.test(a)) {
          args.explicitVersion = a;
        } else {
          process.stderr.write(`Unknown argument: ${a}\n`);
          usage();
        }
    }
  }

  return args;
}

function git(argsArray) {
  return execFileSync("git", argsArray, { encoding: "utf-8" }).trim();
}

function gitSafe(argsArray) {
  try {
    return execFileSync("git", argsArray, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function gitExists(argsArray) {
  const r = spawnSync("git", argsArray, { stdio: "ignore" });
  return r.status === 0;
}

async function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function computeNewVersion(current, bump) {
  const parts = current.split(".").map((x) => parseInt(x, 10));
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    process.stderr.write(
      `Error: unable to parse current version "${current}"\n`,
    );
    process.exit(1);
  }
  let [maj, min, pat] = parts;
  switch (bump) {
    case "patch":
      pat += 1;
      break;
    case "minor":
      min += 1;
      pat = 0;
      break;
    case "major":
      maj += 1;
      min = 0;
      pat = 0;
      break;
  }
  return `${maj}.${min}.${pat}`;
}

function updateJsonVersion(filePath, newVersion) {
  if (!fs.existsSync(filePath)) {
    process.stdout.write(`  Skipped ${filePath} (not found)\n`);
    return;
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  const data = JSON.parse(raw);
  if ("version" in data) {
    data.version = newVersion;
  }
  if (Array.isArray(data.plugins)) {
    for (const plugin of data.plugins) {
      if (plugin && plugin.name === "kelo") {
        plugin.version = newVersion;
      }
    }
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
  process.stdout.write(`  Updated ${filePath}\n`);
}

function updateYamlVersion(filePath, newVersion) {
  if (!fs.existsSync(filePath)) {
    process.stdout.write(`  Skipped ${filePath} (not found)\n`);
    return;
  }
  const txt = fs.readFileSync(filePath, "utf-8");
  const re = /^(version:\s*)[\d.]+(?:[-+][\w.]+)?/m;
  if (!re.test(txt)) {
    process.stderr.write(`Failed to find version: field in ${filePath}\n`);
    process.exit(1);
  }
  const newTxt = txt.replace(re, `$1${newVersion}`);
  fs.writeFileSync(filePath, newTxt);
  process.stdout.write(`  Updated ${filePath} (version → ${newVersion})\n`);
}

async function main() {
  const args = parseArgs(process.argv);

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  process.chdir(scriptDir);

  // Safety checks
  const status = gitSafe(["status", "--porcelain"]);
  if (status) {
    process.stderr.write(
      "Error: working tree has uncommitted changes. Commit or stash first.\n",
    );
    spawnSync("git", ["status", "--short"], { stdio: "inherit" });
    process.exit(1);
  }

  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch !== "main") {
    process.stdout.write(
      `Warning: current branch is '${branch}', not 'main'.\n`,
    );
    if (!args.yes) {
      const ans = await prompt("Continue anyway? [y/N] ");
      if (!/^[Yy]$/.test(ans)) process.exit(1);
    }
  }

  const codexPluginJsonPath = ".codex-plugin/plugin.json";
  const pluginJsonPath = ".claude-plugin/plugin.json";
  const marketplaceJsonPath = ".claude-plugin/marketplace.json";
  const agentsMarketplaceJsonPath = ".agents/plugins/marketplace.json";
  const rootPackageJsonPath = "package.json";
  const npmPackageDirs = ["rules/nextjs", "rules/nestjs"];
  const npmPackageJsonPaths = npmPackageDirs.map((d) => `${d}/package.json`);
  const architectureLintPubspecPath =
    "rules/flutter/base/custom-lint/architecture_lint/pubspec.yaml";
  const leafKitLintPubspecPath =
    "rules/flutter/leaf-kit/custom-lint/leaf_kit_lint/pubspec.yaml";
  const freezedLintPubspecPath =
    "rules/flutter/freezed/custom-lint/freezed_lint/pubspec.yaml";
  const keloAnalysisPubspecPath =
    "rules/flutter/base/analysis/kelo_analysis/pubspec.yaml";

  const current = JSON.parse(fs.readFileSync(pluginJsonPath, "utf-8")).version;
  process.stdout.write(`Current version: ${current}\n`);

  const newVersion =
    args.explicitVersion || computeNewVersion(current, args.bump);
  const tag = `v${newVersion}`;

  if (newVersion === current) {
    process.stderr.write(
      `Error: new version equals current version (${current})\n`,
    );
    process.exit(1);
  }

  if (gitExists(["rev-parse", "--verify", "--quiet", tag])) {
    process.stderr.write(`Error: tag ${tag} already exists\n`);
    process.exit(1);
  }

  // GitHub Release는 태그 push 이후에 만들어지므로, 인증 문제로 중간에
  // 실패하지 않도록 시작 전에 gh 로그인 상태를 확인한다.
  if (args.release) {
    const auth = spawnSync("gh", ["auth", "status"], { encoding: "utf-8" });
    if (auth.status !== 0) {
      process.stderr.write(
        "Error: gh CLI 인증이 필요합니다. 'gh auth login' 후 다시 실행하거나 --no-release를 사용하세요.\n",
      );
      process.exit(1);
    }
  }

  // 소비 프로젝트는 npm 레지스트리 버전을 의존성으로 쓴다 (scripts/common.mjs keloPackageSpec).
  // 버전 파일을 고치기 전에 npm 로그인·2FA 입력 가능 여부·버전 중복을 확인한다.
  if (args.publish) {
    const who = spawnSync("npm", ["whoami"], { encoding: "utf-8" });
    if (who.status !== 0) {
      process.stderr.write(
        "Error: npm 로그인이 필요합니다. 'npm login' 후 다시 실행하거나 --no-publish를 사용하세요.\n",
      );
      process.exit(1);
    }
    process.stdout.write(`npm user:        ${who.stdout.trim()}\n`);
    // 2FA가 쓰기에 걸려 있으면 npm이 OTP(또는 브라우저 인증)를 대화형으로 받는다.
    // stdin이 TTY가 아니면 npm이 기다리지 못하고 EOTP로 끝나므로 시작 전에 막는다.
    if (!args.otp && !process.stdin.isTTY) {
      const profile = spawnSync("npm", ["profile", "get", "--json"], {
        encoding: "utf-8",
      });
      let tfaMode = "";
      try {
        tfaMode = JSON.parse(profile.stdout).tfa?.mode ?? "";
      } catch {
        // 확인 불가 — publish에서 실패해도 push 전이라 원격은 그대로다
      }
      if (tfaMode === "auth-and-writes") {
        process.stderr.write(
          "Error: npm 2FA가 publish에 필요하지만 stdin이 TTY가 아니라 npm이 OTP를 물을 수 없습니다.\n" +
            "       일반 터미널에서 실행하거나 --otp <code>를 넘기세요.\n",
        );
        process.exit(1);
      }
    }
    for (const p of npmPackageJsonPaths) {
      const { name } = JSON.parse(fs.readFileSync(p, "utf-8"));
      const view = spawnSync(
        "npm",
        ["view", `${name}@${newVersion}`, "version"],
        {
          encoding: "utf-8",
        },
      );
      if (view.status === 0 && view.stdout.trim()) {
        process.stderr.write(
          `Error: ${name}@${newVersion} is already published\n`,
        );
        process.exit(1);
      }
    }
  }

  process.stdout.write(`New version:     ${newVersion}\n`);
  process.stdout.write(`New tag:         ${tag}\n`);

  // Show changes since last release
  const tagsOutput = gitSafe(["tag", "--list", "v*", "--sort=-v:refname"]);
  const lastTag = tagsOutput ? tagsOutput.split("\n")[0] : "";

  process.stdout.write("\n");
  let range;
  if (lastTag) {
    range = `${lastTag}..HEAD`;
    process.stdout.write(`─── Commits since ${lastTag} ───\n`);
  } else {
    range = "HEAD";
    process.stdout.write("─── All commits (no previous tag) ───\n");
  }

  const commits = gitSafe(["log", "--pretty=format:  %h %s", range]);
  process.stdout.write(commits ? `${commits}\n` : "  (no new commits)\n");

  process.stdout.write("\n─── Files changed ───\n");
  const files = gitSafe(["diff", "--stat", range]);
  if (!files) {
    process.stdout.write("  (no file changes)\n");
  } else {
    process.stdout.write(
      files
        .split("\n")
        .map((l) => `  ${l}`)
        .join("\n") + "\n",
    );
  }

  process.stdout.write("\n─── Release actions ───\n");
  process.stdout.write(
    `  1. Update ${codexPluginJsonPath}            → ${newVersion}\n`,
  );
  process.stdout.write(
    `  2. Update ${pluginJsonPath}            → ${newVersion}\n`,
  );
  process.stdout.write(
    `  3. Update ${marketplaceJsonPath}       → ${newVersion}\n`,
  );
  process.stdout.write(
    `  4. Update ${agentsMarketplaceJsonPath}      → ${newVersion}\n`,
  );
  process.stdout.write(
    `  5. Update ${rootPackageJsonPath}                          → ${newVersion}\n`,
  );
  process.stdout.write(
    `  6. Update architecture_lint/pubspec.yaml          → version: ${newVersion}\n`,
  );
  process.stdout.write(
    `  7. Update leaf_kit_lint/pubspec.yaml              → version: ${newVersion}\n`,
  );
  process.stdout.write(
    `  8. Update freezed_lint/pubspec.yaml               → version: ${newVersion}\n`,
  );
  process.stdout.write(
    `  9. Update rules/{nextjs,nestjs}/package.json + kelo_analysis/pubspec.yaml → ${newVersion}\n`,
  );
  process.stdout.write(
    `  10. git commit -m "chore: 버전 ${newVersion} 범프"\n`,
  );
  process.stdout.write(`  11. git tag ${tag}\n`);
  process.stdout.write(
    args.publish
      ? `  12. npm publish ${npmPackageDirs.map((d) => `./${d}`).join(", ")}${args.otp ? " (--otp)" : ""}\n`
      : "  12. npm publish (skipped: --no-publish)\n",
  );
  process.stdout.write(`  13. git push origin ${branch} --follow-tags\n`);
  process.stdout.write(
    args.release
      ? `  14. GitHub Release ${tag} ← npm pack ${npmPackageDirs.map((d) => `./${d}`).join(", ")}\n\n`
      : "  14. GitHub Release (skipped: --no-release)\n\n",
  );

  if (!args.yes) {
    const ans = await prompt("Proceed with release? [y/N] ");
    if (!/^[Yy]$/.test(ans)) {
      process.stdout.write("Aborted.\n");
      process.exit(1);
    }
  }

  // Update version files
  updateJsonVersion(codexPluginJsonPath, newVersion);
  updateJsonVersion(pluginJsonPath, newVersion);
  updateJsonVersion(marketplaceJsonPath, newVersion);
  updateJsonVersion(agentsMarketplaceJsonPath, newVersion);
  updateJsonVersion(rootPackageJsonPath, newVersion);
  updateYamlVersion(architectureLintPubspecPath, newVersion);
  updateYamlVersion(leafKitLintPubspecPath, newVersion);
  updateYamlVersion(freezedLintPubspecPath, newVersion);
  updateYamlVersion(keloAnalysisPubspecPath, newVersion);
  for (const p of npmPackageJsonPaths) updateJsonVersion(p, newVersion);

  // Commit + tag + push
  const addFiles = [
    pluginJsonPath,
    codexPluginJsonPath,
    marketplaceJsonPath,
    agentsMarketplaceJsonPath,
    architectureLintPubspecPath,
    leafKitLintPubspecPath,
    freezedLintPubspecPath,
    keloAnalysisPubspecPath,
    ...npmPackageJsonPaths,
  ];
  if (fs.existsSync(rootPackageJsonPath)) addFiles.push(rootPackageJsonPath);
  spawnSync("git", ["add", ...addFiles], { stdio: "inherit" });
  spawnSync("git", ["commit", "-m", `chore: 버전 ${newVersion} 범프`], {
    stdio: "inherit",
  });
  spawnSync("git", ["tag", "-a", tag, "-m", `Release ${tag}`], {
    stdio: "inherit",
  });

  // publish를 push보다 먼저 한다 — publish가 실패해도 커밋·태그는 로컬에만 있어
  // 원격 태그가 배포되지 않은 버전을 가리키는 상태가 생기지 않는다.
  if (args.publish) {
    const published = [];
    for (const dir of npmPackageDirs) {
      process.stdout.write(`\nPublishing ./${dir} to npm...\n`);
      // stdio inherit — 2FA OTP 입력이 필요하면 npm이 직접 묻는다 (--otp면 그대로 전달)
      const r = spawnSync(
        "npm",
        [
          "publish",
          `./${dir}`,
          "--access",
          "public",
          ...(args.otp ? [`--otp=${args.otp}`] : []),
        ],
        {
          stdio: "inherit",
        },
      );
      if (r.status !== 0) {
        const remaining = npmPackageDirs
          .filter((d) => !published.includes(d))
          .map((d) => `'npm publish ./${d} --access public'`)
          .join(", ");
        process.stderr.write(
          published.length === 0
            ? `Error: npm publish 실패. 아직 push 전이라 원격은 그대로입니다.\n` +
                `       되돌리기: git tag -d ${tag} && git reset --hard HEAD~1\n` +
                `       또는 원인 해결 후 ${remaining}, 'git push origin ${branch} --follow-tags', 'gh release create ${tag}'를 실행하세요.\n`
            : `Error: npm publish 실패 (${published.join(", ")}는 배포됨 — 되돌리지 마세요).\n` +
                `       원인 해결 후 ${remaining}, 'git push origin ${branch} --follow-tags', 'gh release create ${tag}'를 실행하세요.\n`,
        );
        process.exit(r.status ?? 1);
      }
      published.push(dir);
    }
  }

  process.stdout.write("\nPushing commit and tag...\n");
  const pushResult = spawnSync(
    "git",
    ["push", "origin", branch, "--follow-tags"],
    {
      stdio: "inherit",
    },
  );
  if (pushResult.status !== 0) {
    process.stderr.write(
      `Error: git push 실패. 원인 해결 후 'git push origin ${branch} --follow-tags'${args.release ? `와 'gh release create ${tag}'` : ""}를 실행하세요.\n`,
    );
    process.exit(pushResult.status ?? 1);
  }

  if (args.release) {
    // 1.0.0 이전 소비 프로젝트가 쓰던 tarball 배포 방식과 같은 자산을 참고용으로 남긴다.
    const packDir = fs.mkdtempSync(path.join(os.tmpdir(), "kelo-release-"));
    const assets = [];
    for (const dir of npmPackageDirs) {
      const out = execFileSync(
        "npm",
        ["pack", `./${dir}`, "--pack-destination", packDir, "--json"],
        { encoding: "utf-8" },
      );
      assets.push(path.join(packDir, JSON.parse(out)[0].filename));
    }
    process.stdout.write(
      `\nCreating GitHub Release ${tag} with ${assets.length} asset(s)...\n`,
    );
    const r = spawnSync(
      "gh",
      [
        "release",
        "create",
        tag,
        ...assets,
        "--title",
        tag,
        "--notes",
        `Release ${tag}`,
      ],
      { stdio: "inherit" },
    );
    if (r.status !== 0) {
      process.stderr.write(
        `Error: GitHub Release 생성 실패. 태그 ${tag}는 이미 push되었으므로 원인 해결 후 'gh release create ${tag} ${assets.join(" ")}'만 다시 실행하세요.\n`,
      );
      process.exit(r.status ?? 1);
    }
  }

  process.stdout.write(`\n✓ Released ${tag}\n`);
}

main();
