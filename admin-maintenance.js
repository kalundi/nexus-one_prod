(() => {
  'use strict';
  let report, busy=false;
  const byId=id=>document.getElementById(id);
  const text=(tag,value)=>{const el=document.createElement(tag);el.textContent=value;return el;};
  const date=value=>value?new Date(value).toLocaleString():'Never';
  const notice=(value,error=false)=>{byId('maintenanceNotice').textContent=value;byId('maintenanceNotice').classList.toggle('error',error);};
  function render(data) {
    report=data;
    const checks=data.checks || [], issues=checks.filter(c=>c.incidentAt), pending=checks.filter(c=>c.status==='fail'&&!c.incidentAt);
    const stale=!data.checkedAt || Date.now()-new Date(data.checkedAt).getTime()>15*60*1000;
    byId('monitorState').textContent=stale?'Awaiting fresh report':issues.length?'Issues detected':pending.length?'Verifying findings':checks.some(c=>c.status==='warn')?'Configuration warning':'Checks passing';
    byId('lastChecked').textContent=`Last checked: ${date(data.checkedAt)}`;
    byId('issueCount').textContent=String(issues.length);
    byId('aiConnection').textContent=data.aiConnected?'Connected':'Not connected';
    byId('aiStatus').textContent=data.aiStatus;
    byId('investigateHealth').disabled=busy || !data.aiConnected || !checks.some(c=>c.status!=='pass');
    byId('healthChecks').replaceChildren(...checks.map(c=>{
      const card=text('article','');card.className=`healthCheck ${c.status}`;
      card.append(text('strong',c.label),text('span',c.status==='fail'?(c.incidentAt?'Issue confirmed':'First failure — verifying'):c.status==='warn'?'Warning':'Passing'),text('small',c.detail));
      if(c.incidentAt){const ack=text('button',c.acknowledged?'Acknowledged':'Acknowledge');ack.className='button';ack.disabled=c.acknowledged;ack.addEventListener('click',()=>request('acknowledge',{id:c.id}));card.append(ack);}
      return card;
    }));
    if(!checks.length)byId('healthChecks').append(text('p','No report yet. Run checks now or wait for the next scheduled check.'));
    byId('healthHistory').replaceChildren(...(data.history || []).map(h=>text('li',`${date(h.at)} · ${h.check}: ${h.event}`)));
    if(!(data.history || []).length)byId('healthHistory').append(text('li','No confirmed incidents recorded.'));
    byId('investigationMeta').textContent=data.investigation?`${data.investigation.status} · ${date(data.investigation.at)}${data.investigation.checkedAt!==data.checkedAt?' · Based on an earlier check; compare with current findings.':''}`:'';
    byId('healthInvestigation').textContent=data.investigation?.text || data.brief;
    notice(stale?'No fresh monitoring report. Run checks or inspect the scheduled function.':`${checks.length} checks · ${issues.length} confirmed issues · ${pending.length} findings awaiting confirmation.`);
  }
  async function request(action='',body) {
    if(busy)return;busy=true;byId('runHealth').disabled=true;byId('refreshHealth').disabled=true;byId('investigateHealth').disabled=true;
    notice(action==='run'?'Running read-only checks…':action==='investigate'?'Preparing AI recommendations…':'Loading system health…');
    try {
      const response=await fetch('/api/admin/maintenance'+(action?'/'+action:''),{method:action?'POST':'GET',headers:{authorization:'Bearer '+(sessionStorage.getItem('nexusAccessToken') || ''),'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
      const data=await response.json();
      if(!response.ok)throw Error(data.error || `Request failed (${response.status})`);
      busy=false;render(data);if(data.skipped)notice(data.reason);
    } catch(error){notice(error.message,true);}
    finally {busy=false;byId('runHealth').disabled=false;byId('refreshHealth').disabled=false;byId('investigateHealth').disabled=!report?.aiConnected || !(report?.checks || []).some(c=>c.status!=='pass');}
  }
  byId('runHealth').addEventListener('click',()=>request('run'));
  byId('refreshHealth').addEventListener('click',()=>request());
  byId('investigateHealth').addEventListener('click',()=>request('investigate'));
  byId('downloadHealthBrief').addEventListener('click',()=>{
    if(!report){notice('Load a report first.',true);return;}
    const url=URL.createObjectURL(new Blob([report.brief],{type:'text/plain'}));const link=document.createElement('a');link.href=url;link.download='nexus-maintenance-review.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  request();
  setInterval(()=>{if(!document.hidden&&!busy)request();},60000);
})();
