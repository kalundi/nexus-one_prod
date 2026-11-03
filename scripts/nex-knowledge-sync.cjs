#!/usr/bin/env node
'use strict';
/**
 * Draft public Nex knowledge from a narrow, approved allowlist of site pages.
 * Writes review candidates only; NEVER publishes directly to Nex.
 *
 * Usage: node scripts/nex-knowledge-sync.cjs
 *        NEX_SITE_ORIGIN=http://localhost:8888 node scripts/nex-knowledge-sync.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ORIGIN = process.env.NEX_SITE_ORIGIN || 'https://nexusmt.com';
const allowed = [
  '/non-emergency-medical-transportation.html',
  '/wheelchair-transportation.html',
  '/stretcher-transportation.html',
  '/ambulance-transportation.html',
  '/bariatric-transportation.html',
  '/contact-service-areas.html',
  '/accessibility.html'
];
const out = path.resolve(__dirname, '../docs/nex-knowledge-candidates.json');
function clean(s) {
  return String(s || '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim().slice(0, 2200);
}
function fromFaq(node, source, rows) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach(n => fromFaq(n, source, rows)); return; }
  if (node['@graph']) fromFaq(node['@graph'], source, rows);
  const types = [].concat(node['@type'] || []);
  if (types.includes('FAQPage')) {
    for (const item of [].concat(node.mainEntity || [])) {
      const q = clean(item && item.name);
      const a = clean(item && item.acceptedAnswer && item.acceptedAnswer.text);
      if (q.length >= 12 && a.length >= 25) {
        rows.push({ id: 'web-' + crypto.createHash('sha256').update(source + q).digest('hex').slice(0, 16),
          topic: 'Website FAQ', questions: [q], keywords: [],
          answer: a, source, review_status: 'pending' });
      }
    }
  }
}
async function main() {
  if (!/^https:\/\/nexusmt\.com$/.test(ORIGIN) && !/^http:\/\/localhost:\d+$/.test(ORIGIN))
    throw new Error('NEX_SITE_ORIGIN must be nexusmt.com or localhost');
  const rows = [], errors = [];
  for (const page of allowed) {
    try {
      const response = await fetch(ORIGIN + page, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const html = await response.text();
      for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
        try { fromFaq(JSON.parse(match[1]), page.slice(1), rows); }
        catch (error) { errors.push({ page, error: 'Invalid FAQ structured data' }); }
      }
    } catch (error) { errors.push({ page, error: String(error.message) }); }
  }
  const unique = [...new Map(rows.map(r => [r.id, r])).values()].sort((a, b) => a.id.localeCompare(b.id));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ generated_at: new Date().toISOString(), origin: ORIGIN,
    notice: 'REVIEW ONLY. Do not copy unverified claims, price quotes, medical guidance, or private data to approved knowledge.',
    entries: unique, errors }, null, 2) + '\n');
  console.log('Nex knowledge review: ' + unique.length + ' FAQ candidates; ' + errors.length + ' fetch/parse errors. Output: ' + out);
  if (errors.length) process.exitCode = 1;
}
main().catch(e => { console.error(e); process.exitCode = 1; });
