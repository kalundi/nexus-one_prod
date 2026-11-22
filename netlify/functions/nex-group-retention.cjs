'use strict';
// Daily purge, even if the monitor is later turned off. No customer data in logs.
const {query}=require('./_shared/db.cjs');
async function handler(){
 try{
  await query("DELETE FROM nex_group_signals WHERE received_at < now() - interval '30 days'");
  return {statusCode:200,body:'Group metadata retention applied'};
 }catch{
  // Migration may not be installed on a new deployment.
  return {statusCode:503,body:'Group metadata retention unavailable'};
 }
}
exports.handler=handler;
