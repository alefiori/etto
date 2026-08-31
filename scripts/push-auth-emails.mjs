#!/usr/bin/env node
// Push the branded Grove auth-email templates in supabase/templates/ to the
// linked Supabase project via the Management API.
//
// This is a *surgical* update: it PATCHes only the six mailer subject/content
// fields and leaves every other auth setting (Site URL, redirect allow-list,
// SMTP, rate limits, …) untouched. Prefer this over `supabase config push`,
// which would also push the localhost `site_url` from config.toml.
//
// Subjects and bodies are the localised output of build-email-templates.mjs
// (run that first if you edited supabase/templates/i18n.json). The subject is
// a Go text/template locale switch on {{ .Data.locale }}, same as the body.
//
// Usage:
//   SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/push-auth-emails.mjs [--dry-run]
//
//   --dry-run   print what would change, send nothing
//   --project-ref <ref>   target project; else $SUPABASE_PROJECT_REF, else prod
//
// SUPABASE_ACCESS_TOKEN is a personal access token — it starts with `sbp_`, NOT
// the `sb_publishable_…` anon key. Get one at
// https://supabase.com/dashboard/account/tokens
//
// CI runs this on every push to main (the supabase-deploy job in ci.yml); the
// PATCH is idempotent, so re-sending unchanged templates is a no-op.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(HERE, '..', 'supabase', 'templates');

const DEFAULT_REF = 'bqnjijjqtmufaihozwah'; // macro-track / Etto production

// Management API field stems; match supabase/config.toml [auth.email.template.*].
const KEYS = ['confirmation', 'invite', 'magic_link', 'email_change', 'recovery', 'reauthentication'];

// Localised subjects come from build-email-templates.mjs.
const subjects = JSON.parse(await readFile(join(TEMPLATES_DIR, '_generated', 'subjects.json'), 'utf8'));
const TEMPLATES = KEYS.map((key) => {
  if (!subjects[key]) throw new Error(`no subject for "${key}" — run: node scripts/build-email-templates.mjs`);
  return { key, file: `${key}.html`, subject: subjects[key] };
});

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const refFlag = args.indexOf('--project-ref');
const ref = refFlag !== -1 ? args[refFlag + 1] : process.env.SUPABASE_PROJECT_REF || DEFAULT_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN;

if (!token && !dryRun) {
  console.error('Set SUPABASE_ACCESS_TOKEN (https://supabase.com/dashboard/account/tokens).');
  process.exit(1);
}

const body = {};
for (const { key, file, subject } of TEMPLATES) {
  const html = await readFile(join(TEMPLATES_DIR, file), 'utf8');
  body[`mailer_subjects_${key}`] = subject;
  body[`mailer_templates_${key}_content`] = html;
}

console.log(`Target project: ${ref}`);
for (const { key, file } of TEMPLATES) {
  console.log(`  ${key.padEnd(16)} ← supabase/templates/${file} (${body[`mailer_templates_${key}_content`].length} bytes)`);
}

if (dryRun) {
  console.log('\n--dry-run: nothing sent.');
  process.exit(0);
}

const url = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
const res = await fetch(url, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
});

if (!res.ok) {
  console.error(`\nFailed: ${res.status} ${res.statusText}`);
  console.error(await res.text());
  process.exit(1);
}

// The PATCH answers 2xx even when it quietly persists nothing — e.g. the token
// or ref points at a project whose auth config this call can't touch — so read
// the config back and assert every field we sent actually landed. A green CI
// step has to mean the templates are live.
const check = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
if (!check.ok) {
  console.error(`\nVerify GET failed: ${check.status} ${check.statusText}`);
  console.error(await check.text());
  process.exit(1);
}
const live = await check.json();
const norm = (s) => (s ?? '').replace(/\r\n/g, '\n');
const drift = Object.keys(body).filter((field) => norm(live[field]) !== norm(body[field]));
if (drift.length) {
  console.error(`\nPushed OK (${res.status}) but ${drift.length} field(s) did not persist on ${ref}:`);
  for (const field of drift) console.error(`  ${field}`);
  console.error('Check that SUPABASE_PROJECT_REF / SUPABASE_ACCESS_TOKEN target this project.');
  process.exit(1);
}

console.log(`\nDone — ${Object.keys(body).length} auth email fields pushed to ${ref} and verified live.`);
console.log('Send a test from Authentication → Email Templates to eyeball the rendering.');
