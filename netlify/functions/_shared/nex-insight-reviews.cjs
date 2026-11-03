'use strict';
// Data is AI-authored from aggregated anonymous analytics; never publish it as approved FAQ.
const ALLOWED=new Set(['reviewed','dismissed']);
async function list(queryFn,limit=25){
 const n=Math.max(1,Math.min(50,Number(limit)||25));
 const result=await queryFn("SELECT id,created_at,period_days,suggestion,status,reviewed_at FROM nex_insight_reviews ORDER BY id DESC LIMIT $1",[n]);
 return result.rows;
}
async function get(queryFn,id){
 if(!/^\d{1,15}$/.test(String(id)))return null;
 const r=await queryFn("SELECT id,created_at,period_days,suggestion,status,reviewed_at FROM nex_insight_reviews WHERE id=$1",[String(id)]);
 return r.rows[0]||null;
}
async function save(queryFn,actor,days,suggestion){
 if(typeof suggestion!=='string'||!suggestion.trim()||suggestion.length>12000)throw Object.assign(Error('Invalid suggestion'),{statusCode:400});
 const d=Math.max(1,Math.min(90,Number(days)||30));
 const r=await queryFn("INSERT INTO nex_insight_reviews(created_by,period_days,suggestion) VALUES($1,$2,$3) RETURNING id,created_at,period_days,suggestion,status,reviewed_at",[String(actor),d,suggestion.trim()]);
 return r.rows[0];
}
async function setStatus(queryFn,id,status,actor){
 if(!/^\d{1,15}$/.test(String(id))||!ALLOWED.has(status))throw Object.assign(Error('Invalid review action'),{statusCode:400});
 const r=await queryFn("UPDATE nex_insight_reviews SET status=$2,reviewed_by=$3,reviewed_at=now() WHERE id=$1 AND status='pending' RETURNING id,created_at,period_days,suggestion,status,reviewed_at",[String(id),status,String(actor)]);
 return r.rows[0]||null;
}
module.exports={list,get,save,setStatus};
