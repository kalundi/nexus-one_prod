import pg from 'pg';
import maintenance from './_shared/maintenance.cjs';
// Import the database package directly so Netlify's ESM dependency tracer includes it.
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL||process.env.NETLIFY_DB_URL,max:2,idleTimeoutMillis:30000,connectionTimeoutMillis:8000,ssl:{rejectUnauthorized:false}});
pool.on('error',()=>console.error('[MAINTENANCE_MONITOR] Idle database connection failed'));
const monitor=maintenance.createMonitor({query:(...args)=>pool.query(...args)});
export function createScheduledHandler(monitor){return async function handler(request,context){
  // Netlify's schedule configuration prevents public URL invocation.
  if(context?.deploy?.context!=='production' || !context.deploy.published || process.env.NEXUS_TEST_MODE==='true')return new Response('Skipped outside published production');
  const payload=await request.json().catch(()=>({}));
  if(!payload.next_run)return new Response('Scheduled invocation required',{status:400});
  try { const result=await monitor.run(); console.log('[MAINTENANCE_MONITOR]',JSON.stringify({checkedAt:result.checkedAt,checks:result.checks?.length || 0,issues:result.checks?.filter(c=>c.incidentAt).length || 0,skipped:!!result.skipped})); return new Response('Health checks completed'); }
  catch { console.error('[MAINTENANCE_MONITOR] Check or persistence failed'); return new Response('Maintenance check failed',{status:500}); }
};}
export default createScheduledHandler(monitor);
