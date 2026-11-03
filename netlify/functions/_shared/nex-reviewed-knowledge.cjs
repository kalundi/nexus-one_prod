'use strict';
// Only reviewed, allowlisted, explicitly approved FAQ entries may supplement Nex.
// The generated candidates file is NEVER imported by the runtime.
const approved = require('./nex-approved-knowledge.json');
const SOURCES = new Set([
  'non-emergency-medical-transportation.html',
  'wheelchair-transportation.html',
  'stretcher-transportation.html',
  'ambulance-transportation.html',
  'bariatric-transportation.html',
  'contact-service-areas.html',
  'accessibility.html'
]);
const SAFE_LINK = /https?:\/\/[^\s)<>]+/gi;
const PHONE = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
const PUBLIC_NUMBERS = new Set(['8886395766', '8887604990']);
function validate(entry) {
  if (!entry || typeof entry !== 'object' || entry.review_status !== 'approved') return false;
  if (!/^web-[a-f0-9]{16}$/.test(entry.id || '') || !SOURCES.has(entry.source)) return false;
  if (entry.topic !== 'Website FAQ' || !Array.isArray(entry.questions) ||
      entry.questions.length !== 1 || typeof entry.questions[0] !== 'string' ||
      entry.questions[0].length < 12 || entry.questions[0].length > 400 ||
      !Array.isArray(entry.keywords) || entry.keywords.length !== 0 ||
      typeof entry.answer !== 'string' || entry.answer.length < 25 || entry.answer.length > 2200) return false;
  if (typeof entry.approved_by !== 'string' || !entry.approved_by.trim() ||
      !/^\d{4}-\d{2}-\d{2}T/.test(entry.approved_at || '')) return false;
  const text = entry.answer;
  // Supplemental website FAQs cannot set public prices, send users to other
  // domains, or introduce previously unapproved phone contacts.
  if (/\$\s*\d|\b(?:usd|dollars?|per mile|discount|promo code)\b/i.test(text)) return false;
  for (const url of text.match(SAFE_LINK) || []) {
    try {
      const host = new URL(url.replace(/[.,;!?]+$/, '')).hostname.toLowerCase();
      if (host !== 'nexusmt.com' && host !== 'www.nexusmt.com' &&
          host !== 'mynexusride.com' && host !== 'www.mynexusride.com') return false;
    } catch { return false; }
  }
  for (const phone of text.match(PHONE) || []) {
    const digits = phone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
    if (!PUBLIC_NUMBERS.has(digits)) return false;
  }
  return true;
}
function loadApproved() {
  if (!Array.isArray(approved)) return [];
  const seen = new Set();
  return approved.filter(entry => {
    if (!validate(entry) || seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  }).map(entry => ({
    id: entry.id, topic: entry.topic, questions: entry.questions,
    keywords: entry.keywords, answer: entry.answer, source: entry.source
  }));
}
module.exports = { loadApproved, validate, SOURCES };
