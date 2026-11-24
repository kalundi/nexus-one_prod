/* Local, conservative extraction. All values remain unconfirmed until review. */
(function(root){
 const days=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
 const iso=d=>d.toISOString().slice(0,10);
 function extract(message,today){
  const raw=String(message||'').trim(),s=raw.toLowerCase(),out={};
  const base=new Date(today+'T12:00:00Z');
  if(!Number.isFinite(base.getTime()))return out;
  const date=s.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if(date){const d=new Date(date[1]+'T12:00:00Z');if(Number.isFinite(d.getTime())&&iso(d)===date[1]&&date[1]>=today)out.date=date[1];}
  else if(/\btomorrow\b/.test(s)){base.setUTCDate(base.getUTCDate()+1);out.date=iso(base);}
  else if(/\btoday\b/.test(s))out.date=today;
  else {const day=s.match(/\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);if(day&&!/\bevery\b/.test(s)){let n=(days.indexOf(day[2])-base.getUTCDay()+7)%7;if(!n)n=7;base.setUTCDate(base.getUTCDate()+n);out.date=iso(base);}}
  const times=[...s.matchAll(/\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/g)];
  const time=m=>String(Number(m[1])%12+(m[3][0]==='p'?12:0)).padStart(2,'0')+':'+(m[2]||'00');
  if(times.length===1&&!/\b(return|ride back|pick me up afterward)\s*(at|around|by)\b/.test(s))out.time=time(times[0]);
  if(times.length===2&&/\b(return|back|afterward)\b/.test(s)){out.time=time(times[0]);out.returnTime=time(times[1]);}
  if(/\b(appointment|dialysis|arrive by|get there by)\b/.test(s))out.basis='APPOINTMENT';
  else if(/\b(pickup time|pick me up at)\b/.test(s))out.basis='PICKUP';
  if(/\b(round[\s-]?trip|there and back|ride back|return ride)\b/.test(s))out.tripType='ROUND_TRIP';
  else if(/\b(one[\s-]?way)\b/.test(s))out.tripType='ONE_WAY';
  else if(/\b(every|recurring|repeat)\b/.test(s))out.tripType='RECURRING';
  const services=['wheelchair','stretcher','ambulatory','broda','bariatric'];
  const found=services.filter(v=>new RegExp('\\b'+v+'\\b').test(s));if(found.length===1)out.service=found[0];
  if(/\b(from home|pick me up at home|usual pickup|saved pickup)\b/.test(s))out.savedPickup=true;
  const dest=raw.match(/\b(?:ride\s+to|going\s+to|heading\s+to|take me to|destination is)\s+(.+?)(?=\s+(?:tomorrow|today|next\s+\w+|on\s+\d{4}-|at\s+\d|for\s+my|and back|from home)\b|[.!?]?$)/i);
  if(dest&&dest[1].trim()&&!/^(my usual|usual|same|home)$/i.test(dest[1].trim()))out.destination=dest[1].trim();
  return out;
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={extract};else root.NexusBookingIntent={extract};
})(typeof window==='undefined'?globalThis:window);
