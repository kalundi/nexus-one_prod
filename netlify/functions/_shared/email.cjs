// All outbound system email uses Postmark. Credentials stay on the server.
function configuration({broadcast=false}={}){
 const token=String(process.env.POSTMARK_SERVER_TOKEN||'').trim();
 const from=String(process.env.POSTMARK_FROM_EMAIL||process.env.EMAIL_FROM||'').trim();
 const stream=String(broadcast?process.env.POSTMARK_BROADCAST_MESSAGE_STREAM||'':process.env.POSTMARK_MESSAGE_STREAM||'outbound').trim();
 return {token,from,stream,configured:Boolean(token&&from&&stream)};
}
function isConfigured(options){return configuration(options).configured;}
async function sendEmail(to,subject,html,options={}){
 const config=configuration(options);
 const recipients=[...new Set((Array.isArray(to)?to:String(to||'').split(/[;,]/)).map(value=>String(value||'').trim()).filter(Boolean))];
 if(!config.configured||!recipients.length)return {status:'skipped',provider:'Postmark'};
 const from=options.fromEmail||config.from;
 const payload={From:from.includes('<')?from:`${options.fromName||'Nexus Medical Transit'} <${from}>`,To:recipients.join(','),Subject:subject,HtmlBody:html,MessageStream:config.stream};
 if(options.broadcast)payload.HtmlBody+='\n<p><a href="{{{ pm:unsubscribe }}}">Unsubscribe</a></p>';
 if(options.replyTo)payload.ReplyTo=options.replyTo;
 if(options.attachments?.length)payload.Attachments=options.attachments.map(a=>({Name:a.filename||'attachment.txt',Content:String(a.content||''),ContentType:a.type||'application/octet-stream'})).filter(a=>a.Content);
 const response=await fetch('https://api.postmarkapp.com/email',{method:'POST',signal:AbortSignal.timeout(15000),headers:{'X-Postmark-Server-Token':config.token,Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify(payload)});
 const result=await response.json().catch(()=>null);
 if(!response.ok||result?.ErrorCode!==0||!result?.MessageID)throw Object.assign(new Error(`Postmark request failed (${response.status}; code ${Number(result?.ErrorCode)||'unknown'})`),{providerStatus:response.status,providerCode:Number(result?.ErrorCode)||null});
 return {status:'sent',provider:'Postmark',messageId:result.MessageID,providerStatus:response.status};
}
module.exports={configuration,isConfigured,sendEmail};
