import pg from 'pg';

const context=String(process.env.CONTEXT||'').toLowerCase();
const isProduction=context==='production';
const cs=process.env.NETLIFY_DB_URL||process.env.DATABASE_URL;
if(!cs)throw Error('Set DATABASE_URL or NETLIFY_DB_URL');
if(isProduction&&/(localhost|127\.0\.0\.1|host\.docker\.internal)/i.test(cs)){
 throw Error('Refusing to run production DB check against a local database endpoint.');
}

const pool=new pg.Pool({connectionString:cs,ssl:{rejectUnauthorized:false}});
try{const a=await pool.query('SELECT current_database() db,now() checked_at');const b=await pool.query("SELECT version FROM schema_migrations ORDER BY version");console.log(JSON.stringify({connected:true,...a.rows[0],migrations:b.rows.map(x=>x.version)},null,2))}finally{await pool.end()}
