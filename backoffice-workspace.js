(function(){
  const STORAGE_PREFIX='nexusBackoffice.activeSection:';

  function getMain(){
    return document.querySelector('main.moduleMain, main#main');
  }

  function sectionLabel(section,index){
    const heading=section.querySelector('h2,h1,[data-bo-title]');
    const sub=section.querySelector('p,.muted,[data-bo-subtitle]');
    const title=(heading?.textContent||section.getAttribute('data-bo-title')||`Workspace ${index+1}`).trim();
    const subtitle=(section.getAttribute('data-bo-subtitle')||sub?.textContent||'Open this workspace to manage related operations.').trim();
    return {title,subtitle};
  }

  function ensureSectionId(section,index){
    if(section.id) return section.id;
    const generated=`bo-section-${index+1}`;
    section.id=generated;
    return generated;
  }

  function createDashboard(modules,introTitle,introCopy){
    const home=document.createElement('section');
    home.className='boDashboardHome';
    home.id='boDashboardHome';
    home.innerHTML=`
      <div class="boDashboardIntro">
        <p class="eyebrow">Back-office workspace</p>
        <h2>${introTitle}</h2>
        <p>${introCopy}</p>
      </div>
      <div class="boDashboardGrid" id="boDashboardGrid"></div>
    `;
    const grid=home.querySelector('#boDashboardGrid');
    modules.forEach((module)=>{
      const tile=document.createElement('button');
      tile.type='button';
      tile.className='boDashboardTile';
      tile.setAttribute('data-bo-section-target',module.id);
      tile.innerHTML=`
        <span class="boTileLabel">Module</span>
        <strong>${module.title}</strong>
        <small>${module.subtitle}</small>
      `;
      grid.appendChild(tile);
    });
    return home;
  }

  function createToolbar(){
    const toolbar=document.createElement('div');
    toolbar.className='boFocusToolbar';
    toolbar.id='boFocusToolbar';
    toolbar.innerHTML=`
      <button class="button secondary" id="boDashboardBack" type="button">Back to dashboard</button>
      <div>
        <p class="eyebrow">Focused workspace</p>
        <strong id="boFocusTitle">Operations</strong>
      </div>
    `;
    return toolbar;
  }

  function init(){
    if(document.body?.getAttribute('data-backoffice-workspace')!=='true') return;
    const main=getMain();
    if(!main) return;

    const sectionNodes=Array.from(main.children).filter((node)=>node.tagName==='SECTION'&&!node.hasAttribute('data-backoffice-ignore'));
    if(sectionNodes.length<2) return;

    const modules=sectionNodes.map((section,index)=>{
      const id=ensureSectionId(section,index);
      section.classList.add('boModuleSection');
      const meta=sectionLabel(section,index);
      return {id,section,title:meta.title,subtitle:meta.subtitle};
    });

    const introTitle=document.body.getAttribute('data-bo-title')||'Focus by operation area';
    const introCopy=document.body.getAttribute('data-bo-copy')||'Keep workspaces collapsed by default. Open one module at a time to reduce clutter and improve focus.';

    const dashboard=createDashboard(modules,introTitle,introCopy);
    const toolbar=createToolbar();
    main.insertBefore(toolbar,main.firstChild);
    main.insertBefore(dashboard,main.firstChild);

    const key=STORAGE_PREFIX+window.location.pathname;
    const focusTitle=document.getElementById('boFocusTitle');

    function setActiveTile(sectionId){
      main.querySelectorAll('[data-bo-section-target]').forEach((tile)=>{
        tile.classList.toggle('active',tile.getAttribute('data-bo-section-target')===sectionId);
      });
    }

    function showDashboard(){
      document.body.classList.add('boDashboardMode');
      document.body.classList.remove('boFocusMode');
      modules.forEach((module)=>module.section.classList.remove('focusVisible'));
      setActiveTile('');
      if(window.location.hash&&modules.some((m)=>`#${m.id}`===window.location.hash)){
        history.replaceState(null,'',window.location.pathname+window.location.search);
      }
    }

    function focusSection(sectionId,{persist=true,scroll=true}={}){
      const found=modules.find((m)=>m.id===sectionId);
      if(!found) return;
      document.body.classList.remove('boDashboardMode');
      document.body.classList.add('boFocusMode');
      modules.forEach((module)=>module.section.classList.toggle('focusVisible',module.id===sectionId));
      if(focusTitle) focusTitle.textContent=found.title;
      setActiveTile(sectionId);
      if(persist){
        try{localStorage.setItem(key,sectionId);}catch{}
      }
      if(window.location.hash!==`#${sectionId}`){
        history.replaceState(null,'',`#${sectionId}`);
      }
      if(scroll){
        found.section.scrollIntoView({behavior:'smooth',block:'start'});
      }
    }

    main.querySelectorAll('[data-bo-section-target]').forEach((tile)=>{
      tile.addEventListener('click',()=>{
        const id=tile.getAttribute('data-bo-section-target');
        if(id) focusSection(id,{persist:true,scroll:true});
      });
    });

    document.getElementById('boDashboardBack')?.addEventListener('click',showDashboard);

    window.addEventListener('hashchange',()=>{
      const id=String(window.location.hash||'').replace('#','').trim();
      if(modules.some((m)=>m.id===id)) focusSection(id,{persist:true,scroll:false});
    });

    let initial='';
    const hashId=String(window.location.hash||'').replace('#','').trim();
    if(modules.some((m)=>m.id===hashId)) initial=hashId;
    if(!initial){
      try{initial=localStorage.getItem(key)||'';}catch{}
    }
    if(initial&&modules.some((m)=>m.id===initial)) focusSection(initial,{persist:false,scroll:false});
    else showDashboard();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init);
  else init();
})();
