(function(){
 const DEFAULT={wheelchair:{label:'Wheelchair Transportation',base:98,includedMiles:8,perMile:4.1,waitPer15:18.75},ambulatory:{label:'Ambulatory Transportation',base:75,includedMiles:5,perMile:3.55,waitPer15:12.5},facility_transfer:{label:'Facility-to-Facility Transfer (Routine IFT)',base:165,includedMiles:8,perMile:5.25,waitPer15:30},facility_transfer_critical:{label:'Facility-to-Facility Transfer (High-Acuity IFT)',base:340,includedMiles:8,perMile:8.75,waitPer15:45},broda:{label:'Broda Chair Transportation',base:165,includedMiles:8,perMile:5.5,waitPer15:25},stretcher:{label:'Stretcher Transportation',base:455,includedMiles:8,perMile:7.95,waitPer15:36.25},bariatric:{label:'Bariatric Transportation',base:430,includedMiles:8,perMile:9.95,waitPer15:45},bls:{label:'BLS Ambulance',base:1125,includedMiles:0,perMile:18.5,waitPer15:50},als1:{label:'ALS I Ambulance',base:1395,includedMiles:0,perMile:21.5,waitPer15:62.5},als2:{label:'ALS II Ambulance',base:1450,includedMiles:0,perMile:24.5,waitPer15:75}};
 const getTrips=()=>{try{return JSON.parse(localStorage.getItem('nexusTrips')||'[]')}catch{return[]}};
 const getPricing=()=>{try{return {...DEFAULT,...JSON.parse(localStorage.getItem('nexusPricing')||'{}')}}catch{return DEFAULT}};
 const savePricing=p=>localStorage.setItem('nexusPricing',JSON.stringify(p));
 const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n)||0);
 window.NexusCore={DEFAULT,getTrips,getPricing,savePricing,money};
})();
