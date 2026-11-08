// 보호 hook: 차단 사유가 stderr로 나오는지, git 가드가 "백업 후 허용 / 보호 브랜치만 차단"으로 동작하는지.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GIT_HOOK = path.join(ROOT, "hooks/block-destructive-git.sh");
const DANGER_HOOK = path.join(ROOT, "hooks/block-dangerous-commands.sh");

let tmp;
let repo;
const git = (...args) =>
  execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();

function run(hook, command, cwd = repo) {
  const res = spawnSync("bash", [hook], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd }),
    encoding: "utf8",
    env: { ...process.env, KELO_PROTECTED_BRANCHES: "" },
  });
  return { code: res.status, out: res.stdout, err: res.stderr };
}

before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kelo-hook-"));
  const remote = path.join(tmp, "remote.git");
  repo = path.join(tmp, "work");
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", remote]);
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  git("config", "commit.gpgsign", "false");
  fs.writeFileSync(path.join(repo, "a.txt"), "1\n");
  git("add", ".");
  git("commit", "-qm", "init");
  git("remote", "add", "origin", remote);
  git("push", "-q", "-u", "origin", "main");
  git("remote", "set-head", "origin", "main");
});

after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test("차단 사유는 stderr로 나온다 (exit 2)", () => {
  const r = run(GIT_HOOK, "git filter-repo --force");
  assert.equal(r.code, 2);
  assert.match(r.err, /차단/);
  const d = run(DANGER_HOOK, "rm -rf /");
  assert.equal(d.code, 2);
  assert.match(d.err, /차단/);
  assert.equal(d.out, "");
});

test("stash 저장·pop은 허용", () => {
  assert.equal(run(GIT_HOOK, "git stash").code, 0);
  assert.equal(run(GIT_HOOK, "git stash pop").code, 0);
});

test("reset --hard: 변경분을 백업 ref로 남기고 허용", () => {
  fs.writeFileSync(path.join(repo, "a.txt"), "dirty\n");
  const r = run(GIT_HOOK, "git reset --hard HEAD");
  assert.equal(r.code, 0);
  assert.match(JSON.parse(r.out).systemMessage, /refs\/kelo\/backup\/.*-reset/);
  const ref = git("for-each-ref", "--format=%(refname)", "refs/kelo/backup")
    .split("\n")
    .find((x) => x.endsWith("-reset"));
  assert.equal(git("show", `${ref}:a.txt`), "dirty");
  git("checkout", "-q", "--", "a.txt");
});

test("변경이 없으면 백업 없이 조용히 허용", () => {
  const r = run(GIT_HOOK, "git restore a.txt");
  assert.equal(r.code, 0);
  assert.equal(r.out, "");
});

test("로컬 히스토리 재작성(rebase·amend·filter-branch)은 보호 브랜치에서도 허용", () => {
  assert.equal(run(GIT_HOOK, "git rebase -i HEAD~1").code, 0);
  assert.equal(run(GIT_HOOK, "git commit --amend --no-edit").code, 0);
  assert.equal(run(GIT_HOOK, "git filter-branch --all").code, 0);
});

test("보호 브랜치(main) force push·원격 삭제·mirror는 차단", () => {
  assert.equal(run(GIT_HOOK, "git push --force origin main").code, 2);
  assert.equal(run(GIT_HOOK, "git push --force-with-lease").code, 2);
  assert.equal(run(GIT_HOOK, "git push origin +main").code, 2);
  assert.equal(run(GIT_HOOK, "git push origin :main").code, 2);
  assert.equal(run(GIT_HOOK, "git push --mirror").code, 2);
});

test("메시지 안의 --amend는 오탐하지 않는다", () => {
  assert.equal(run(GIT_HOOK, 'git commit -m "explain --amend usage"').code, 0);
});

