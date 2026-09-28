// Server-side seed only. Source PDFs live under netlify/, excluded from the static build.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import pg from 'pg';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
const catalog=require('../netlify/functions/_shared/mtm-requirements.cjs');
const root=new URL('../netlify/training-seed/',import.meta.url);
export async function seedTraining(client){
const manifest=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
try{
 await client.query('BEGIN');
 for(const market of ['DC','MD','VA'])await client.query(`INSERT INTO training_contract_subjects(name,scope,market,levels)
  SELECT 'Nexus Medical Transit','ORGANIZATION',$1,ARRAY['AMBULATORY','WHEELCHAIR','STRETCHER','AMBULANCE']::text[]
  WHERE NOT EXISTS(SELECT 1 FROM training_contract_subjects WHERE name='Nexus Medical Transit' AND scope='ORGANIZATION' AND market=$1)`,[market]);
 for(const item of manifest){
  const existing=await client.query('SELECT content_hash FROM training_materials WHERE policy_key=$1 AND version=$2',[item.key,item.version]);
  if(existing.rows.length){if(existing.rows[0].content_hash!==item.sha256)throw Error(`Version conflict: ${item.key}`);continue}
  const data=await readFile(new URL(item.file,root)),hash=createHash('sha256').update(data).digest('hex');
  if(hash!==item.sha256||data.subarray(0,5).toString()!=='%PDF-')throw Error(`Source integrity check failed: ${item.file}`);
  await client.query(`INSERT INTO training_materials(policy_key,version,title,description,kind,file_data,content_hash)
   VALUES($1,$2,$3,$4,'POLICY',$5,$6)`,[item.key,item.version,item.title,'Read this company policy and acknowledge your understanding. Any practical training or competency verification must be assigned separately.',data,hash]);
  console.log('Imported',item.key,item.version);
 }
 for(const key of ['external-fwa-hipaa','external-conduct','external-wheelchair','driver-duties','emergencies','equipment-familiarization']){
  const item=catalog.requirements.find(r=>r.key===key),version='link-'+item.sourceVersion.slice(0,12),hash=createHash('sha256').update(item.url).digest('hex');
  await client.query(`INSERT INTO training_materials(policy_key,version,title,description,kind,resource_url,content_hash,requires_external_evidence)
   VALUES($1,$2,$3,$4,'TRAINING',$5,$6,true) ON CONFLICT(policy_key,version) DO NOTHING`,['mtm-'+key,version,item.title,item.evidence+' Complete any external test or submission and provide its receipt to your administrator. Internal acknowledgment alone is not proof of external completion.',item.url,hash]);
 }
 await client.query('COMMIT');
}catch(error){await client.query('ROLLBACK');throw error}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const connectionString=process.env.NETLIFY_DB_URL||process.env.DATABASE_URL;
 if(!connectionString)throw Error('Set DATABASE_URL or NETLIFY_DB_URL to import training materials');
 const pool=new pg.Pool({connectionString,ssl:{rejectUnauthorized:false}}),client=await pool.connect();
 try{await seedTraining(client)}finally{client.release();await pool.end()}
}
