const { Pool } = require('pg');
let pool;
function connectionString(){
  const value=process.env.DATABASE_URL||process.env.NETLIFY_DB_URL;
  if(!value) throw new Error('DATABASE_URL or NETLIFY_DB_URL is required');
  return value;
}
function getPool(){
  if(!pool){
    pool=new Pool({connectionString:connectionString(),max:Number(process.env.DB_POOL_MAX||5),idleTimeoutMillis:30000,connectionTimeoutMillis:10000,ssl:{rejectUnauthorized:false}});
    pool.on('error',err=>console.error('PostgreSQL idle client error',err.message));
  }
  return pool;
}
async function query(text,params=[]){return getPool().query(text,params)}
module.exports={getPool,query};
