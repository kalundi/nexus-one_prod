(function(){
  const PROFILE_KEY='nexusFacilityProfile';
  const PATIENTS_KEY='nexusFacilityPatients';
  const RECURRING_KEY='nexusRecurringTrips';
  const profileDefault={id:'FAC-1001',name:'Nexus Partner Care Center',accountNumber:'NMT-FAC-1001',billingType:'Monthly account billing',contactName:'Facility Coordinator',contactEmail:'transport@nexuspartner.org',contactPhone:'301-555-0148',address:'Montgomery County, Maryland',creditLimit:25000,terms:'Net 30'};
  const patientsDefault=[
    {id:'P-1001',name:'Mary Johnson',mobility:'Wheelchair',payer:'Facility account',notes:'Door-through-door assistance'},
    {id:'P-1002',name:'John Davis',mobility:'Stretcher',payer:'Medicaid',notes:'Oxygen at 2 LPM'},
    {id:'P-1003',name:'Sarah Smith',mobility:'Ambulatory',payer:'Private pay',notes:'Companion traveling'}
  ];
  const recurringDefault=[
    {id:'REC-1001',patientId:'P-1001',patient:'Mary Johnson',service:'wheelchair',days:['MO','WE','FR'],pickupTime:'07:15',returnTime:'11:45',pickup:'Nexus Partner Care Center',destination:'Dialysis Center',startDate:new Date().toISOString().slice(0,10),status:'Active'},
    {id:'REC-1002',patientId:'P-1003',patient:'Sarah Smith',service:'ambulatory',days:['TU','TH'],pickupTime:'09:00',returnTime:'13:00',pickup:'Nexus Partner Care Center',destination:'Physical Therapy',startDate:new Date().toISOString().slice(0,10),status:'Active'}
  ];
  const read=(key,fallback)=>{try{const value=JSON.parse(localStorage.getItem(key)||'null');return value||fallback}catch{return fallback}};
  const write=(key,value,eventName)=>{localStorage.setItem(key,JSON.stringify(value));window.dispatchEvent(new CustomEvent(eventName,{detail:value}));return value};
  const getProfile=()=>read(PROFILE_KEY,profileDefault);
  const saveProfile=value=>write(PROFILE_KEY,value,'nexus-facility-profile-updated');
  const getPatients=()=>read(PATIENTS_KEY,patientsDefault);
  const savePatients=value=>write(PATIENTS_KEY,value,'nexus-facility-patients-updated');
  const getRecurring=()=>read(RECURRING_KEY,recurringDefault);
  const saveRecurring=value=>write(RECURRING_KEY,value,'nexus-recurring-updated');
  const uid=prefix=>prefix+'-'+Date.now().toString(36).toUpperCase();
  window.NexusFacility={getProfile,saveProfile,getPatients,savePatients,getRecurring,saveRecurring,uid};
})();
