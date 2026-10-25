const crypto = require('node:crypto');
const ORIGIN = 'https://nexusmt.com';
const TARGETS = [
  ['booking', 'Booking page', '/booking-app.html', 'id="journeyHeader"'],
  ['livecare', 'LiveCare page', '/livecare.html', 'livecare-patient-dashboard.js'],
  ['facility', 'Facility demo page', '/facility-demo.html', 'loginScreen'],
  ['billing', 'Billing page', '/billing.html', 'id="claimRows"'],
  ['maps', 'Route map module', '/facility-demo-map.js', 'NexusFacilityMap'],
  ['fares', 'Fare calculation module', '/nexus-fare.js', 'NexusFare'],
  ['admin', 'Admin page', '/admin.html', 'admin-app.js'],
  ['login', 'Session API protection', '/api/auth/me', null, 401],
  ['settings', 'Admin API protection', '/api/admin/settings', null, 401],
  ['demo-access', 'Demo API protection', '/api/facility-demo/state', null, 401]
];
const SCHEMA = `CREATE TABLE IF NOT EXISTS maintenance_monitor (
 id integer PRIMARY KEY CHECK(id=1),report jsonb NOT NULL DEFAULT '{}',
 acknowledgements jsonb NOT NULL DEFAULT '{}',investigation jsonb,
 lease_token text,lease_until timestamptz,last_started timestamptz,last_ai_started timestamptz
);
ALTER TABLE maintenance_monitor ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON maintenance_monitor FROM PUBLIC;
INSERT INTO maintenance_monitor(id) VALUES(1) ON CONFLICT DO NOTHING;`;
const iso = now => new Date(now).toISOString();
function reduceReport(previous, results, now) {
  const at = iso(now), history = [...(previous.history || [])];
  const checks = results.map(result => {
    const old = (previous.checks || []).find(check => check.id === result.id);
    const failures = result.status === 'fail' ? (old?.failures || 0) + 1 : 0;
    const incidentAt = failures >= 2 ? old?.incidentAt || at : null;
    if (incidentAt && !old?.incidentAt) history.unshift({ at, check: result.label, event: 'Issue confirmed' });
    if (old?.incidentAt && result.status === 'pass') history.unshift({ at, check: result.label, event: 'Recovered' });
    return { ...result, failures, incidentAt, checkedAt: at };
  });
  return { checkedAt: at, checks, history: history.slice(0, 100) };
}
function aiConfig(env) {
  return { key: env.MAINTENANCE_AI_API_KEY || env.OPENAI_API_KEY,
    model: env.MAINTENANCE_AI_MODEL || env.OPENAI_MODEL };
}
function brief(report) {
  const findings = (report.checks || []).filter(c => c.status !== 'pass');
  return ['Nexus maintenance investigation — prepare changes for review only.',
    `Checked: ${report.checkedAt || 'Not yet checked'}`,
    ...findings.map(c => `${c.label}: ${c.detail}; ${c.failures} consecutive failures.`),
    findings.length ? 'Reproduce the finding, identify its cause, prepare the smallest fix in a branch, run relevant tests, and include rollback instructions. Do not alter production data, credentials, fares, payments, or permissions.' : 'No current findings. Continue scheduled monitoring.',
    'Coverage: HTTP availability, expected page/module markers, unauthenticated access rejection, database reachability, and Maps configuration. This does not exercise logged-in workflows, road rendering, dispatch, payment transactions, or notification delivery.'
  ].join('\n');
}
async function probe(target, fetchImpl, now) {
  const [id, label, path, marker, expected = 200] = target;
  const started = now();
  try {
    const response = await fetchImpl(ORIGIN + path, { redirect: 'manual', signal: AbortSignal.timeout(8000), headers: { 'user-agent': 'NexusHealthMonitor/1.0', 'cache-control': 'no-cache' } });
    let valid = response.status === expected;
    if (marker && valid) {
      // Inspect a bounded amount of public content; never retain response bodies.
      const reader = response.body.getReader(); let text = '', bytes = 0;
      const decoder = new TextDecoder();
      try { while (bytes < 512000) { const part = await reader.read(); if (part.done) break; bytes += part.value.length; text += decoder.decode(part.value, {stream:true}); if(text.includes(marker)) break; } }
      finally { await reader.cancel().catch(() => {}); }
      valid = text.includes(marker);
    } else if (!marker && valid) {
      valid = /application\/json/i.test(response.headers.get('content-type') || '');
      await response.body?.cancel().catch(() => {});
    } else await response.body?.cancel().catch(() => {});
    return { id, label, status: valid ? 'pass' : 'fail', detail: valid ? `Expected HTTP ${expected} verified` : `Unexpected response (HTTP ${response.status})`, durationMs: now() - started };
  } catch {
    return { id, label, status: 'fail', detail: 'Request failed or exceeded the eight-second limit', durationMs: now() - started };
  }
}
function createMonitor({query, fetchImpl = fetch, env = process.env, now = Date.now}) {
  let ready;
  async function ensure() {
    if (!ready) ready = (async()=>{for(const statement of SCHEMA.split(';').filter(s=>s.trim()))await query(statement);})().catch(error => { ready = null; throw error; });
    return ready;
  }
  async function row() { await ensure(); return (await query('SELECT * FROM maintenance_monitor WHERE id=1')).rows[0]; }
  async function snapshot() {
    const state = await row(), config = aiConfig(env), report = state.report;
    return { ...report, checks: (report.checks || []).map(c => ({...c, acknowledged: Boolean(c.incidentAt && state.acknowledgements[`${c.id}:${c.incidentAt}`])})),
      investigation: state.investigation, brief: brief(report), aiConnected: Boolean(config.key && config.model),
      aiStatus: config.key && config.model ? 'Configured — recommendations require review' : 'AI not connected — API key and model required',
      running: Boolean(state.lease_until && new Date(state.lease_until).getTime() > now()), cadenceMinutes: 5 };
  }
  async function run() {
    await ensure();
    const token = crypto.randomUUID();
    const claimed = await query(`UPDATE maintenance_monitor SET lease_token=$1,lease_until=now()+interval '45 seconds',last_started=now()
      WHERE id=1 AND (lease_until IS NULL OR lease_until<now()) AND (last_started IS NULL OR last_started<now()-interval '60 seconds') RETURNING report`, [token]);
    if (!claimed.rows.length) return { skipped: true, reason: 'A check is running or ran less than a minute ago', ...await snapshot() };
    try {
      const results = [];
      // Bounded parallelism keeps checks within the scheduled function window.
      for (let i=0;i<TARGETS.length;i+=5) results.push(...await Promise.all(TARGETS.slice(i,i+5).map(t => probe(t,fetchImpl,now))));
      try { await query('SELECT 1 AS maintenance_database_probe'); results.push({id:'database',label:'Database connectivity',status:'pass',detail:'Read-only query succeeded'}); }
      catch { results.push({id:'database',label:'Database connectivity',status:'fail',detail:'Read-only database query failed'}); }
      results.push({id:'maps-config',label:'Maps configuration',status:env.GOOGLE_MAPS_BROWSER_KEY?'pass':'warn',detail:env.GOOGLE_MAPS_BROWSER_KEY?'Browser key present; provider validity and road rendering are not tested':'Google Maps browser key is not configured'});
      const report = reduceReport(claimed.rows[0].report,results,now());
      await query(`UPDATE maintenance_monitor SET report=$1::jsonb,lease_token=NULL,lease_until=NULL,
        acknowledgements=(SELECT COALESCE(jsonb_object_agg(key,value),'{}'::jsonb) FROM jsonb_each(acknowledgements) WHERE key=ANY($3::text[]))
        WHERE id=1 AND lease_token=$2`,[JSON.stringify(report),token,report.checks.filter(c=>c.incidentAt).map(c=>`${c.id}:${c.incidentAt}`)]);
      return snapshot();
    } finally { await query('UPDATE maintenance_monitor SET lease_token=NULL,lease_until=NULL WHERE id=1 AND lease_token=$1',[token]); }
  }
  async function acknowledge(id) {
    const state = await row(), check = (state.report.checks || []).find(c=>c.id===id && c.incidentAt);
    if (!check) throw Object.assign(Error('Active issue not found'),{statusCode:404});
    await query(`UPDATE maintenance_monitor SET acknowledgements=acknowledgements || $1::jsonb WHERE id=1`,[JSON.stringify({[`${check.id}:${check.incidentAt}`]:iso(now())})]);
    return snapshot();
  }
  async function investigate() {
    const config = aiConfig(env);
    if (!config.key || !config.model) throw Object.assign(Error('AI is not connected. The investigation brief can still be downloaded.'),{statusCode:503});
    const state = await row();
    if (!(state.report.checks || []).some(c=>c.status!=='pass')) throw Object.assign(Error('No findings to investigate'),{statusCode:409});
    const claimed = await query(`UPDATE maintenance_monitor SET last_ai_started=now() WHERE id=1 AND (last_ai_started IS NULL OR last_ai_started<now()-interval '1 hour') RETURNING id`);
    if (!claimed.rows.length) throw Object.assign(Error('AI investigation is limited to once per hour'),{statusCode:429});
    // Only fixed check labels, status codes and timings leave the system. No logs, bodies, records or secrets.
    let response;
    try {
      response = await fetchImpl('https://api.openai.com/v1/responses',{method:'POST',signal:AbortSignal.timeout(18000),headers:{authorization:`Bearer ${config.key}`,'content-type':'application/json'},body:JSON.stringify({model:config.model,store:false,max_output_tokens:1600,instructions:'You are a software maintenance reviewer. From the supplied synthetic health-check findings, suggest likely causes, reproduction steps, a minimal proposed fix, tests and rollback. Separate evidence from hypotheses. You have no source access and cannot claim a fix is implemented or tested. No tool execution. Do not recommend bypassing access controls or changing patient records or payments.',input:brief(state.report)})});
      if (!response.ok) throw Error('Provider error');
      const data = await response.json();
      const text = (data.output || []).filter(item=>item.type==='message').flatMap(item=>item.content || []).filter(c=>c.type==='output_text').map(c=>c.text).join('\n').slice(0,12000);
      if (!text) throw Error('Empty response');
      await query('UPDATE maintenance_monitor SET investigation=$1::jsonb WHERE id=1',[JSON.stringify({at:iso(now()),checkedAt:state.report.checkedAt,text,status:'Review required'})]);
    } catch { throw Object.assign(Error('AI investigation failed. Monitoring is still active; download the brief for review.'),{statusCode:502}); }
    return snapshot();
  }
  return { snapshot, run, acknowledge, investigate };
}
function createHandler({monitor,requireUser,bearer,json,parseBody}) {
  return async (event,p,method) => {
    if (p[0]!=='admin' || p[1]!=='maintenance') return null;
    await requireUser(bearer(event),['ADMIN']);
    if (p.length===2 && method==='GET') return json(200,await monitor.snapshot());
    if (p.length===3 && method==='POST') {
      if (p[2]==='run') return json(200,await monitor.run());
      if (p[2]==='acknowledge') return json(200,await monitor.acknowledge(String(parseBody(event).id || '')));
      if (p[2]==='investigate') return json(200,await monitor.investigate());
    }
    return json(404,{error:'Maintenance action not found'});
  };
}
module.exports={createMonitor,createHandler,reduceReport,brief,TARGETS,SCHEMA};
