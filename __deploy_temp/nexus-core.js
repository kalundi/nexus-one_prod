(function(){
 const DEFAULT={wheelchair:{label:'Wheelchair Transportation',base:95,includedMiles:10,perMile:4.25,waitPer15:25},ambulatory:{label:'Ambulatory Transportation',base:65,includedMiles:5,perMile:3.25,waitPer15:20},broda:{label:'Broda Chair Transportation',base:145,includedMiles:10,perMile:5.25,waitPer15:25},stretcher:{label:'Stretcher Transportation',base:260,includedMiles:10,perMile:7.5,waitPer15:35},bariatric:{label:'Bariatric Transportation',base:385,includedMiles:10,perMile:9.5,waitPer15:45},bls:{label:'BLS Ambulance',base:725,includedMiles:0,perMile:17.5,waitPer15:55},als1:{label:'ALS I Ambulance',base:925,includedMiles:0,perMile:20,waitPer15:65},als2:{label:'ALS II Ambulance',base:1350,includedMiles:0,perMile:23,waitPer15:75}};
 const getTrips=()=>{try{return JSON.parse(localStorage.getItem('nexusTrips')||'[]')}catch{return[]}};
 const getPricing=()=>{try{return {...DEFAULT,...JSON.parse(localStorage.getItem('nexusPricing')||'{}')}}catch{return DEFAULT}};
 const savePricing=p=>localStorage.setItem('nexusPricing',JSON.stringify(p));
 const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n)||0);
 window.NexusCore={DEFAULT,getTrips,getPricing,savePricing,money};
})();