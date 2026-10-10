import fs from 'node:fs';
import pg from 'pg';

// Correct confirmed legacy trip types without changing invoices, payment amounts,
// assignments, or inventing return pickup times. Our estimate recalculates on read.
const nameIndex=process.argv.indexOf('--patient-name');
const patientName=nameIndex>=0?process.argv[nameIndex+1]?.trim():'';
if(!patientName)throw Error('Provide --patient-name with the confirmed patient name.');
const apply=process.argv.includes('--apply');
const connectionString=process.env.DATABASE_URL||process.env.NETLIFY_DB_URL;
if(!connectionString)throw Error('Set DATABASE_URL or NETLIFY_DB_URL.');
const pool=new pg.Pool({connectionString,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
const client=await pool.connect();
try{
 await client.query('BEGIN');
 const before=await client.query(`SELECT reference,trip_type,return_trip_date,return_trip_time,status FROM bookings WHERE lower(name)=lower($1) AND booking_source='BROKER' AND trip_type IS DISTINCT FROM 'ROUND_TRIP' ORDER BY reference FOR UPDATE`,[patientName]);
 if(!apply){
  console.log(JSON.stringify({mode:'preview',matchingTrips:before.rows.length,returnTime:'Preserve any supplied time; otherwise pending',references:before.rows.map(row=>row.reference)},null,2));
  await client.query('ROLLBACK');
 }else{
  const references=before.rows.map(row=>row.reference);
  if(references.length){
   const snapshotPath=`output/broker-round-trip-repair-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
   fs.writeFileSync(snapshotPath,JSON.stringify(before.rows,null,2));
   await client.query(`UPDATE bookings SET trip_type='ROUND_TRIP',return_trip_date=COALESCE(return_trip_date,trip_date),updated_at=now() WHERE reference=ANY($1::text[])`,[references]);
   await client.query(`INSERT INTO trip_status_history(booking_reference,status,status_label,note,actor) SELECT reference,status,lower(replace(status,'_',' ')),'Trip type corrected to round trip per administrator confirmation. Return pickup time remains pending unless already provided.','ADMIN' FROM bookings WHERE reference=ANY($1::text[])`,[references]);
   await client.query('COMMIT');
   console.log(JSON.stringify({mode:'applied',updatedTrips:references.length,snapshot:snapshotPath},null,2));
  }else{await client.query('COMMIT');console.log(JSON.stringify({mode:'applied',updatedTrips:0}));}
 }
}catch(error){await client.query('ROLLBACK');throw error;}
finally{client.release();await pool.end();}
