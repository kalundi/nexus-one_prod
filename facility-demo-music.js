(()=>{'use strict';
 // Original instrumental: an eight-bar piano figure with a quiet sustained harmony.
 // All sound is synthesized locally and starts only after the listener presses Play.
 const CHORDS=[[48,52,55,59],[45,48,52,55],[41,45,48,52],[43,47,50,55],[48,52,55,59],[45,48,52,55],[41,45,48,52],[43,47,50,55]];
 const MELODY=[[76,null,79,null,74,null,72,null],[76,null,72,null,71,null,69,null],[72,null,76,null,77,null,76,null],[74,null,71,null,67,null,null,null],[79,null,76,null,74,null,72,null],[76,null,79,null,76,null,72,null],[77,null,76,null,72,null,69,null],[71,null,74,null,72,null,null,null]];
 const STEP=60/72/2,MAX_VOICES=40;

 function create({button,volume,status}){
  let context=null,master=null,compressor=null,timer=null,playing=false,starting=false,nextAt=0,step=0,generation=0;
  const voices=new Set();
  const say=message=>{if(status)status.textContent=message;};
  const level=()=>Math.max(0,Math.min(40,Number(volume?.value)||0))/100;
  function display(mode){
   button.textContent=mode==='playing'?'Pause music':mode==='paused'?'Resume music':'Play music';
   button.setAttribute('aria-pressed',String(mode==='playing'));
   button.setAttribute('aria-label',mode==='playing'?'Pause instrumental background music':mode==='paused'?'Resume instrumental background music':'Play instrumental background music');
   button.disabled=starting;
  }
  function release(voice){
   if(!voices.delete(voice))return;
   try{voice.oscillator.stop();}catch{}
   voice.oscillator.onended=null;voice.oscillator.disconnect();voice.gain.disconnect();
  }
  function note(midi,at,duration,kind,gain){
   if(!context||voices.size>=MAX_VOICES)return;
   const oscillator=context.createOscillator(),envelope=context.createGain(),voice={oscillator,gain:envelope};
   oscillator.type=kind==='pad'?'sine':'triangle';oscillator.frequency.value=440*Math.pow(2,(midi-69)/12);
   const attack=kind==='pad'?.55:.018,releaseTime=kind==='pad'?.9:.65,end=at+duration;
   envelope.gain.setValueAtTime(0,at);envelope.gain.linearRampToValueAtTime(gain,at+attack);
   envelope.gain.exponentialRampToValueAtTime(Math.max(.0001,gain*(kind==='pad'?.65:.18)),Math.max(at+attack+.01,end));
   envelope.gain.exponentialRampToValueAtTime(.0001,end+releaseTime);
   oscillator.connect(envelope);envelope.connect(master);voices.add(voice);
   oscillator.onended=()=>release(voice);oscillator.start(at);oscillator.stop(end+releaseTime+.03);
  }
  function schedule(){
   if(!playing||!context)return;
   // Keep the queue short so pause/volume changes remain immediate.
   if(nextAt<context.currentTime-.3)nextAt=context.currentTime+.04;
   while(nextAt<context.currentTime+.2){
    const bar=Math.floor(step/8),beat=step%8,chord=CHORDS[bar];
    if(beat===0){chord.forEach(midi=>note(midi,nextAt,STEP*7.2,'pad',.055));note(chord[0]-12,nextAt,STEP*3,'piano',.12);}
    if(beat%2===0)note(chord[(beat/2)%chord.length]+12,nextAt,STEP*1.6,'piano',.085);
    if(MELODY[bar][beat]!=null)note(MELODY[bar][beat],nextAt,STEP*1.7,'piano',.095);
    step=(step+1)%64;nextAt+=STEP;
   }
  }
  function silence(){
   clearInterval(timer);timer=null;playing=false;
   for(const voice of [...voices])release(voice);
  }
  function stop(){
   generation++;starting=false;silence();
   const previous=context;context=null;
   if(master){master.disconnect();master=null;}if(compressor){compressor.disconnect();compressor=null;}
   if(previous&&previous.state!=='closed')previous.close().catch(()=>{});
   step=0;nextAt=0;display('stopped');say('Instrumental music off.');
  }
  async function play(){
   const AudioContext=window.AudioContext||window.webkitAudioContext;
   if(!AudioContext){say('Background music is unavailable in this browser.');return;}
   const run=++generation;starting=true;display('stopped');
   try{
    if(!context){
     context=new AudioContext();master=context.createGain();compressor=context.createDynamicsCompressor();
     master.gain.value=level();compressor.threshold.value=-18;compressor.knee.value=20;compressor.ratio.value=3;
     master.connect(compressor);compressor.connect(context.destination);
    }
    await context.resume();
    if(run!==generation||!context)return;
    starting=false;playing=true;nextAt=context.currentTime+.06;display('playing');
    say('Original instrumental music playing quietly.');schedule();timer=setInterval(schedule,100);
   }catch{
    if(run!==generation)return;
    stop();say('Music could not start. Press Play music to try again.');
   }
  }
  button.addEventListener('click',()=>{
   if(starting)return;
   if(playing){silence();display('paused');say('Instrumental music paused.');if(context?.state==='running')context.suspend().catch(()=>{});}
   else play();
  });
  if(volume){
   volume.min='0';volume.max='40';volume.step='1';volume.value='12';
   const updateVolume=()=>{const value=level();volume.setAttribute('aria-valuetext',`${Math.round(value*100)} percent`);if(master&&context)master.gain.setTargetAtTime(value,context.currentTime,.08);};
   volume.addEventListener('input',updateVolume);updateVolume();
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  window.addEventListener('pagehide',stop);
  display('stopped');say('Instrumental music off. Press Play music to begin.');
  return {stop};
 }
 window.NexusDemoMusic={create};
})();
