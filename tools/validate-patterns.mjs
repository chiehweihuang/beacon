#!/usr/bin/env node
// Beacon · pattern-library validator (Step 1).
// Validates core/patterns/*.json declarative detector records WITHOUT executing
// their matchers (execution is covered by pattern-runtime.test.mjs, Step 3).
//
// Five gates:
//   1. schema      — required fields, types, closed enums
//   2. regex       — matcher.pattern and every guard pattern compile
//   3. identity    — id is namespaced + unique across the whole library
//   4. wcag        — wcag.sc exists in the catalog and level/title match it
//   5. claim+leak  — banned-claim lint (no over-claims; REVIEW flags hedged)
//                    and synthetic-identifier lint (fix.example has no client code)
//
// Usage: node tools/validate-patterns.mjs   (exits 1 on any error)

import { readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const BANDS = new Set(['FLAG', 'REVIEW', 'INFO']);
const KINDS = new Set(['regex', 'regex-guarded', 'regex-count']);
const FILE_KINDS = new Set(['html', 'css', 'js', 'ts', 'py', 'tex', 'typ']);
const SCOPES = new Set(['line', 'whole-file', 'window']);
const ID_RE = /^(web|css|pdf|doc)\/[a-z0-9-]+$/;
const HEDGES = ['possible', 'likely', 'may', 'review', 'check', 'verify', 'potential'];

// Over-claim / compliance-claim phrases the machine layer (~30-40% of WCAG) must
// never assert. Word-aware so "inaccessible" is not caught by "accessible".
const BANNED_CLAIM = [
  /\bfully accessible\b/i,
  /\bwcag[- ]?compliant\b/i,
  /\bcompliant\b/i,
  /\bmakes?\b[^.]*\baccessible\b/i,
  /\bnow passes\b/i,
  /\bresolves?\b[^.]*\bfailures?\b/i,
  /\breachable by all\b/i,
];

// Generic compound identifiers that are safe in a synthetic example. Anything
// else that looks like a real identifier (camelCase / PascalCase / snake_case)
// is treated as a possible client-code leak.
const IDENT_WHITELIST = new Set([
  'onClick', 'onKeyDown', 'onKeyUp', 'onChange', 'onInput', 'onSubmit',
  'addEventListener', 'removeEventListener', 'querySelector', 'querySelectorAll',
  'tabIndex', 'focusVisible', 'ariaHidden', 'currentColor', 'DocumentMetadata',
]);

function syntheticIdentifierLeaks(example) {
  if (!example) return [];
  const text = `${example.before || ''}\n${example.after || ''}`;
  const leaks = [];
  for (const tok of text.match(/[A-Za-z_][A-Za-z0-9_]*/g) || []) {
    if (IDENT_WHITELIST.has(tok)) continue;
    const camel = /[a-z][A-Z]/.test(tok);
    const pascalCompound = /^[A-Z][a-z]+[A-Z]/.test(tok);
    const snake = tok.includes('_');
    if (camel || pascalCompound || snake) leaks.push(tok);
  }
  return leaks;
}

function compiles(pattern, flags) {
  try {
    new RegExp(pattern, flags || '');
    return true;
  } catch {
    return false;
  }
}

export function validateRecords(records, catalog) {
  const errors = [];
  const seen = new Set();
  const at = (i, id) => `record[${i}]${id ? ` (${id})` : ''}`;

  records.forEach((r, i) => {
    const id = r && r.id;
    const where = at(i, typeof id === 'string' ? id : '');

    if (typeof id !== 'string' || !ID_RE.test(id)) {
      errors.push(`${where}: id missing or not namespaced kebab-case (web|css|pdf|doc)/...`);
    } else if (seen.has(id)) {
      errors.push(`${where}: duplicate id`);
    } else {
      seen.add(id);
    }

    if (r.schema_version !== 1) errors.push(`${where}: schema_version must be 1`);
    if (!BANDS.has(r.band)) errors.push(`${where}: band must be FLAG|REVIEW|INFO`);

    // wcag
    const w = r.wcag;
    if (!w || typeof w !== 'object') {
      errors.push(`${where}: wcag object required`);
    } else if (!catalog[w.sc]) {
      errors.push(`${where}: wcag.sc "${w.sc}" not in catalog`);
    } else if (catalog[w.sc].level !== w.level || catalog[w.sc].title !== w.title) {
      errors.push(`${where}: wcag level/title do not match catalog for ${w.sc}`);
    }

    // applies_to
    const a = r.applies_to;
    if (!a || !Array.isArray(a.fileKinds) || a.fileKinds.length === 0) {
      errors.push(`${where}: applies_to.fileKinds must be a non-empty array`);
    } else {
      for (const fk of a.fileKinds) {
        if (!FILE_KINDS.has(fk)) errors.push(`${where}: invalid fileKind "${fk}"`);
      }
    }
    if (a && a.requireIndicatorSet !== undefined && a.requireIndicatorSet !== 'pdf-gen') {
      errors.push(`${where}: requireIndicatorSet must be "pdf-gen" when present`);
    }

    // matcher
    const m = r.matcher;
    if (!m || !KINDS.has(m.kind)) {
      errors.push(`${where}: matcher.kind must be regex|regex-guarded|regex-count`);
    } else {
      if (typeof m.pattern !== 'string' || !compiles(m.pattern, m.flags)) {
        errors.push(`${where}: matcher.pattern missing or does not compile`);
      }
      if (m.kind === 'regex-guarded') {
        if (!Array.isArray(m.guard) || m.guard.length === 0) {
          errors.push(`${where}: regex-guarded needs a non-empty guard array`);
        } else {
          m.guard.forEach((g, gi) => {
            if (!SCOPES.has(g.scope)) errors.push(`${where}: guard[${gi}].scope invalid`);
            if (g.mustContain === undefined && g.mustNotContain === undefined) {
              errors.push(`${where}: guard[${gi}] needs mustContain or mustNotContain`);
            }
            for (const key of ['mustContain', 'mustNotContain']) {
              if (g[key] !== undefined && !compiles(g[key])) {
                errors.push(`${where}: guard[${gi}].${key} does not compile`);
              }
            }
            if (g.scope === 'window' && !(Number.isInteger(g.before) && Number.isInteger(g.after))) {
              errors.push(`${where}: window guard needs integer before/after`);
            }
          });
        }
      }
      if (m.kind === 'regex-count') {
        if (!(m.flags || '').includes('g')) errors.push(`${where}: regex-count needs the g flag`);
        if (m.threshold !== undefined && !Number.isInteger(m.threshold)) {
          errors.push(`${where}: regex-count threshold must be an integer`);
        }
      }
    }

    // message + claim lint
    const msg = r.message;
    if (!msg || typeof msg.flag !== 'string' || !msg.flag.trim()) {
      errors.push(`${where}: message.flag required`);
    } else {
      for (const re of BANNED_CLAIM) {
        if (re.test(msg.flag)) errors.push(`${where}: message.flag contains a banned over-claim (${re})`);
      }
      if (r.band === 'REVIEW') {
        const firstWord = msg.flag.trim().toLowerCase().split(/[\s:]/)[0];
        if (!HEDGES.includes(firstWord)) {
          errors.push(`${where}: REVIEW flag must start with a hedge token (${HEDGES.join('/')})`);
        }
      }
    }

    // fix + leak lint
    const fix = r.fix;
    if (!fix || typeof fix.hint !== 'string' || !fix.hint.trim()) {
      errors.push(`${where}: fix.hint required`);
    } else {
      for (const re of BANNED_CLAIM) {
        if (re.test(fix.hint)) errors.push(`${where}: fix.hint contains a banned over-claim (${re})`);
      }
    }
    if (fix && fix.example) {
      const leaks = syntheticIdentifierLeaks(fix.example);
      if (leaks.length) {
        errors.push(`${where}: fix.example has non-generic identifier(s) [${[...new Set(leaks)].join(', ')}] — use synthetic placeholders`);
      }
    }

    if (r.false_positive_notes !== undefined && !Array.isArray(r.false_positive_notes)) {
      errors.push(`${where}: false_positive_notes must be an array`);
    }
  });

  return errors;
}

export function loadAndValidate(root) {
  const dir = join(root, 'core', 'patterns');
  const catalog = JSON.parse(readFileSync(join(dir, 'wcag-catalog.json'), 'utf8'));
  const records = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json') || f === 'wcag-catalog.json') continue;
    const arr = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    if (!Array.isArray(arr)) throw new Error(`${f}: expected an array of records`);
    records.push(...arr);
  }
  return { errors: validateRecords(records, catalog), count: records.length };
}

// CLI
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const { errors, count } = loadAndValidate(root);
  if (errors.length) {
    console.error(`✖ ${errors.length} pattern validation error(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`✔ ${count} pattern records valid.`);
}
