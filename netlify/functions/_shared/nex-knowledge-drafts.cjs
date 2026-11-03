'use strict';
// Editor-controlled staging only. Runtime Nex still imports checked-in approved JSON.
const crypto=require('node:crypto');
const {validate,SOURCES}=require('./nex-reviewed-knowledge.cjs');
const STATUS=new Set(['draft','approved','archived']);
const bad=(message,statusCode=400)=>Object.assign(Error(message),{statusCode});
function candidate(question,answer,source,actor,stamp='2026-01-01T00:00:00.000Z'){
  const q=String(question||'').trim(),a=String(answer||'').trim(),s=String(source||'').trim();
  const id='web-'+crypto.createHash('sha256').update(s+'\n'+q.toLowerCase()).digest('hex').slice(0,16);
  const entry={id,topic:'Website FAQ',questions:[q],keywords:[],answer:a,source:s,review_status:'approved',approved_by:String(actor||'editor'),approved_at:stamp};
  if(!validate(entry))throw bad('FAQ fails approved-knowledge rules. Check question length, answer length, allowed source, public contact numbers, rates and links.');
  return entry;
}
async function list(queryFn){
  const res=await queryFn("SELECT id,review_id,question,answer,source,state,revision,created_at,updated_at,approved_at,approved_by FROM nex_knowledge_drafts ORDER BY updated_at DESC LIMIT 50");
  return res.rows;
}
async function get(queryFn,id){
  if(!/^\d{1,15}$/.test(String(id)))throw bad('Invalid draft identifier');
  const r=await queryFn("SELECT id,review_id,question,answer,source,state,revision,created_at,updated_at,approved_at,approved_by FROM nex_knowledge_drafts WHERE id=$1",[String(id)]);
  return r.rows[0]||null;
}
async function save(queryFn,{reviewId,question,answer,source,actor}){
  candidate(question,answer,source,actor);
  if(!/^\d{1,15}$/.test(String(reviewId)))throw bad('Invalid review identifier');
  const r=await queryFn(
    "WITH inserted AS (INSERT INTO nex_knowledge_drafts(review_id,question,answer,source,created_by,updated_by) SELECT id,$2,$3,$4,$5,$5 FROM nex_insight_reviews WHERE id=$1 AND status='reviewed' RETURNING *) "+
    ",history AS (INSERT INTO nex_knowledge_draft_history(draft_id,revision,question,answer,source,state,changed_by) SELECT id,revision,question,answer,source,state,$5 FROM inserted RETURNING id) "+
    "SELECT id,review_id,question,answer,source,state,revision FROM inserted",
    [String(reviewId),String(question).trim(),String(answer).trim(),String(source).trim(),String(actor)]);
  if(!r.rows[0])throw bad('Review recommendation must be marked reviewed before drafting',409);
  return r.rows[0];
}
async function revise(queryFn,{id,revision,question,answer,source,actor}){
 if(!/^\d{1,15}$/.test(String(id))||!Number.isInteger(Number(revision))||Number(revision)<1)throw bad('Invalid draft identifier or revision');
 candidate(question,answer,source,actor);
 const sql="WITH updated AS (UPDATE nex_knowledge_drafts SET question=$3,answer=$4,source=$5,revision=revision+1,updated_by=$6,updated_at=now() WHERE id=$1 AND revision=$2 AND state='draft' RETURNING *) "+
 " ,history AS (INSERT INTO nex_knowledge_draft_history(draft_id,revision,question,answer,source,state,changed_by) SELECT id,revision,question,answer,source,state,$6 FROM updated RETURNING id) "+
 " SELECT id,review_id,question,answer,source,state,revision FROM updated";
 const r=await queryFn(sql,[String(id),Number(revision),String(question).trim(),String(answer).trim(),String(source).trim(),String(actor)]);
 if(!r.rows[0])throw bad('Draft changed, is missing, or is no longer editable',409);
 return r.rows[0];
}
async function transition(queryFn,{id,revision,action,actor}){
 if(!/^\d{1,15}$/.test(String(id))||!Number.isInteger(Number(revision))||Number(revision)<1)throw bad('Invalid draft identifier or revision');
 if(!['approve','archive'].includes(action))throw bad('Invalid draft transition');
 const prior=await get(queryFn,id);
 if(!prior)throw bad('Draft not found',404);
 if(prior.state!=='draft'||Number(prior.revision)!==Number(revision))throw bad('Draft was modified or already finalized',409);
 if(action==='approve')candidate(prior.question,prior.answer,prior.source,actor);
 const next=action==='approve'?'approved':'archived';
 const sql="WITH updated AS (UPDATE nex_knowledge_drafts SET state=$2,revision=revision+1,updated_by=$3,approved_by=CASE WHEN $2='approved' THEN $3 ELSE approved_by END,approved_at=CASE WHEN $2='approved' THEN now() ELSE approved_at END,updated_at=now() WHERE id=$1 AND revision=$4 AND state='draft' RETURNING *) "+
 " ,history AS (INSERT INTO nex_knowledge_draft_history(draft_id,revision,question,answer,source,state,changed_by) SELECT id,revision,question,answer,source,state,$3 FROM updated RETURNING id) "+
 " SELECT id,review_id,question,answer,source,state,revision,approved_at,approved_by FROM updated";
 const r=await queryFn(sql,[String(id),next,String(actor),Number(revision)]);
 if(!r.rows[0])throw bad('Draft changed before approval',409);
 return r.rows[0];
}
function exportEntry(row,actor){
  if(!row||row.state!=='approved'||!row.approved_at)throw bad('Only approved drafts can be exported',409);
  return candidate(row.question,row.answer,row.source,row.approved_by||actor,new Date(row.approved_at).toISOString());
}
module.exports={candidate,list,get,save,revise,transition,exportEntry,SOURCES,STATUS};
