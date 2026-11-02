const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const PAGE = 'interstate-medical-transportation.html';
const PAGE_URL = 'https://nexusmt.com/interstate-medical-transportation.html';

function ldJsonBlocks(html) {
  const blocks = [];
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) blocks.push(JSON.parse(m[1]));
  return blocks;
}
const visibleText = (html) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

test('interstate page exists with canonical, title and booking CTA', () => {
  const html = read(PAGE);
  assert.match(html, new RegExp(`<link rel="canonical" href="${PAGE_URL.replace(/\//g, '\\/')}"`));
  assert.match(html, /<title>Interstate &amp; Long-Distance Medical Transportation/);
  assert.ok(html.includes('href="https://mynexusride.com"'), 'booking href must point at mynexusride.com');
  assert.ok(html.includes('(888) 639-5766'), 'public main line must appear');
});

test('interstate page FAQPage schema parses and matches the visible FAQs', () => {
  const html = read(PAGE);
  const blocks = ldJsonBlocks(html);
  const faq = blocks.find((b) => b['@type'] === 'FAQPage');
  assert.ok(faq, 'FAQPage block present');
  assert.ok(faq.mainEntity.length >= 5, 'several FAQs');
  const text = visibleText(html);
  for (const q of faq.mainEntity) {
    assert.ok(text.includes(norm(q.name)), `visible page shows question: ${q.name}`);
    assert.ok(text.includes(norm(q.acceptedAnswer.text)), `visible page shows answer for: ${q.name}`);
  }
});

test('interstate page Service schema covers the contiguous US and excludes AK/HI', () => {
  const blocks = ldJsonBlocks(read(PAGE));
  const graph = blocks.flatMap((b) => b['@graph'] || [b]);
  const svc = graph.find((n) => n['@type'] === 'Service');
  assert.ok(svc, 'Service node present');
  assert.equal(svc.areaServed.name, 'Contiguous United States');
  assert.match(svc.description, /Alaska, Hawaii, and international trips are not served/);
  const crumbs = graph.find((n) => n['@type'] === 'BreadcrumbList');
  assert.ok(crumbs, 'BreadcrumbList present');
  assert.equal(crumbs.itemListElement.at(-1).item, PAGE_URL);
});

test('interstate page is honest about out-of-area and carries no private details', () => {
  const html = read(PAGE);
  assert.match(html, /Alaska, Hawaii, and anywhere outside the United States are out of area/);
  assert.match(html, /other 46 contiguous states/);
  for (const banned of ['Gateway Center', 'Limpkin', '202-315-9253', '202-270-2174', '240-394-7089', '301-500-7946']) {
    assert.ok(!html.includes(banned), `page must not contain ${banned}`);
  }
});

test('sitemap lists the interstate page', () => {
  assert.ok(read('sitemap.xml').includes(`<loc>${PAGE_URL}</loc>`));
});

test('shared footers link the interstate page', () => {
  const link = '<a href="/interstate-medical-transportation.html">Interstate &amp; long-distance transportation</a>';
  assert.ok(read('platform.js').includes(link), 'platform.js footer builder');
  assert.ok(read('__deploy_temp/index.html').includes(link), 'homepage inline footer builder');
});

test('services hub links the page and states the two-tier coverage model', () => {
  const html = read('non-emergency-medical-transportation.html');
  assert.ok(html.includes('href="/interstate-medical-transportation.html"'));
  const faq = ldJsonBlocks(html).find((b) => b['@type'] === 'FAQPage');
  const areas = faq.mainEntity.find((q) => q.name === 'What areas do you serve?');
  assert.match(areas.acceptedAnswer.text, /other 46 contiguous states/);
  assert.ok(visibleText(html).includes(norm(areas.acceptedAnswer.text).replace('interstate and long-distance page', 'interstate and long-distance page')), 'visible FAQ matches schema');
});

test('contact, about and legal pages carry the two-tier model', () => {
  assert.ok(read('contact-service-areas.html').includes('href="/interstate-medical-transportation.html"'));
  assert.match(read('contact-service-areas.html'), /interstate and long-distance trips across the contiguous United States/);
  assert.ok(read('about-nexus-medical-transit.html').includes('href="/interstate-medical-transportation.html"'));
  assert.match(read('legal.html'), /interstate and long-distance trips across the contiguous United States, planned in advance/);
});

test('homepage schema adds an interstate Service without dropping local areas', () => {
  const blocks = ldJsonBlocks(read('__deploy_temp/index.html'));
  const graph = blocks.flatMap((b) => b['@graph'] || [b]);
  const interstate = graph.find((n) => n['@type'] === 'Service' && n.areaServed && n.areaServed.name === 'Contiguous United States');
  assert.ok(interstate, 'interstate Service node present');
  assert.equal(interstate.url, PAGE_URL);
  const biz = graph.find((n) => n['@type'] === 'MedicalBusiness');
  assert.ok(biz, 'MedicalBusiness node present');
  const served = JSON.stringify(biz.areaServed);
  for (const state of ['Maryland', 'Virginia']) assert.ok(served.includes(state), `local areaServed keeps ${state}`);
  assert.match(biz.description, /interstate, long-distance trips across the contiguous United States/);
});

test('sibling service pages link the interstate page from their areas sections', () => {
  for (const file of ['wheelchair-transportation.html', 'stretcher-transportation.html', 'hospital-discharge-transportation.html', 'dialysis-transportation.html', 'bariatric-transportation.html', 'ambulance-transportation.html']) {
    assert.ok(read(file).includes('href="/interstate-medical-transportation.html"'), `${file} links the interstate page`);
  }
});

test('internal .html links on touched pages resolve to real files', () => {
  const touched = [PAGE, 'non-emergency-medical-transportation.html', 'contact-service-areas.html', 'about-nexus-medical-transit.html', 'legal.html', 'wheelchair-transportation.html', 'stretcher-transportation.html', 'hospital-discharge-transportation.html', 'dialysis-transportation.html', 'bariatric-transportation.html', 'ambulance-transportation.html'];
  for (const file of touched) {
    const hrefs = [...read(file).matchAll(/href="\/([a-z0-9-]+\.html)"/g)].map((m) => m[1]);
    for (const target of new Set(hrefs)) {
      assert.ok(fs.existsSync(path.join(root, target)), `${file} -> /${target} exists`);
    }
  }
});
