#!/usr/bin/env node
/**
 * vrfy CLI — email validation from your terminal.
 *
 * Usage:
 *   npx @yokedotlol/vrfy user@example.com
 *   npx @yokedotlol/vrfy user@example.com admin@company.com
 *   npx @yokedotlol/vrfy --json user@example.com
 *   npx @yokedotlol/vrfy --quick user@example.com
 */

import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { validate, validateBatch } from './index.js';
import type { VrfyResult } from './index.js';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[38;5;79m';
const YELLOW = '\x1b[38;5;221m';
const RED = '\x1b[38;5;203m';

const isTTY = process.stdout.isTTY ?? false;

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(`vrfy — email validation, no SMTP probes

Usage:
  vrfy <email> [email...]       Validate email(s)
  vrfy --batch <file>           Validate from file (one per line)
  cat emails.txt | vrfy -       Read from stdin

Options:
  --json         Output raw JSON
  --quick        Quick mode (Tier 1 signals only)
  --batch <file> Read emails from file
  --url <base>   Override API base URL
  --help         Show this help

Exit codes:
  0  allow    email looks good
  1  block    invalid/disposable/no MX
  2  verify   send a verification email

https://vrfy.lol`);
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log('vrfy 1.0.0');
    process.exit(0);
  }

  const jsonOutput = args.includes('--json');
  const quick = args.includes('--quick');
  let baseURL: string | undefined;
  let batchFile: string | undefined;
  const emails: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--json' || args[i] === '--quick') continue;
    if (args[i] === '--url' && args[i + 1]) { baseURL = args[++i]; continue; }
    if (args[i] === '--batch' && args[i + 1]) { batchFile = args[++i]; continue; }
    if (args[i] === '-') {
      // Read from stdin
      const lines = await readStdin();
      emails.push(...lines);
      continue;
    }
    if (!args[i]!.startsWith('--')) {
      emails.push(args[i]!);
    }
  }

  if (batchFile) {
    const content = readFileSync(batchFile, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) emails.push(trimmed);
    }
  }

  if (emails.length === 0) {
    console.error('Error: no email addresses provided');
    process.exit(1);
  }

  const opts = { quick, baseURL };

  if (emails.length === 1) {
    const result = await validate(emails[0]!, opts);
    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printResult(result);
    }
    exitForAction(result.action);
    return;
  }

  // Batch — chunk into groups of 20
  const allResults: VrfyResult[] = [];
  for (let i = 0; i < emails.length; i += 20) {
    const chunk = emails.slice(i, i + 20);
    const batch = await validateBatch(chunk, opts);
    allResults.push(...batch.results);
  }

  if (jsonOutput) {
    console.log(JSON.stringify(allResults, null, 2));
  } else {
    for (let i = 0; i < allResults.length; i++) {
      if (i > 0) console.log();
      printResult(allResults[i]!);
    }
  }

  if (allResults.some(r => r.action === 'block')) process.exit(1);
}

function printResult(r: VrfyResult): void {
  const actionLabel = {
    allow: isTTY ? `${GREEN}${BOLD}✓ allow${RESET}` : 'allow',
    verify: isTTY ? `${YELLOW}${BOLD}⚠ verify${RESET}` : 'verify',
    block: isTTY ? `${RED}${BOLD}✗ block${RESET}` : 'block',
  }[r.action] ?? r.action;

  if (!isTTY) {
    console.log(`${r.email}\t${r.action}\t${r.confidence}`);
    return;
  }

  console.log(`${BOLD}${r.email}${RESET}  ${actionLabel}`);
  console.log(`  ${DIM}confidence:${RESET} ${r.confidence}`);

  const v = r.validation;
  if (v.provider) console.log(`  ${DIM}provider:${RESET} ${v.provider.name}`);
  if (v.disposable) console.log(`  ${RED}⚠ disposable domain${RESET}`);
  if (v.privacy_relay) {
    const svc = v.privacy_relay_service ? ` (${v.privacy_relay_service})` : '';
    console.log(`  ${DIM}privacy relay${RESET}${svc}`);
  }
  if (v.has_typo && v.typo_suggestion) {
    console.log(`  ${YELLOW}typo?${RESET} ${v.typo_suggestion}`);
  }
  if (v.free_provider) console.log(`  ${DIM}free provider${RESET}`);
  if (v.role_account) console.log(`  ${DIM}role account${RESET}`);
  if (v.subaddressed) {
    const tag = v.subaddress_tag ? `+${v.subaddress_tag}` : '';
    console.log(`  ${DIM}subaddressed:${RESET} ${tag}`);
  }

  if (r.security) {
    console.log(`  ${DIM}security:${RESET} ${GREEN}${BOLD}${r.security.grade}${RESET}`);
  }

  const cached = r._meta.cached ? ' (cached)' : '';
  console.log(`  ${DIM}query:${RESET} ${r._meta.query_ms}ms${cached}`);
}

function exitForAction(action: string): void {
  if (action === 'block') process.exit(1);
  if (action === 'verify') process.exit(2);
}

function readStdin(): Promise<string[]> {
  return new Promise((resolve) => {
    const lines: string[] = [];
    const rl = createInterface({ input: process.stdin });
    rl.on('line', (line: string) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) lines.push(trimmed);
    });
    rl.on('close', () => resolve(lines));
  });
}

main().catch((err: Error) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
