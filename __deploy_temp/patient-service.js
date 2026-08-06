(function(){
  const KEYS={profile:'nexusPatientProfile',contacts:'nexusPatientContacts',docs:'nexusPatientDocuments',notifications:'nexusPatientNotifications',shares:'nexusLiveCareShares'};
  const read=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}};
  const write=(k,v)=>{localStorage.setItem(k,JSON.stringify(v));window.dispatchEvent(new CustomEvent('nexus:data',{detail:{key:k}}));return v};
  const defaults={
    profile:{name:'',phone:'',email:'',mobility:'Wheelchair',language:'',pickup:'',notes:''},
    contacts:[],
    docs:[],
    notifications:[]
  };
  function seed(){Object.entries(defaults).forEach(([n,v])=>{const k=KEYS[n];if(localStorage.getItem(k)==null)write(k,v)});if(localStorage.getItem('nexusTrips')==null)write('nexusTrips',[])}
  function trips(){return read('nexusTrips',[])}
  function createShare(tripId){const token='NXLC-'+Math.random().toString(36).slice(2,10).toUpperCase();const shares=read(KEYS.shares,[]);shares.push({token,tripId,created:new Date().toISOString(),expires:new Date(Date.now()+24*3600*1000).toISOString()});write(KEYS.shares,shares);return token}
  window.NexusPatient={KEYS,read,write,seed,trips,createShare};seed();
})();

