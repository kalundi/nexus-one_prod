(()=>{
'use strict';
const $=id=>document.getElementById(id);
const api='/.netlify/functions/nex-knowledge-drafts';
const status=msg=>{$('knowledgeStatus').textContent=msg;};
let recentPreview=null;
function fields(){return {reviewId:$('knowledgeReviewId').value,question:$('knowledgeQuestion').value.trim(),answer:$('knowledgeAnswer').value.trim(),source:$('knowledgeSource').value};}
async function request(method,body,path=''){
 const token=sessionStorage.getItem('nexusAccessToken')||'';
 const response=await fetch(api+path,{method,headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store'});
 const data=await response.json();
 if(!response.ok)throw Error(data.error||'Knowledge workspace request failed');
 return data;
}
function renderPreview(item,note){
 const area=$('knowledgePreviewArea');area.replaceChildren();
 const h=document.createElement('h3');h.textContent='Editorial answer preview';
 const question=document.createElement('p');question.textContent='Q: '+item.question;
 const answer=document.createElement('p');answer.textContent='A: '+item.answer;
 const source=document.createElement('p');source.textContent='Source page: '+item.source;
 const label=document.createElement('p');label.textContent=note||'Preview only — no changes published.';
 area.append(h,question,answer,source,label);
}
async function preview(){
 try{const value=fields();const data=await request('POST',{action:'preview',...value});
 recentPreview=JSON.stringify(value);renderPreview(data.preview,data.note);status('Entry passes structural safeguards. Confirm every fact against the selected page before approval.');
 }catch(error){recentPreview=null;status(error.message);}
}
function button(text,fn){
 const b=document.createElement('button');b.type='button';b.textContent=text;b.style.marginRight='8px';b.addEventListener('click',fn);return b;
}
async function refresh(){
 const container=$('knowledgeDraftList');
 try{
  const data=await request('GET');
  const source=$('knowledgeSource');
  source.replaceChildren();
  for(const s of data.sources||[]){const option=document.createElement('option');option.value=s;option.textContent=s;source.append(option);}
  container.replaceChildren();
  for(const item of data.drafts||[]){
   const article=document.createElement('article');article.style.cssText='border-top:1px solid #dbe4ef;padding:15px 0';
   const head=document.createElement('strong');head.textContent='Draft #'+item.id+' · '+item.state+' · revision '+item.revision+' · recommendation #'+item.review_id;
   const q=document.createElement('p');q.textContent=item.question;
   const src=document.createElement('p');src.textContent='Source: '+item.source;
   article.append(head,q,src);
   article.append(button('View preview',()=>renderPreview(item,'Editorial preview only.')));
   if(item.state==='draft'){
     article.append(button('Edit in form',()=>{$('knowledgeReviewId').value=item.review_id;$('knowledgeQuestion').value=item.question;$('knowledgeAnswer').value=item.answer;$('knowledgeSource').value=item.source;recentPreview=null;status('Draft #'+item.id+' loaded. Saving with the form will create a new draft; use the update button below to revise this one.');}));
     article.append(button('Update draft',async()=>{
       const current=fields();
       try{await request('PATCH',{id:item.id,revision:item.revision,action:'revise',...current});status('Draft updated; revision recorded.');await refresh();}catch(error){status(error.message);}
     }));
     article.append(button('Approve for export',async()=>{
       if(!window.confirm('Have you checked the complete answer against '+item.source+'? Approval does NOT publish it.'))return;
       try{await request('PATCH',{id:item.id,revision:item.revision,action:'approve',sourceVerified:true});status('Approved for export. Not published to Nex.');await refresh();}catch(error){status(error.message);}
     }));
     article.append(button('Archive',async()=>{
       if(!window.confirm('Archive this draft?'))return;
       try{await request('PATCH',{id:item.id,revision:item.revision,action:'archive'});status('Draft archived.');await refresh();}catch(error){status(error.message);}
     }));
   }
   if(item.state==='approved'){
     article.append(button('Export approved JSON',async()=>{
       try{
         const data=await request('GET',null,'?id='+encodeURIComponent(item.id)+'&export=1');
         const exportText=JSON.stringify(data.entry,null,2);
         await navigator.clipboard.writeText(exportText);
         status('Approved FAQ entry copied to clipboard for a separate GitHub PR. Nothing was published.');
       }catch(error){status('Export unavailable: '+error.message);}
     }));
   }
   container.append(article);
  }
  if(!(data.drafts||[]).length){const p=document.createElement('p');p.textContent='No knowledge drafts yet. Start from a reviewed recommendation.';container.append(p);}
 }catch(error){status(error.message);}
}
$('knowledgePreview').addEventListener('click',preview);
$('knowledgeDraftForm').addEventListener('submit',async event=>{
 event.preventDefault();
 const value=fields();
 if(JSON.stringify(value)!==recentPreview){status('Preview and validate the latest draft before saving.');return;}
 try{await request('POST',value);recentPreview=null;status('Draft saved for administrator review. Nothing published.');await refresh();}catch(error){status(error.message);}
});
$('knowledgeRefresh').addEventListener('click',refresh);
refresh();
})();