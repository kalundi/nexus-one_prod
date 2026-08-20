(function nexusAnalytics(){
  'use strict';

  const MEASUREMENT_ID='G-DG643Y2BMX';
  window.dataLayer=window.dataLayer||[];
  window.gtag=window.gtag||function(){window.dataLayer.push(arguments);};
  window.gtag('js',new Date());
  window.gtag('config',MEASUREMENT_ID,{
    anonymize_ip:true,
    allow_google_signals:false,
    send_page_view:true
  });

  const loader=document.createElement('script');
  loader.async=true;
  loader.src=`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
  document.head.appendChild(loader);

  window.nexusTrack=function(eventName,parameters){
    if(eventName)window.gtag('event',eventName,parameters||{});
  };

  function destinationPath(anchor){
    try{return new URL(anchor.href,window.location.href).pathname;}catch{return '';}
  }

  document.addEventListener('click',function(event){
    const anchor=event.target.closest('a[href]');
    if(!anchor)return;
    const href=String(anchor.getAttribute('href')||'');
    const path=destinationPath(anchor);
    if(href.startsWith('tel:')){
      window.nexusTrack('phone_click',{link_location:window.location.pathname});
    }else if(href.startsWith('mailto:')){
      window.nexusTrack('email_click',{link_location:window.location.pathname});
    }else if(path==='/booking-app.html'||path==='/booking'){
      window.nexusTrack('booking_start',{link_location:window.location.pathname});
    }else if(path==='/livecare.html'||path==='/livecare'){
      window.nexusTrack('livecare_open',{link_location:window.location.pathname});
    }
  },{capture:true});
})();
