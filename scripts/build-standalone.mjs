// Inline src/*.css and src/*.js into one HTML file.
//   node scripts/build-standalone.mjs              -> dist/neurovoice.html (opens anywhere, even offline except fonts)
//   node scripts/build-standalone.mjs --fragment   -> body-only page for hosts that add their own <html>/<head>
//   --page=arena.html                              -> build another page instead of index.html
//   --out=path                                     -> custom output path
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const fragment = args.includes('--fragment');
const outArg = args.find((a) => a.startsWith('--out='));
const pageArg = args.find((a) => a.startsWith('--page='));
const page = pageArg ? pageArg.slice('--page='.length) : 'index.html';
const base = page === 'index.html' ? 'neurovoice' : page.replace(/\.html$/, '');
const out = outArg ? resolve(outArg.slice('--out='.length)) : join(root, 'dist', fragment ? `${base}.fragment.html` : `${base}.html`);

async function replaceAsync(str, re, fn) {
  const parts = [];
  let last = 0;
  for (const m of str.matchAll(re)) {
    parts.push(str.slice(last, m.index), await fn(...m));
    last = m.index + m[0].length;
  }
  parts.push(str.slice(last));
  return parts.join('');
}

let html = await readFile(join(root, page), 'utf8');
html = await replaceAsync(html, /<link rel="stylesheet" href="(src\/[^"]+\.css)">/g,
  async (_, p) => `<style>\n${await readFile(join(root, p), 'utf8')}</style>`);
html = await replaceAsync(html, /<script src="(src\/[^"]+\.js)"><\/script>/g,
  async (_, p) => `<script>\n${(await readFile(join(root, p), 'utf8')).replace(/<\/script/gi, '<\\/script')}</script>`);

if (fragment) {
  const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
  const title = head.match(/<title>[\s\S]*?<\/title>/)[0];
  const links = head.match(/<link [^>]+>/g) || [];
  const styles = head.match(/<style>[\s\S]*?<\/style>/g) || [];
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/)[1];
  html = [title, '<meta name="claude:viewport-fit-sides" content="cover">', ...links, ...styles, body.trim()].join('\n');
}

await mkdir(dirname(out), { recursive: true });
await writeFile(out, html);
console.log(`wrote ${out} (${(Buffer.byteLength(html) / 1024).toFixed(1)} KB)`);
