const {test}=require('node:test'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs');
test('contact migration repairs existing bookings and supports optional contact creation and editing',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec("CREATE TABLE schema_migrations(version text PRIMARY KEY,description text);CREATE TABLE bookings(reference text PRIMARY KEY,email text);INSERT INTO bookings VALUES('EXISTING','primary@example.com');");
 const migration=fs.readFileSync('database/migrations/096.001_booking_alternate_contacts.sql','utf8');
 await db.exec(migration);await db.exec(migration);
 assert.deepEqual((await db.query("SELECT * FROM bookings WHERE reference='EXISTING'")).rows[0],{reference:'EXISTING',email:'primary@example.com',alternate_phone:null,alternate_email:null});
 await db.query('INSERT INTO bookings(reference,email,alternate_phone,alternate_email) VALUES($1,$2,$3,$4)',['NEW','primary@example.com','+12405550123','alternate@example.com']);
 await db.query('UPDATE bookings SET alternate_phone=$2,alternate_email=$3 WHERE reference=$1',['EXISTING','+12405550124','updated@example.com']);
 assert.equal((await db.query("SELECT alternate_phone FROM bookings WHERE reference='NEW'")).rows[0].alternate_phone,'+12405550123');
 assert.equal((await db.query("SELECT alternate_email FROM bookings WHERE reference='EXISTING'")).rows[0].alternate_email,'updated@example.com');
});
