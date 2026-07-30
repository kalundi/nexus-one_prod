(function(){
  const KEYS={profile:'nexusPatientProfile',contacts:'nexusPatientContacts',docs:'nexusPatientDocuments',notifications:'nexusPatientNotifications',shares:'nexusLiveCareShares'};
  const read=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}};
  const write=(k,v)=>{localStorage.setItem(k,JSON.stringify(v));window.dispatchEvent(new CustomEvent('nexus:data',{detail:{key:k}}));return v};
  const defaults={
    profile:{name:'Jordan Patient',phone:'301-555-0184',email:'patient@example.com',mobility:'Wheelchair',language:'English',pickup:'Home residence',notes:'Door-through-door assistance requested.'},
    contacts:[{id:'EC-1',name:'Alex Morgan',relationship:'Caregiver',phone:'301-555-0127',notify:true}],
    docs:[{id:'DOC-1',name:'Transportation authorization.pdf',type:'Authorization',updated:'2026-07-12'}],
    notifications:[{id:'N-1',title:'Ride confirmed',body:'Your transportation to Holy Cross Germantown Hospital is confirmed.',time:'Today, 7:15 AM',read:false},{id:'N-2',title:'LiveCare ready',body:'Tracking will activate when your driver begins the trip.',time:'Yesterday',read:false}]
  };
  function seed(){Object.entries(defaults).forEach(([n,v])=>{const k=KEYS[n];if(localStorage.getItem(k)==null)write(k,v)});if(localStorage.getItem('nexusTrips')==null)write('nexusTrips',[{id:'NEX-260717-1042',patient:'Jordan Patient',pickup:'Home residence',destination:'Holy Cross Germantown Hospital',service:'Wheelchair Transportation',date:'2026-07-18',time:'09:30',status:'Confirmed',driver:'Pending assignment',vehicle:'Pending',eta:'—',fare:128.75},{id:'NEX-260710-0934',patient:'Jordan Patient',pickup:'Holy Cross Germantown Hospital',destination:'Home residence',service:'Wheelchair Transportation',date:'2026-07-10',time:'15:20',status:'Completed',driver:'M. Davis',vehicle:'NMT-104',fare:121.25}])}
  function trips(){return read('nexusTrips',[])}
  function createShare(tripId){const token='NXLC-'+Math.random().toString(36).slice(2,10).toUpperCase();const shares=read(KEYS.shares,[]);shares.push({token,tripId,created:new Date().toISOString(),expires:new Date(Date.now()+24*3600*1000).toISOString()});write(KEYS.shares,shares);return token}
  window.NexusPatient={KEYS,read,write,seed,trips,createShare};seed();
})();
