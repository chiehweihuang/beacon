#!/usr/bin/env node
// Beacon UI gate: makes the viewport check run automatically.
//   Stop                         -> UI files changed but no covering quick design-qa result: block once per turn
//   PreToolUse (git commit)      -> same, but a feature-level result is required: deny
// One script, dispatch on hook_event_name. Silent exit 0 on anything unexpected; never throws.
// ponytail: git-dirty scan, not transcript parsing; re-blocks while UI changes stay unverified, which is intended.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Same extensions as UI_FILE_PATTERN in a11y-advisor-hook.mjs.
const UI_FILE_PATTERN = /\.(html?|css|scss|less|jsx|tsx|vue|svelte|swift|kt|dart|xaml)$/i;
const SKIP_DIRS = /(^|\/)(node_modules|reports|skills|commands|plugins|scripts|test)\//;
const LEVELS = ['quick', 'feature', 'full'];
const DESIGN_QA = join(dirname(fileURLToPath(import.meta.url)), 'design-qa.mjs');

function changedUiFiles(cwd) {
  // -z: raw, unquoted paths (non-ASCII safe). Rename/copy records are followed by their source path.
  const records = execFileSync('git', ['status', '--porcelain', '-z', '-uall'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\0');
  const paths = [];
  for (let i = 0; i < records.length; i++) {
    if (!records[i]) continue;
    paths.push(records[i].slice(3));
    if (/[RC]/.test(records[i].slice(0, 2))) i++;
  }
  return paths.filter(path => UI_FILE_PATTERN.test(path) && !SKIP_DIRS.test(path));
}

// True when any shell segment of the command is a real `git commit` (not --dry-run).
function isGitCommit(command) {
  return String(command).split(/;|&&|\|\||\||\(|[\r\n]/).some(segment => {
    if (/--dry-run/.test(segment)) return false;
    const tokens = segment.trim().split(/\s+/).filter(Boolean);
    while (tokens.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0]) || ['sudo', 'env', 'command'].includes(tokens[0]))) tokens.shift();
    if (tokens.shift() !== 'git') return false;
    while (tokens.length) {
      if (tokens[0] === '-C' || tokens[0] === '-c') tokens.splice(0, 2);
      else if (/^--[\w-]+(=|$)/.test(tokens[0])) tokens.shift(); // global option, e.g. --no-pager, --git-dir=x
      else break;
    }
    return tokens[0] === 'commit';
  });
}

function coveringResultExists(cwd, required, newestChange) {
  const dir = join(cwd, 'reports', 'design-qa');
  let names;
  try { names = readdirSync(dir).filter(name => name.endsWith('.json')); } catch { return false; }
  return names.some(name => {
    try {
      const file = join(dir, name);
      const metadata = JSON.parse(readFileSync(file, 'utf8')).metadata || {};
      if (!String(metadata.engine_fingerprint || '').startsWith('beacon-design-qa')) return false;
      const level = LEVELS.includes(metadata.level) ? metadata.level : 'full'; // pre-@2 results had no level
      return LEVELS.indexOf(level) >= LEVELS.indexOf(required) && statSync(file).mtimeMs > newestChange;
    } catch { return false; }
  });
}

function gate(cwd, required) {
  const files = changedUiFiles(cwd);
  if (!files.length) return null;
  const newest = Math.max(...files.map(file => { try { return statSync(join(cwd, file)).mtimeMs; } catch { return 0; } }));
  if (coveringResultExists(cwd, required, newest)) return null;
  const date = new Date().toISOString().slice(0, 10);
  const shown = files.slice(0, 5).join(', ') + (files.length > 5 ? `, +${files.length - 5} more` : '');
  return `UI files changed without a ${required} viewport check: ${shown}. Run: `
    + `node ${DESIGN_QA} --level ${required} --url <file-or-dev-url> --output reports/design-qa/${required}-${date}.json `
    + 'then fix blocked checks and finish. If no page can be rendered, say so in the reply.';
}

try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const cwd = input && input.cwd;
  if (typeof cwd !== 'string' || !cwd) process.exit(0);
  if (input.hook_event_name === 'Stop' && !input.stop_hook_active) {
    const reason = gate(cwd, 'quick');
    if (reason) console.log(JSON.stringify({ decision: 'block', reason }));
  } else if (input.hook_event_name === 'PreToolUse' && isGitCommit(input.tool_input?.command || '')) {
    const reason = gate(cwd, 'feature');
    if (reason) console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }));
  }
} catch { /* never break the host session */ }
