const {parseChannels,isDryRunValue,runSocialPublish}=require('./_shared/social-engine.cjs');

exports.handler=async ()=>{
 try{
  const channels=parseChannels(process.env.SOCIAL_AUTOMATION_CHANNELS||'');
  const dryRun=isDryRunValue(process.env.SOCIAL_AUTOMATION_DRY_RUN,true);
  const report=await runSocialPublish({channels,dryRun});

  return {
   statusCode:200,
   body:JSON.stringify(report)
  };
 }catch(error){
  console.error('[SOCIAL_PUBLISHER]',error.message);
  return {statusCode:500,body:JSON.stringify({error:error.message})};
 }
};
