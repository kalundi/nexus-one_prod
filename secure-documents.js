(function(){
  const token=()=>sessionStorage.getItem('nexusAccessToken')||'';
  const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(value)||0);
  let pricing={},documents=[],activeDocument=null;
  const safeExternal=href=>/^https:\/\//i.test(href);
  function calculate(){
    const rate=pricing[document.getElementById('calcService')?.value];if(!rate)return;
    const miles=Math.max(0,Number(document.getElementById('calcMiles')?.value)||0);
    const wait=Math.max(0,Number(document.getElementById('calcWait')?.value)||0);
    const multiplier=Number(document.getElementById('calcPremium')?.value)||1;
    const extraMiles=Math.max(0,miles-Number(rate.includedMiles||0));
    const waitBlocks=Math.max(0,Math.ceil(wait/15));
    const base=Number(rate.base||0),mileage=extraMiles*Number(rate.perMile||0),waiting=waitBlocks*Number(rate.waitPer15||0);
    document.getElementById('calcFormula').textContent=`${money(base)} base + ${extraMiles.toFixed(1)} miles x ${money(rate.perMile)} + ${waitBlocks} wait block${waitBlocks===1?'':'s'} x ${money(rate.waitPer15)}${multiplier>1?' + 30% premium':''}`;
    document.getElementById('calcTotal').textContent=money((base+mileage+waiting)*multiplier);
  }
  function buildCalculator(config){
    if(!config||config.type!=='nexus-pricing')return '';
    return `<section class="embeddedCalculator" style="--x:${config.x}%;--y:${config.y}%;--w:${config.width}%;--h:${config.height}%" aria-label="Interactive example pricing calculator"><div class="embeddedCalcHead"><div><strong>EXAMPLE PRICING</strong><small>Calculated from current Nexus rates</small></div><output id="calcTotal">$156.00</output></div><div class="calculatorGrid"><label>Service<select id="calcService"></select></label><label>Total miles<input id="calcMiles" type="number" min="0" step="0.1" value="${Number(config.defaultMiles)||0}"></label><label>Wait minutes<input id="calcWait" type="number" min="0" step="15" value="${Number(config.defaultWaitMinutes)||0}"></label><label>Timing<select id="calcPremium"><option value="1">Normal weekday</option><option value="1.3">After hours / weekend / holiday (+30%)</option></select></label></div><div class="calcFormula" id="calcFormula"></div></section>`;
  }
  function buildHotspots(links=[]){return links.map(link=>`<a class="documentHotspot" style="--x:${link.x}%;--y:${link.y}%;--w:${link.width}%;--h:${link.height}%" href="${link.href}" ${safeExternal(link.href)?'target="_blank" rel="noopener"':''} aria-label="${link.label}"></a>`).join('')}
  function bindCalculator(config){
    if(!config||!document.getElementById('calcService'))return;
    const service=document.getElementById('calcService');
    service.innerHTML=Object.entries(pricing).map(([key,rate])=>`<option value="${key}">${rate.label}</option>`).join('');
    if(pricing[config.defaultService])service.value=config.defaultService;
    ['calcService','calcMiles','calcWait','calcPremium'].forEach(id=>document.getElementById(id)?.addEventListener('input',calculate));
    calculate();
  }
  function renderActionLinks(links=[]){
    const section=document.getElementById('documentActions'),list=document.getElementById('liveLinks');
    section.hidden=!links.length;
    list.innerHTML=links.map(link=>`<a href="${link.href}" ${safeExternal(link.href)?'target="_blank" rel="noopener"':''}>${link.label}</a>`).join('');
  }
  async function displayDocument(key){
    const selected=documents.find(document=>document.key===key);if(!selected)return;
    activeDocument=selected;
    const response=await fetch(`/api/secure-documents/${encodeURIComponent(selected.key)}/image`,{headers:{authorization:`Bearer ${token()}`},cache:'no-store'});
    if(!response.ok)throw new Error('Document access expired');
    const imageBlob=await response.blob();
    if(imageBlob.type!=='image/png'||imageBlob.size<1000)throw new Error('Protected document image is invalid');
    const imageDataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Unable to decode protected document'));reader.readAsDataURL(imageBlob)});
    const image=document.getElementById('documentImage');image.src=imageDataUrl;image.alt=selected.title;
    document.getElementById('protectedPage').setAttribute('aria-label',`${selected.title} secure viewer`);
    document.getElementById('documentOverlay').innerHTML=buildCalculator(selected.calculator)+buildHotspots(selected.links);
    bindCalculator(selected.calculator);renderActionLinks(selected.links);
    document.getElementById('accessStatus').textContent=selected.adminPreview?`Administrator preview: ${selected.title}`:`${selected.title} approved until ${new Date(selected.expiresAt).toLocaleString()}`;
  }
  async function load(){
    try{
      const [catalogResponse,settingsResponse]=await Promise.all([fetch('/api/secure-documents',{headers:{authorization:`Bearer ${token()}`},cache:'no-store'}),fetch('/api/settings/public',{cache:'no-store'})]);
      const catalog=await catalogResponse.json().catch(()=>({}));if(!catalogResponse.ok||!catalog.documents?.length)throw new Error('No active document grant');
      pricing=(await settingsResponse.json()).pricing||{};documents=catalog.documents;
      const chooser=document.getElementById('documentChooser'),select=document.getElementById('documentSelect');
      select.innerHTML=documents.map(document=>`<option value="${document.key}">${document.title}</option>`).join('');
      chooser.hidden=documents.length<2;select.addEventListener('change',()=>displayDocument(select.value).catch(showUnavailable));
      await displayDocument(documents[0].key);document.getElementById('documentPanel').hidden=false;
    }catch(error){showUnavailable();}
  }
  function showUnavailable(){document.getElementById('accessStatus').textContent='No active document authorization';document.getElementById('documentPanel').hidden=true;document.getElementById('accessDenied').hidden=false;}
  document.addEventListener('contextmenu',event=>event.preventDefault());
  document.addEventListener('dragstart',event=>event.preventDefault());
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&['s','p','c','a','u'].includes(event.key.toLowerCase()))event.preventDefault();});
  window.addEventListener('nexus:authorized',load,{once:true});
})();
