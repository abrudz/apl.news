#!/usr/bin/env node
// Detect candidate articles from known sources that are not yet listed in index.html.
//
// Usage:
//   node scripts/check-sources.mjs            # human-readable report to stdout
//   node scripts/check-sources.mjs --out FILE # also write a Markdown report to FILE
//   node scripts/check-sources.mjs --json     # emit machine-readable JSON to stdout
//
// "Candidate" is deliberate: a hit only means the source published something we
// haven't listed — it still needs a human to judge whether it is on-topic.
// Sources are configured in scripts/sources.json (feeds and HTML-scrape specs).
//
// No dependencies: uses Node 20+ global fetch. Exit code is always 0 (a source
// that errors is reported inline, not treated as a build failure).

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const UA = 'apl.news-source-checker/1.0 (+https://github.com/abrudz/apl.news)';
const TIMEOUT_MS = 20000;

const args = process.argv.slice(2);
const outFile = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const asJson = args.includes('--json');

// ---------- helpers ----------

// Canonical form for comparing URLs: drop scheme, leading www., query, fragment,
// and any trailing slash; lowercase the host. Keeps path case (some slugs care).
function normalize(u) {
  try {
    const url = new URL(u);
    const host = url.host.replace(/^www\./i, '').toLowerCase();
    const path = url.pathname.replace(/\/+$/, '');
    return host + path;
  } catch {
    return String(u).trim().toLowerCase();
  }
}

// A cleaned, display/storage-ready absolute URL (no query/fragment/trailing slash
// noise), so it can be pasted straight into index.html.
function cleanUrl(u) {
  try {
    const url = new URL(u);
    url.hash = '';
    url.search = '';
    let s = url.toString();
    return s.replace(/\/$/, m => (url.pathname === '/' ? m : ''));
  } catch {
    return u;
  }
}

function decodeEntities(s) {
  return (s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleFromSlug(u) {
  try {
    const seg = new URL(u).pathname.replace(/\/+$/, '').split('/').pop() || '';
    return seg.replace(/\.(html?|xml)$/i, '')
      .replace(/^\d{4}-\d{2}-\d{2}-/, '')
      .replace(/[-_]+/g, ' ').trim();
  } catch { return ''; }
}

async function fetchOnce(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'user-agent': UA, accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html; q=0.9, */*; q=0.8' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

// Retry a couple of times: feeds behind CDNs (e.g. 503/429) and flaky TLS are common.
async function fetchText(url, attempts = 3) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try { return await fetchOnce(url); }
    catch (e) {
      last = e;
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw last;
}

// ---------- extractors ----------

// RSS <item>…<link>URL</link>…<title>…</title>  and  Atom <entry>…<link href="URL"/>…<title>…
function parseFeed(xml) {
  const out = [];
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
  for (const b of blocks) {
    let link = null;
    const rss = b.match(/<link>\s*([\s\S]*?)\s*<\/link>/i);
    if (rss) link = decodeEntities(rss[1]);
    if (!link) {
      // Atom: prefer rel="alternate" (or no rel), type text/html
      const alts = [...b.matchAll(/<link\b([^>]*)\/?>/gi)].map(m => m[1]);
      const pick = alts.find(a => /rel=["']?alternate/i.test(a)) || alts.find(a => !/rel=/i.test(a)) || alts[0];
      if (pick) { const h = pick.match(/href=["']([^"']+)["']/i); if (h) link = h[1]; }
    }
    if (!link) continue;
    const tm = b.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    out.push({ url: link.trim(), title: tm ? decodeEntities(tm[1]) : '' });
  }
  return out;
}

// Scrape: find hrefs matching `pattern`, resolve against the listing page origin.
function parseScrape(html, baseUrl, patternSrc, excludeSrc) {
  const origin = new URL(baseUrl).origin;
  const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map(m => m[1]);
  const pat = new RegExp(patternSrc);
  const exc = excludeSrc ? new RegExp(excludeSrc, 'i') : null;
  const seen = new Set();
  const out = [];
  for (const h of hrefs) {
    if (!pat.test(h)) continue;
    if (exc && exc.test(h)) continue;
    let abs;
    try { abs = new URL(h, origin).toString(); } catch { continue; }
    const key = normalize(abs);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ url: abs, title: titleFromSlug(abs) });
  }
  return out;
}

// ---------- main ----------

const indexHtml = await readFile(join(ROOT, 'index.html'), 'utf8');
const config = JSON.parse(await readFile(join(HERE, 'sources.json'), 'utf8'));

const seen = new Set(
  [...indexHtml.matchAll(/<a\s+href=["'](https?:\/\/[^"']+)["']/gi)].map(m => normalize(m[1])),
);

const results = []; // { name, candidates:[{url,title}], error }
for (const s of config.sources) {
  try {
    const text = await fetchText(s.url);
    let items = s.type === 'feed'
      ? parseFeed(text)
      : parseScrape(text, s.url, s.pattern, s.exclude);
    if (s.filter) {
      const f = new RegExp(s.filter, 'i');
      items = items.filter(it => f.test(it.url) || f.test(it.title));
    }
    const fresh = [];
    const dedupe = new Set();
    for (const it of items) {
      const key = normalize(it.url);
      if (seen.has(key) || dedupe.has(key)) continue;
      dedupe.add(key);
      fresh.push({ url: cleanUrl(it.url), title: it.title || titleFromSlug(it.url) });
    }
    results.push({ name: s.name, candidates: fresh });
  } catch (e) {
    results.push({ name: s.name, candidates: [], error: e.message || String(e) });
  }
}

const totalCandidates = results.reduce((n, r) => n + r.candidates.length, 0);
const errored = results.filter(r => r.error);

// ---------- output ----------

function toMarkdown() {
  const lines = [];
  lines.push('<!-- apl-news-source-checker -->');
  lines.push(`### ${totalCandidates} candidate article${totalCandidates === 1 ? '' : 's'} from known sources`);
  lines.push('');
  lines.push('Each link is a post from a known source that is **not yet listed** on apl.news. A candidate still needs a human to confirm it is in English and actually about APL before adding it.');
  lines.push('');
  for (const r of results) {
    if (!r.candidates.length) continue;
    lines.push(`#### ${r.name}`);
    for (const c of r.candidates) lines.push(`- [ ] [${c.title || c.url}](${c.url})`);
    lines.push('');
  }
  if (errored.length) {
    lines.push('#### ⚠ Sources that could not be checked');
    for (const r of errored) lines.push(`- ${r.name}: \`${r.error}\``);
    lines.push('');
  }
  return lines.join('\n');
}

if (asJson) {
  process.stdout.write(JSON.stringify({ totalCandidates, results }, null, 2) + '\n');
} else {
  // Human-readable console report
  for (const r of results) {
    if (r.error) { console.log(`⚠  ${r.name}: ${r.error}`); continue; }
    if (!r.candidates.length) { console.log(`   ${r.name}: up to date`); continue; }
    console.log(`\n★  ${r.name}: ${r.candidates.length} candidate(s)`);
    for (const c of r.candidates) console.log(`     • ${c.title || ''}\n       ${c.url}`);
  }
  console.log(`\n${totalCandidates} candidate(s) total across ${config.sources.length} sources` +
    (errored.length ? `; ${errored.length} source(s) errored` : ''));
}

const md = toMarkdown();
if (outFile) await writeFile(outFile, md + '\n', 'utf8');

// Expose count to GitHub Actions if running there.
if (process.env.GITHUB_OUTPUT) {
  await writeFile(process.env.GITHUB_OUTPUT, `count=${totalCandidates}\n`, { flag: 'a' });
}
