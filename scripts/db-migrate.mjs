import pg from 'pg';import {readFile,readdir} from 'node:fs/promises';import path from 'node:path';

const context=String(process.env.CONTEXT||'').toLowerCase();
const isProduction=context==='production';
const cs=process.env.NETLIFY_DB_URL||process.env.DATABASE_URL;
if(!cs)throw Error('Set DATABASE_URL or NETLIFY_DB_URL');
if(isProduction&&/(localhost|127\.0\.0\.1|host\.docker\.internal)/i.test(cs)){
 throw Error('Refusing to run production migration against a local database endpoint.');
}
const pool=new pg.Pool({connectionString:cs,ssl:{rejectUnauthorized:false}});
try{await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations(version varchar(64) PRIMARY KEY,description text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');for(const file of (await readdir('database/migrations')).filter(f=>f.endsWith('.sql')).sort()){const version=file.split('_')[0];const found=await pool.query('SELECT 1 FROM schema_migrations WHERE version=$1',[version]);if(found.rowCount){console.log('skip',version);continue}await pool.query(await readFile(path.join('database/migrations',file),'utf8'));console.log('applied',version)}}finally{await pool.end()}
