import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOK = resolve(fileURLToPath(import.meta.url), '../../scripts/beacon-ui-gate.mjs');
const DESIGN_QA = resolve(HOOK, '../design-qa.mjs');

function gitRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'beacon-gate-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  return dir;
}

function touch(path, secondsFromNow) {
  const t = new Date(Date.now() + secondsFromNow * 1000);
  utimesSync(path, t, t);
}

function writeUi(dir, name = 'index.html') {
  const file = join(dir, name);
  writeFileSync(file, '<h1>hi</h1>');
  touch(file, -10);
}

function writeResult(dir, level, name = `${level}.json`) {
  mkdirSync(join(dir, 'reports', 'design-qa'), { recursive: true });
  const file = join(dir, 'reports', 'design-qa', name);
  const metadata = { engine_fingerprint: 'beacon-design-qa@2', ...(level ? { level } : {}) };
  writeFileSync(file, JSON.stringify({ metadata }));
  touch(file, 10);
}

function run(input, raw) {
  const result = spawnSync('node', [HOOK], { input: raw ?? JSON.stringify(input), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

const stop = (cwd, extra = {}) => ({ hook_event_name: 'Stop', cwd, ...extra });
const commit = cwd => ({ hook_event_name: 'PreToolUse', cwd, tool_name: 'Bash', tool_input: { command: 'git commit -m x' } });

test('Stop: no UI change -> silent', () => {
  const dir = gitRepo();
  try {
    writeFileSync(join(dir, 'notes.txt'), 'x');
    assert.equal(run(stop(dir)), '');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Stop: changed .html with no result -> block naming the quick command', () => {
  const dir = gitRepo();
  try {
    writeUi(dir);
    const out = JSON.parse(run(stop(dir)));
    assert.equal(out.decision, 'block');
    assert.match(out.reason, /index\.html/);
    assert.ok(out.reason.includes(`node ${DESIGN_QA} --level quick --url`));
    assert.match(out.reason, /reports\/design-qa\/quick-\d{4}-\d{2}-\d{2}\.json/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Stop: a newer quick result covers the change; a pre-@2 result (no level) counts as full', () => {
  for (const level of ['quick', null]) {
    const dir = gitRepo();
    try {
      writeUi(dir);
      writeResult(dir, level);
      assert.equal(run(stop(dir)), '', String(level));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test('Stop: a result older than the UI change does not cover it', () => {
  const dir = gitRepo();
  try {
    writeResult(dir, 'full');
    touch(join(dir, 'reports', 'design-qa', 'full.json'), -100);
    writeUi(dir);
    assert.equal(JSON.parse(run(stop(dir))).decision, 'block');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Stop: stop_hook_active -> silent', () => {
  const dir = gitRepo();
  try {
    writeUi(dir);
    assert.equal(run(stop(dir, { stop_hook_active: true })), '');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Stop: UI files under skipped directories are ignored', () => {
  const dir = gitRepo();
  try {
    mkdirSync(join(dir, 'node_modules', 'x'), { recursive: true });
    writeFileSync(join(dir, 'node_modules', 'x', 'a.html'), 'x');
    mkdirSync(join(dir, 'reports'), { recursive: true });
    writeFileSync(join(dir, 'reports', 'r.html'), 'x');
    assert.equal(run(stop(dir)), '');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('PreToolUse git commit: quick result is not enough -> deny with --level feature; feature result passes', () => {
  const dir = gitRepo();
  try {
    writeUi(dir);
    writeResult(dir, 'quick');
    const out = JSON.parse(run(commit(dir)));
    assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
    assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /--level feature/);
    writeResult(dir, 'feature');
    assert.equal(run(commit(dir)), '');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('PreToolUse: other commands and other tools -> silent', () => {
  const dir = gitRepo();
  try {
    writeUi(dir);
    assert.equal(run({ hook_event_name: 'PreToolUse', cwd: dir, tool_name: 'Bash', tool_input: { command: 'git status' } }), '');
    assert.equal(run({ hook_event_name: 'PreToolUse', cwd: dir, tool_name: 'Read', tool_input: { file_path: 'x' } }), '');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('non-git cwd, missing cwd, and unparsable stdin -> silent exit 0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'beacon-gate-nogit-'));
  try {
    writeFileSync(join(dir, 'index.html'), 'x');
    assert.equal(run(stop(dir)), '');
    assert.equal(run({ hook_event_name: 'Stop' }), '');
    assert.equal(run(null, 'not json {'), '');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Stop: non-ASCII path (C-quoted by plain porcelain) still blocks despite an old result', () => {
  const dir = gitRepo();
  try {
    writeUi(dir, '日本.css');
    writeResult(dir, 'quick');
    touch(join(dir, 'reports', 'design-qa', 'quick.json'), -100);
    const out = JSON.parse(run(stop(dir)));
    assert.equal(out.decision, 'block');
    assert.match(out.reason, /日本\.css/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Stop: renamed UI file is reported by its new name only', () => {
  const dir = gitRepo();
  try {
    writeUi(dir, 'old.html');
    execFileSync('git', ['add', 'old.html'], { cwd: dir });
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'i'], { cwd: dir });
    execFileSync('git', ['mv', 'old.html', 'new.html'], { cwd: dir });
    const out = JSON.parse(run(stop(dir)));
    assert.match(out.reason, /new\.html/);
    assert.doesNotMatch(out.reason, /old\.html/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('PreToolUse commit matcher: real commits deny, lookalikes allow', () => {
  const dir = gitRepo();
  try {
    writeUi(dir);
    const cmd = command => run({ hook_event_name: 'PreToolUse', cwd: dir, tool_name: 'Bash', tool_input: { command } });
    for (const denied of ['git commit -m x', 'git -C sub commit -m x', 'cd a && git commit -m x', 'FOO=1 git -c a=b commit -m x', 'git --git-dir=.git --work-tree=. commit', 'ls | git commit -F -', 'git add -A\ngit commit -m x', 'sudo git commit -m x', 'git --no-pager commit -m x', 'env FOO=1 git --no-optional-locks commit']) {
      assert.equal(JSON.parse(cmd(denied)).hookSpecificOutput.permissionDecision, 'deny', denied);
    }
    for (const allowed of ['git commit --dry-run', 'git commit-tree abc', 'echo "git commit"', 'git log --grep="git commit"', 'git status']) {
      assert.equal(cmd(allowed), '', allowed);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
