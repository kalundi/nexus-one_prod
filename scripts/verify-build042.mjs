import fs from 'node:fs';
const required=['universal-booking.js','dist/universal-booking.js','database/migrations/042.001_realtime_integrations.sql','netlify/functions/api.cjs','BUILD_042_UNIFIED_REAL_TIME_INTEGRATIONS.md'];
const missing=required.filter(x=>!fs.existsSync(x));
if(missing.length){console.error('Missing:',missing.join(', '));process.exit(1)}
const api=fs.readFileSync('netlify/functions/api.cjs','utf8');
for(const token of ['integrations/config','locations/search','gps/positions','STRIPE_SECRET_KEY','TWILIO_ACCOUNT_SID','SENDGRID_API_KEY'])if(!api.includes(token)){console.error('API verification failed:',token);process.exit(1)}
console.log('Build 042 verification passed.');
