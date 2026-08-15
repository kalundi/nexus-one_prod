const {json,bearer}=require('./_shared/http.cjs');
const {requireUser}=require('./_shared/auth.cjs');
const {diagnoseFacebook}=require('./_shared/social-clients.cjs');

exports.handler=async(event)=>{
 try{
  if(String(event.httpMethod||'GET').toUpperCase()!=='GET')return json(405,{error:'Method not allowed'});
  await requireUser(bearer(event),['ADMIN']);
  return json(200,{facebook:await diagnoseFacebook()});
 }catch(error){
  return json(Number(error.statusCode||500),{error:String(error.message||'Diagnostics failed')});
 }
};
