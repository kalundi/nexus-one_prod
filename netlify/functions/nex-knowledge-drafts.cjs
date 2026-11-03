'use strict';
// Admin-only editorial workspace. Approval stages exportable entries; it does NOT publish.
const {json,bearer,parseBody}=require('./_shared/http.cjs');
const {requireUser,audit}=require('./_shared/auth.cjs');
const {query}=require('./_shared/db.cjs');
const Drafts=require('./_shared/nex-knowledge-drafts.cjs');
exports.handler=async event=>{
 if(!['GET','POST','PATCH'].includes(event.httpMethod))return json(405,{error:'Method not allowed'});
 try{
   const actor=await requireUser(bearer(event),['ADMIN']);
   if(!actor.session_id)return json(403,{error:'An active administrator session is required.'});
   const p=event.queryStringParameters||{};
   if(event.httpMethod==='GET'){
     if(p.id){
       const item=await Drafts.get(query,p.id);
       if(!item)return json(404,{error:'Draft not found'});
       if(p.export==='1')return json(200,{entry:Drafts.exportEntry(item,actor.id),publishing:'manual-github-review-required',note:'Export is not publication. Open a GitHub pull request updating nex-approved-knowledge.json and merge after regression testing.'});
       return json(200,{draft:item,preview:{question:item.question,answer:item.answer,source:item.source,disclaimer:'Editorial preview only; not published to Nex.'}});
     }
     return json(200,{drafts:await Drafts.list(query),sources:[...Drafts.SOURCES]});
   }
   const body=parseBody(event);
   if(event.httpMethod==='POST'){
     if(body.action==='preview'){
       const entry=Drafts.candidate(body.question,body.answer,body.source,actor.id);
       return json(200,{valid:true,preview:{question:entry.questions[0],answer:entry.answer,source:entry.source},note:'This preview validates the entry shape, not whether the website source corroborates the factual claims. Administrator must verify the source manually.'});
     }
     const saved=await Drafts.save(query,{reviewId:body.reviewId,question:body.question,answer:body.answer,source:body.source,actor:actor.id});
     await audit('NEX_KNOWLEDGE_DRAFT',saved.id,'NEX_KNOWLEDGE_DRAFT_CREATED',{actor:actor.id,reviewId:saved.review_id}).catch(()=>{});
     return json(201,{draft:saved});
   }
   let item;
   if(body.action==='revise')item=await Drafts.revise(query,{id:body.id,revision:body.revision,question:body.question,answer:body.answer,source:body.source,actor:actor.id});
   else if(body.action==='approve'||body.action==='archive'){
     if(body.action==='approve'&&body.sourceVerified!==true)return json(400,{error:'Administrator must explicitly attest that the cited website source supports the entire answer.'});
     item=await Drafts.transition(query,{id:body.id,revision:body.revision,action:body.action,actor:actor.id});
   }else return json(400,{error:'Unknown editorial action'});
   await audit('NEX_KNOWLEDGE_DRAFT',item.id,'NEX_KNOWLEDGE_'+body.action.toUpperCase(),{actor:actor.id,revision:item.revision}).catch(()=>{});
   return json(200,{draft:item,published:false});
 }catch(error){
   const code=error.statusCode||503;
   return json(code,{error:error.statusCode?error.message:'Knowledge workspace unavailable. Verify the database migration.'});
 }
};
