import pg from 'pg';
import crypto from 'node:crypto';
import Account from '../netlify/functions/_shared/facility-demo-account.cjs';
import Demo from '../netlify/functions/_shared/facility-demo.cjs';
if(process.env.CONTEXT!=='production'){console.log('Demo manager seed skipped outside production.');process.exit(0);}
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL||process.env.NETLIFY_DB_URL,ssl:{rejectUnauthorized:false}});
const client=await pool.connect();
try{
 await client.query('BEGIN');
 const result=await Account.provision(client.query.bind(client),process.env.NEXUS_ANNAPOLIS_DEMO_INITIAL_HASH,{scope:Account.SCOPE,username:Account.EMAIL,secret:crypto.randomBytes(32).toString('hex'),state:Demo.initialState()});
 const rotated=await Account.applyPasswordRotation(client.query.bind(client),process.env.NEXUS_ANNAPOLIS_DEMO_ROTATE_HASH);
 await client.query('COMMIT');
 console.log(JSON.stringify({account:Account.EMAIL,userCode:result.user.user_code,managedIn:'User Management',initialized:result.changed,passwordRotated:rotated,demoOnly:true}));
}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();await pool.end();}
