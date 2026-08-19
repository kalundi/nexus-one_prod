(function(){
  const token=()=>sessionStorage.getItem('nexusAccessToken')||'';
  const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(value)||0);
  let pricing={};
  function calculate(){
    const rate=pricing[document.getElementById('calcService').value];if(!rate)return;
    const miles=Math.max(0,Number(document.getElementById('calcMiles').value)||0);
    const wait=Math.max(0,Number(document.getElementById('calcWait').value)||0);
    const multiplier=Number(document.getElementById('calcPremium').value)||1;
    const extraMiles=Math.max(0,miles-Number(rate.includedMiles||0));
    const waitBlocks=Math.max(0,Math.ceil(wait/15));
    const base=Number(rate.base||0),mileage=extraMiles*Number(rate.perMile||0),waiting=waitBlocks*Number(rate.waitPer15||0);
    const total=(base+mileage+waiting)*multiplier;
    document.getElementById('calcFormula').textContent=`${money(base)} base + ${extraMiles.toFixed(1)} miles x ${money(rate.perMile)} + ${waitBlocks} wait block${waitBlocks===1?'':'s'} x ${money(rate.waitPer15)}${multiplier>1?' + 30% premium':''}`;
    document.getElementById('calcTotal').textContent=money(total);
  }
  async function load(){
    try{
      const catalogResponse=await fetch('/api/secure-documents',{headers:{authorization:`Bearer ${token()}`},cache:'no-store'});
      const catalog=await catalogResponse.json().catch(()=>({}));
      const access=catalog.documents?.find(item=>item.key==='transportation-rates');
      if(!catalogResponse.ok||!access)throw new Error('No active document grant');
      const [imageResponse,settingsResponse]=await Promise.all([fetch('/api/secure-documents/transportation-rates/image',{headers:{authorization:`Bearer ${token()}`},cache:'no-store'}),fetch('/api/settings/public',{cache:'no-store'})]);
      if(!imageResponse.ok)throw new Error('Document access expired');
      document.getElementById('documentImage').src=URL.createObjectURL(await imageResponse.blob());
      const settings=await settingsResponse.json();pricing=settings.pricing||{};
      const service=document.getElementById('calcService');service.innerHTML=Object.entries(pricing).map(([key,rate])=>`<option value="${key}">${rate.label}</option>`).join('');
      if(pricing.wheelchair)service.value='wheelchair';
      ['calcService','calcMiles','calcWait','calcPremium'].forEach(id=>document.getElementById(id).addEventListener('input',calculate));
      calculate();
      document.getElementById('accessStatus').textContent=access.adminPreview?'Administrator preview access':`Approved until ${new Date(access.expiresAt).toLocaleString()}`;
      document.getElementById('documentPanel').hidden=false;
    }catch(error){document.getElementById('accessStatus').textContent='No active document authorization';document.getElementById('accessDenied').hidden=false;}
  }
  document.addEventListener('contextmenu',event=>event.preventDefault());
  document.addEventListener('dragstart',event=>event.preventDefault());
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&['s','p','c','a','u'].includes(event.key.toLowerCase()))event.preventDefault();});
  window.addEventListener('nexus:authorized',load,{once:true});
})();
