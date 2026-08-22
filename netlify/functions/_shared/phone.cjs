function normalizeE164(value,{defaultCountryCode='1'}={}){
 const raw=String(value||'').trim();
 if(!raw)return '';
 const hasPlus=raw.startsWith('+');
 const digits=raw.replace(/\D/g,'');
 const normalized=hasPlus?`+${digits}`:(digits.length===10?`+${defaultCountryCode}${digits}`:'');
 return /^\+[1-9]\d{7,14}$/.test(normalized)?normalized:'';
}

function formatPhoneDisplay(value){
 const normalized=normalizeE164(value);
 if(!normalized)return String(value||'').trim();
 const digits=normalized.slice(1);
 if(digits.length===11&&digits.startsWith('1'))return `+1 (${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
 const countryLength=digits.length>12?3:digits.length>10?2:1;
 const country=digits.slice(0,countryLength),national=digits.slice(countryLength);
 return `+${country} ${national.replace(/(\d{3})(?=\d)/g,'$1 ').trim()}`;
}

module.exports={normalizeE164,formatPhoneDisplay};
