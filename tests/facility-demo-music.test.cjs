const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','facility-demo-music.js'),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));

function element(){
 return {value:'',attributes:{},listeners:new Map(),
  addEventListener(name,listener){this.listeners.set(name,listener);},
  setAttribute(name,value){this.attributes[name]=String(value);},
  dispatch(name){this.listeners.get(name)?.();}
 };
}

function fixture({unsupported=false,rejectResume=false}={}){
 const contexts=[],oscillators=[],connections=[],timers=new Map();let timerId=0;
 const parameter=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(value){this.value=value;}});
 function node(extra={}){
  const item={connected:false,disconnects:0,...extra,
   connect(){this.connected=true;},disconnect(){this.connected=false;this.disconnects++;}
  };connections.push(item);return item;
 }
 class AudioContext{
  constructor(){this.currentTime=0;this.state='suspended';this.destination={};this.closeCalls=0;contexts.push(this);}
  createGain(){return node({gain:parameter()});}
  createDynamicsCompressor(){return node({threshold:parameter(),knee:parameter(),ratio:parameter()});}
  createOscillator(){const item=node({frequency:parameter(),started:false,stopCalls:[],start(){this.started=true;},stop(at){this.stopCalls.push(at);}});oscillators.push(item);return item;}
  async resume(){if(rejectResume)throw Error('Audio device unavailable');this.state='running';}
  async suspend(){this.state='suspended';}
  async close(){this.state='closed';this.closeCalls++;}
 }
 const window=element(),document=element();document.hidden=false;
 if(!unsupported)window.AudioContext=AudioContext;
 vm.runInNewContext(source,{window,document,
  setInterval(listener){const id=++timerId;timers.set(id,listener);return id;},
  clearInterval(id){timers.delete(id);}
 });
 const button=element(),volume=element(),status=element();
 const music=window.NexusDemoMusic.create({button,volume,status});
 return {button,volume,status,music,window,document,contexts,oscillators,connections,timers};
}

test('instrumental music requires a gesture, pauses cleanly and resumes the same audio context',async()=>{
 const f=fixture();
 assert.equal(f.contexts.length,0,'loading the demo must not create an audio context');
 assert.equal(f.oscillators.length,0,'loading the demo must not schedule sound');
 assert.equal(f.timers.size,0);
 assert.equal(f.button.textContent,'Play music');
 assert.equal(f.button.attributes['aria-pressed'],'false');
 assert.equal(f.volume.value,'12');
 assert.equal(f.volume.max,'40');

 f.button.dispatch('click');await settle();
 assert.equal(f.contexts.length,1);
 assert.equal(f.contexts[0].state,'running');
 assert.ok(f.oscillators.some(oscillator=>oscillator.started&&oscillator.connected),'play must schedule connected sound voices');
 assert.equal(f.timers.size,1);
 assert.equal(f.button.attributes['aria-pressed'],'true');

 f.volume.value='0';f.volume.dispatch('input');
 assert.equal(f.volume.attributes['aria-valuetext'],'0 percent');
 assert.equal(f.connections[0].gain.value,0,'volume can mute the master output');
 f.button.dispatch('click');await settle();
 assert.equal(f.button.textContent,'Resume music');
 assert.equal(f.contexts[0].state,'suspended');
 assert.equal(f.timers.size,0);
 assert.ok(f.oscillators.every(oscillator=>!oscillator.connected));
 assert.ok(f.oscillators.every(oscillator=>oscillator.stopCalls.includes(undefined)),'pause must cancel all scheduled voices immediately');

 f.button.dispatch('click');await settle();
 assert.equal(f.contexts.length,1,'resume should reuse the paused context');
 assert.equal(f.contexts[0].state,'running');
 assert.equal(f.button.textContent,'Pause music');
 assert.equal(f.timers.size,1);
 f.music.stop();
 assert.equal(f.contexts[0].state,'closed');
 assert.equal(f.timers.size,0);
 assert.ok(f.connections.every(connection=>!connection.connected),'stop must disconnect all audio nodes');
 assert.equal(f.button.textContent,'Play music');
 assert.equal(f.button.attributes['aria-pressed'],'false');
});

test('hiding or leaving the page fully stops audio and permits a later explicit restart',async()=>{
 const f=fixture();f.button.dispatch('click');await settle();
 f.document.hidden=true;f.document.dispatch('visibilitychange');await settle();
 assert.equal(f.contexts[0].closeCalls,1);
 assert.equal(f.timers.size,0);
 assert.ok(f.connections.every(connection=>!connection.connected));
 assert.equal(f.button.textContent,'Play music');

 f.document.hidden=false;f.document.dispatch('visibilitychange');await settle();
 assert.equal(f.contexts.length,1,'returning to the tab must not automatically restart music');
 assert.equal(f.timers.size,0);
 f.button.dispatch('click');await settle();
 assert.equal(f.contexts.length,2);
 f.window.dispatch('pagehide');await settle();
 assert.equal(f.contexts[1].closeCalls,1);
 assert.equal(f.timers.size,0);
 assert.ok(f.connections.every(connection=>!connection.connected));
 f.music.stop();f.music.stop();
 assert.equal(f.contexts[1].closeCalls,1,'stop remains safe when called repeatedly on logout');
 assert.equal(f.button.textContent,'Play music');
});

test('unsupported or unavailable audio leaves the demo usable without sound or timers',async()=>{
 const unsupported=fixture({unsupported:true});unsupported.button.dispatch('click');await settle();
 assert.match(unsupported.status.textContent,/unavailable in this browser/);
 assert.equal(unsupported.button.disabled,false);
 assert.equal(unsupported.contexts.length,0);
 assert.equal(unsupported.timers.size,0);

 const unavailable=fixture({rejectResume:true});unavailable.button.dispatch('click');await settle();
 assert.match(unavailable.status.textContent,/could not start/);
 assert.equal(unavailable.button.disabled,false);
 assert.equal(unavailable.button.textContent,'Play music');
 assert.equal(unavailable.contexts[0].state,'closed');
 assert.equal(unavailable.oscillators.length,0);
 assert.equal(unavailable.timers.size,0);
 assert.ok(unavailable.connections.every(connection=>!connection.connected));
});
