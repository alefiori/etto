#!/usr/bin/env node
// Rasterise the Etto brand marks into PNGs the auth emails can <img> from.
//
// Email clients don't render SVG (Gmail, Outlook, Yahoo all strip it) and block
// data: URIs on images, so the templates in supabase/templates/ point at hosted
// PNGs under /email/. This script regenerates them from the SVG sources of
// truth. Re-run after editing the icon or the wordmark:
//
//   node scripts/build-email-assets.mjs
//
// Outputs (public/ is served at https://etto.fitness/):
//   public/email/etto-icon.png            Meridian app-icon tile, 180px — both themes
//   public/email/etto-wordmark.png        "Etto" wordmark, dark ink  — for the light card
//   public/email/etto-wordmark-dark.png   "Etto" wordmark, light ink — for the dark card

import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'email');

const INK = '#2F3624';       // wordmark ink on the light card
const INK_DARK = '#E7ECE0';  // wordmark ink on the dark card (Grove dark --ink)

await mkdir(OUT, { recursive: true });

async function render(svg, { width, out, trim = false }) {
  let pipe = sharp(Buffer.from(svg), { density: 384 }).resize({ width });
  if (trim) pipe = pipe.trim({ threshold: 1 });
  const buf = await pipe.png({ compressionLevel: 9 }).toBuffer();
  await writeFile(join(OUT, out), buf);
  const { width: w, height: h } = await sharp(buf).metadata();
  console.log(`  ${out.padEnd(24)} ${w}x${h}  ${(buf.length / 1024).toFixed(1)} kB`);
}

// Icon: the standalone app-icon artwork (rounded tile + transparent corners).
const icon = await readFile(join(ROOT, 'public', 'icon.svg'), 'utf8');
// Wordmark: pure geometry (rects + one arc), so it rasterises identically everywhere.
const wordmark = await readFile(join(ROOT, 'design', 'logo-concepts', 'wordmark-etto.svg'), 'utf8');

console.log('email assets → public/email/');
await render(icon, { width: 180, out: 'etto-icon.png' });
await render(wordmark, { width: 420, out: 'etto-wordmark.png', trim: true });
await render(wordmark.split(INK).join(INK_DARK), { width: 420, out: 'etto-wordmark-dark.png', trim: true });
