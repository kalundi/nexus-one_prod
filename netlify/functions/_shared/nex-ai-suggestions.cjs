'use strict';
// An administrator can request AI ideas using aggregated, non-identifying
// analytics only. These are suggestions, never approved Nexus facts.
function buildSummary(data) {
  const total=Number(data?.summary?.total||0);
  if (total<3) return null;
  const groups=(data.gaps||[])
    .filter(g=>Number(g.count)>=3 && Array.isArray(g.terms))
    .map(g=>({terms:g.terms.filter(t=>/^[a-z -]{2,24}$/.test(t)).slice(0,8),count:Number(g.count)}))
    .slice(0,12);
  const intents=(data.intents||[])
    .filter(g=>Number(g.count)>=3)
    .map(g=>({intent:String(g.intent).slice(0,35),count:Number(g.count)}))
    .slice(0,12);
  return {periodDays:data.days,total,unanswered:Number(data.summary?.unanswered||0),groups,intents};
}
function extractText(data) {
  return (data.output||[]).filter(x=>x.type==='message')
    .flatMap(x=>x.content||[]).filter(x=>x.type==='output_text')
    .map(x=>x.text).join('\n').trim().slice(0,10000);
}
async function suggest(data,{fetchImpl=fetch,env=process.env}={}) {
  const summary=buildSummary(data);
  if(!summary)return {status:'insufficient-data',suggestions:'At least three analyzed questions are needed before generating aggregate recommendations.'};
  const key=env.VISITOR_ASSISTANT_API_KEY||env.OPENAI_API_KEY;
  const model=env.NEX_INSIGHTS_MODEL||env.VISITOR_ASSISTANT_MODEL||env.OPENAI_MODEL;
  if(!key||!model)return {status:'unconfigured',suggestions:'The server-side OpenAI API key and model are not configured.'};
  const response=await fetchImpl('https://api.openai.com/v1/responses',{
    method:'POST',
    headers:{authorization:'Bearer '+key,'content-type':'application/json'},
    signal:AbortSignal.timeout(18000),
    body:JSON.stringify({
      model,store:false,max_output_tokens:1200,
      instructions:[
        'You advise Nexus Medical Transit about improving the Nex chatbot.',
        'You receive ONLY aggregated anonymous intent counts and recurring keyword labels, never raw visitor text.',
        'Suggest no more than five concrete knowledge-base or intent-recognition improvements.',
        'Separate evidence from hypotheses. Counts are questions, not unique visitors or bookings.',
        'Do not invent prices, service coverage, licensing, availability or medical policies.',
        'Do not request patient names, addresses, diagnosis, or medical records.',
        'For each suggestion identify what an administrator must verify against published approved business information.',
        'All changes require human review and approval. Do not claim any changes were published.'
      ].join(' '),
      input:JSON.stringify(summary)
    })
  });
  if(!response.ok)throw Error('AI provider unavailable ('+response.status+')');
  const result=await response.json();
  const suggestions=extractText(result);
  if(!suggestions)throw Error('AI returned no suggestions');
  return {status:'review-required',suggestions,summary};
}
module.exports={buildSummary,extractText,suggest};
