'use strict';
// Intent-only telemetry. Never save full questions, answers, history, session IDs,
// names, addresses, phone numbers, IPs, exact times of travel, or model prompts.
const TERMS = Object.freeze({
  'wheelchair': /\b(wheelchairs?|w\/?c|wc|weelchair|wheelchiar)\b/i,
  'stretcher': /\b(stretchers?|strecher|stretchr)\b/i,
  'ambulance': /\b(ambulances?|bls|als)\b/i,
  'hospital': /\b(hospitals?|hosp|hosptial|discharge)\b/i,
  'rehab': /\b(rehab|rehabilitation|nursing home|snf)\b/i,
  'family': /\b(mum|mom|mother|dad|father|granny|grandma|grandpa|grandmother|grandfather|pops|son|daughter|grandson|granddaughter|caregiver|parent|relative|loved one)\b/i,
  'transfer': /\b(transfer|xfer|xfr|trnasfer|tranfer|trasfer|relocate|move|moving)\b/i,
  'interstate': /\b(interstate|out of state|long distance|nyc|new york|to ny|florida|texas|pennsylvania|another state)\b/i,
  'booking': /\b(book|booking|reserve|schedule|appointment|appt|pickup)\b/i,
  'pricing': /\b(price|pricing|cost|quote|estimate|rates?|how much)\b/i,
  'insurance': /\b(insurance|medicaid|medicare|coverage|broker)\b/i,
  'accessibility': /\b(accessible|mobility|cannot walk|can't walk|wheelchair|stretcher)\b/i,
  'greeting': /^(hi|hey|hello|good morning|good evening|thanks|thank you)[!. ]*$/i
});
const VALID_MODES = new Set(['composed','model','fallback','safety','greeting','courtesy','conversation','followup-reset','followup-address','followup-estimate','model-estimate']);
const VALID_SOURCES = new Set(require('./visitor-knowledge.cjs').ENTRIES.map(e=>e.id));
function classify(question, mode, sources) {
  const text=String(question||'').slice(0,500);
  const terms=Object.keys(TERMS).filter(key=>TERMS[key].test(text));
  const responseMode=VALID_MODES.has(mode)?mode:'other';
  const acceptedSources=(Array.isArray(sources)?sources:[]).filter(s=>VALID_SOURCES.has(s)).slice(0,5);
  let intent='other';
  if(responseMode==='safety')intent='emergency';
  else if(responseMode==='fallback')intent='unanswered';
  else if(terms.includes('pricing'))intent='pricing';
  else if(terms.includes('booking'))intent='booking';
  else if(terms.includes('insurance'))intent='insurance';
  else if(terms.includes('interstate'))intent='interstate';
  else if(terms.includes('transfer'))intent='transfer';
  else if(terms.includes('accessibility'))intent='accessibility';
  else if(terms.includes('greeting'))intent='greeting';
  else if(acceptedSources.length)intent='knowledge';
  return {responseMode,intent,terms,sources:acceptedSources};
}
async function store(queryFn, question, response) {
  if(!response || !response.body || response.status!==200)return;
  const data=classify(question,response.body.mode,response.body.sources);
  await queryFn('INSERT INTO nex_intent_events(response_mode,intent,terms,sources) VALUES($1,$2,$3::text[],$4::text[])',[data.responseMode,data.intent,data.terms,data.sources]);
}
async function report(queryFn,days=30) {
  const daysSafe=Math.min(90,Math.max(1,Number(days)||30));
  const [overview,intents,gaps,terms]=await Promise.all([
    queryFn("SELECT count(*)::int AS total, count(*) FILTER (WHERE intent='unanswered')::int AS unanswered, count(*) FILTER (WHERE intent='emergency')::int AS emergencies FROM nex_intent_events WHERE created_at>=now()-($1::int * interval '1 day')",[daysSafe]),
    queryFn("SELECT intent, count(*)::int AS count FROM nex_intent_events WHERE created_at>=now()-($1::int * interval '1 day') GROUP BY intent ORDER BY count DESC LIMIT 15",[daysSafe]),
    queryFn("SELECT terms, count(*)::int AS count FROM nex_intent_events WHERE created_at>=now()-($1::int * interval '1 day') AND intent='unanswered' GROUP BY terms ORDER BY count DESC LIMIT 20",[daysSafe]),
    queryFn("SELECT term, count(*)::int AS count FROM nex_intent_events, unnest(terms) term WHERE created_at>=now()-($1::int * interval '1 day') GROUP BY term ORDER BY count DESC LIMIT 20",[daysSafe])
  ]);
  return {days:daysSafe,summary:overview.rows[0],intents:intents.rows,gaps:gaps.rows,terms:terms.rows,storesRawMessages:false};
}
module.exports={TERMS,classify,store,report};