test("기능 브랜치에서는 rebase·amend·force push 허용", () => {
  git("checkout", "-qb", "feature");
  fs.writeFileSync(path.join(repo, "b.txt"), "b\n");
  git("add", ".");
  git("commit", "-qm", "feat");
  git("push", "-q", "-u", "origin", "feature");
  assert.equal(run(GIT_HOOK, "git rebase main").code, 0);
  assert.equal(run(GIT_HOOK, "git commit --amend --no-edit").code, 0);
  assert.equal(run(GIT_HOOK, "git push --force").code, 0);
  assert.equal(run(GIT_HOOK, "git push -f origin feature").code, 0);
  git("checkout", "-q", "main");
});

test("branch -D: 머지·push 안 된 브랜치는 백업 ref를 남기고 허용", () => {
  git("checkout", "-qb", "local-only");
  fs.writeFileSync(path.join(repo, "c.txt"), "c\n");
  git("add", ".");
  git("commit", "-qm", "local");
  const sha = git("rev-parse", "HEAD");
  git("checkout", "-q", "main");
  const r = run(GIT_HOOK, "git branch -D local-only");
  assert.equal(r.code, 0);
  assert.match(r.out, /git branch local-only/);
  const ref = git("for-each-ref", "--format=%(refname)", "refs/kelo/backup")
    .split("\n")
    .find((x) => x.endsWith("-branch-local-only"));
  assert.equal(git("rev-parse", ref), sha);
});

test("clean -fd: 지워질 untracked 파일을 tar로 보관하고 허용", () => {
  fs.mkdirSync(path.join(repo, "junk"));
  fs.writeFileSync(path.join(repo, "junk/x.log"), "x\n");
  const r = run(GIT_HOOK, "git clean -fd");
  assert.equal(r.code, 0);
  const file = JSON.parse(r.out).systemMessage.match(
    /(\S+clean-\S+\.tar\.gz)/,
  )[1];
  const list = execFileSync("tar", ["-tzf", file], {
    cwd: repo,
    encoding: "utf8",
  });
  assert.match(list, /junk\/x\.log/);
  assert.equal(run(GIT_HOOK, "git clean -n -d").code, 0);
});

test("stash drop: 지울 stash를 백업 ref로 남기고 허용", () => {
  fs.writeFileSync(path.join(repo, "a.txt"), "stashed\n");
  git("stash", "push", "-q");
  const sha = git("rev-parse", "stash@{0}");
  const r = run(GIT_HOOK, "git stash drop");
  assert.equal(r.code, 0);
  const ref = git("for-each-ref", "--format=%(refname)", "refs/kelo/backup")
    .split("\n")
    .find((x) => x.endsWith("-stash-drop"));
  assert.equal(git("rev-parse", ref), sha);
});

test("update-ref -d: 지울 ref를 백업 ref로 남기고 허용", () => {
  const r0 = run(GIT_HOOK, "git update-ref -d refs/kelo/backup/x");
  assert.equal(r0.code, 0);
  assert.equal(r0.out, "");
  const sha = git("rev-parse", "refs/heads/feature");
  const r = run(GIT_HOOK, "git update-ref -d refs/heads/feature");
  assert.equal(r.code, 0);
  assert.match(r.out, /git update-ref refs\/heads\/feature/);
  const ref = git("for-each-ref", "--format=%(refname)", "refs/kelo/backup")
    .split("\n")
    .find((x) => x.endsWith("-ref-heads-feature"));
  assert.equal(git("rev-parse", ref), sha);
});

test("보호 브랜치 목록은 KELO_PROTECTED_BRANCHES로 바꿀 수 있다", () => {
  git("checkout", "-q", "feature");
  const res = spawnSync("bash", [GIT_HOOK], {
    input: JSON.stringify({
      tool_name: "Bash",
      tool_input: { command: "git push --force" },
      cwd: repo,
    }),
    encoding: "utf8",
    env: { ...process.env, KELO_PROTECTED_BRANCHES: "^feature$" },
  });
  assert.equal(res.status, 2);
  git("checkout", "-q", "main");
});
