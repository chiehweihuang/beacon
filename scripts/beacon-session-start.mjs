#!/usr/bin/env node
// SessionStart hook: inject Beacon governance text as <system-reminder>
// so Claude sees invocation rules before its first response.

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const governancePath = join(here, '..', 'beacon-governance.md');

let body;
try {
  body = readFileSync(governancePath, 'utf8');
} catch {
  process.exit(0);
}

const wrapped = `<EXTREMELY_IMPORTANT>\n${body}\n</EXTREMELY_IMPORTANT>`;

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: wrapped,
    },
  }),
);
