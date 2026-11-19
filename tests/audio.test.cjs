const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
async function moduleFrom(file){return import(require('node:url').pathToFileURL(path.resolve(file)).href);}
async function fixture(){
 const {AudioEngine}=await moduleFrom('src/audio.js');
 const engine=new AudioEngine({},message=>{throw Error(message);});
 const parameter=()=>({value:1,cancelScheduledValues(){},setValueAtTime(){},linearRampToValueAtTime(){},setTargetAtTime(){}});
 const node=()=>({gain:parameter(),connect(){},disconnect(){}});
 engine.context={currentTime:0,createGain:node,createBufferSource:()=>({...node(),playbackRate:{value:1},start(){},stop(){this.onended?.();}})};
 engine.bus=node();engine.previewBus=node();engine.micGain=node();
 let resolve;const loading=new Promise(r=>resolve=r);engine.buffer=()=>loading;
 return {engine,loaded:()=>resolve({duration:10}),sound:{id:'clip',name:'Clip',mode:'restart',volume:100}};
}
test('switching microphones keeps the previous stream when the new input fails',async t=>{
 const {engine}=await fixture();
 const previousTrack={stopped:false,stop(){this.stopped=true;}};
 const previousStream={getTracks:()=>[previousTrack]};
 const previousSource={disconnected:false,disconnect(){this.disconnected=true;}};
 const nextTrack={stop(){}};
 const nextStream={getTracks:()=>[nextTrack]};
 engine.init=async()=>{};
 engine.recompute=()=>{};
 engine.micStream=previousStream;
 engine.micSource=previousSource;
 engine.context.createMediaStreamSource=()=>({connect(){},disconnect(){}});
 const mediaDevices={getUserMedia:async()=>{throw Error('Input unavailable');}};
 const navigatorObject=globalThis.navigator;
 const descriptor=Object.getOwnPropertyDescriptor(navigatorObject,'mediaDevices');
 Object.defineProperty(navigatorObject,'mediaDevices',{value:mediaDevices,configurable:true});
 t.after(()=>{if(descriptor)Object.defineProperty(navigatorObject,'mediaDevices',descriptor);else delete navigatorObject.mediaDevices;});

 await assert.rejects(engine.enableMic(true,'camo'),/Input unavailable/);
 assert.equal(engine.micStream,previousStream);
 assert.equal(previousTrack.stopped,false);
 assert.equal(previousSource.disconnected,false);

 mediaDevices.getUserMedia=async()=>nextStream;
 assert.equal(await engine.enableMic(true,'camo'),true);
 assert.equal(engine.micStream,nextStream);
 assert.equal(previousTrack.stopped,true);
 assert.equal(previousSource.disconnected,true);

 const constraints=[];
 mediaDevices.getUserMedia=async({audio})=>{
  constraints.push(audio);
  if(audio.echoCancellation?.exact==='all'){
   throw Object.assign(Error('Full-system AEC unavailable'),{name:'OverconstrainedError',constraint:'echoCancellation'});
  }
  return {getTracks:()=>[{stop(){}}]};
 };
 assert.equal(await engine.setSpeakerEchoCancellation(true),true);
 assert.deepEqual(constraints.map(input=>[input.deviceId,input.echoCancellation]),[
  [{exact:'camo'},{exact:'all'}],
  [{exact:'camo'},{exact:true}],
 ]);
 await engine.setSpeakerEchoCancellation(false);
 assert.equal(constraints.at(-1).echoCancellation,false);
});
test('stop all and hold release cancel an in-flight decode before it can produce sound',async()=>{
 for(const action of ['stop','release']){const {engine,loaded,sound}=await fixture();sound.mode='hold';const pending=engine.trigger(sound);if(action==='stop')engine.stopAll();else await engine.trigger(sound,{phase:'release'});loaded();await pending;assert.equal(engine.instances.length,0);}
});
test('overlap survives a shared cold decode while restart replaces pending playback',async()=>{
 for(const [mode,count]of [['overlap',2],['restart',1]]){const {engine,loaded,sound}=await fixture();sound.mode=mode;const pending=[engine.trigger(sound),engine.trigger(sound)];loaded();await Promise.all(pending);assert.equal(engine.instances.length,count);engine.stopAll();assert.equal(engine.instances.length,0);}
});
test('pause retains a trimmed playback position and resumes from it',async()=>{
 const {engine,loaded,sound}=await fixture();sound.mode='pause';sound.trimStart=2;sound.trimEnd=8;const pending=engine.trigger(sound);loaded();await pending;engine.context.currentTime=1.5;await engine.trigger(sound);assert.equal(engine.instances[0].offset,3.5);assert.equal(engine.snapshot()[0].paused,true);engine.context.currentTime=5;await engine.trigger(sound);assert.equal(engine.position(engine.instances[0]),3.5);engine.context.currentTime=6;assert.equal(engine.position(engine.instances[0]),4.5);
});
test('closing a monitor preview keeps the broadcast instance of the same clip running',async()=>{
 const {engine,loaded,sound}=await fixture();const playing=engine.trigger(sound);loaded();await playing;await engine.trigger(sound,{preview:true});assert.equal(engine.instances.length,2);engine.stopPreviews();assert.equal(engine.instances.length,1);assert.equal(engine.instances[0].preview,false);
});
test('stopping one playback instance preserves overlapping copies and other sounds',async()=>{
 const {engine,loaded,sound}=await fixture();sound.mode='overlap';const first=engine.trigger(sound);loaded();await first;await engine.trigger(sound);await engine.trigger({...sound,id:'other'});
 const before=engine.snapshot();assert.equal(new Set(before.map(i=>i.instanceId)).size,3);engine.stopInstance(before[0].instanceId);const after=engine.snapshot();assert.equal(after.length,2);assert.equal(after.filter(i=>i.id===sound.id).length,1);assert.ok(after.some(i=>i.id==='other'));engine.stopAll();assert.equal(engine.snapshot().length,0);
});
test('dock ordering puts the last ending sound first and accounts for playback speed',async()=>{
 const {orderPlaying}=await moduleFrom('src/playback-order.js');const voices=[{id:'fast',end:20,position:0,speed:2},{id:'long',end:16,position:1,speed:1},{id:'soon',end:4,position:1,speed:1}];assert.deepEqual(orderPlaying(voices).map(v=>v.id),['long','fast','soon']);assert.deepEqual(voices.map(v=>v.id),['fast','long','soon']);
});
test('looping and paused sounds sort as indefinite; ties preserve instance order',async()=>{
 const {orderPlaying}=await moduleFrom('src/playback-order.js');const voices=[{id:'finite',end:99,position:0},{id:'loop',loop:true},{id:'paused',paused:true},{id:'equal-a',end:5,position:0},{id:'equal-b',end:8,position:3}];assert.deepEqual(orderPlaying(voices).map(v=>v.id),['loop','paused','finite','equal-a','equal-b']);
});
test('playback progress preserves the board state reference until playback activity changes',async()=>{
 const {createPlaybackDisplay}=await moduleFrom('src/playback-display.js');
 const display=createPlaybackDisplay();
 const first={id:'a',instanceId:'1',position:0,paused:false};
 const second={...first,instanceId:'2'};
 const preview={id:'b',instanceId:'soundlab',preview:true};
 display.update([first,second,preview]);
 const activity=display.getActivity();
 let notified=0;
 const unsubscribe=display.subscribe(()=>notified++);
 display.update([{...first,position:1},second,preview]);
 assert.equal(display.getActivity(),activity);
 assert.equal(display.getPad('a').position,1);
 assert.equal(display.getVoices().length,3);
 assert.deepEqual([...activity.previewIds],['b']);
 display.update([{...first,paused:true},second]);
 assert.notEqual(display.getActivity(),activity);
 assert.equal(display.getActivity().boardAudio,true);
 assert.equal(display.getActivity().playingPadIds.has('a'),false);
 display.update([second]);
 assert.equal(display.getActivity().playingPadIds.has('a'),true);
 display.update([]);
 display.update([]);
 assert.equal(display.getActivity().boardAudio,false);
 assert.equal(notified,4);
 unsubscribe();
 display.update([second]);
 assert.equal(notified,4);
});
test('a second stop-mode press during loading cancels the pending playback',async()=>{
 const {engine,loaded,sound}=await fixture();sound.mode='stop';const pending=engine.trigger(sound);await engine.trigger(sound);loaded();await pending;assert.equal(engine.instances.length,0);
});
test('updated community audio invalidates decoded buffers and late old loads cannot overwrite it',async()=>{
 const {AudioEngine}=await moduleFrom('src/audio.js');const originalFetch=global.fetch;let releaseOld;const oldBytes=new Promise(r=>releaseOld=r);
 try{let n=0;global.fetch=async()=>({ok:true,arrayBuffer:()=>++n===1?oldBytes:Promise.resolve(new Uint8Array([2]).buffer)});const engine=new AudioEngine({invoke:async()=>'/clip'},message=>{throw Error(message);});engine.init=async()=>{};engine.recompute=()=>{};engine.context={decodeAudioData:async bytes=>({duration:1,length:1,numberOfChannels:1,version:new Uint8Array(bytes)[0]})};
 const old=engine.buffer({id:'clip',audioFile:'audio/old.mp3'});await new Promise(r=>setImmediate(r));engine.updateSound({id:'clip',audioFile:'audio/new.mp3'});const current=await engine.buffer({id:'clip',audioFile:'audio/new.mp3'});releaseOld(new Uint8Array([1]).buffer);await old;assert.equal(current.version,2);assert.equal(await engine.buffer({id:'clip',audioFile:'audio/new.mp3'}),current);assert.equal(n,2);
 }finally{global.fetch=originalFetch;}
});
test('decoded audio cache evicts by recent use without interrupting an active sound',async()=>{
 const {engine,sound}=await fixture();
 delete engine.buffer;
 const originalFetch=global.fetch;
 const decodes=new Map();
 engine.init=async()=>{};
 engine.api.invoke=async(_channel,id)=>id;
 engine.context.decodeAudioData=async id=>{
  decodes.set(id,(decodes.get(id)||0)+1);
  return {length:(id==='oversized'?72:24)*1024*1024/8,numberOfChannels:2,duration:10};
 };
 try{
  global.fetch=async id=>({ok:true,arrayBuffer:async()=>id});
  await engine.trigger(sound);
  const playing=engine.instances[0],original=playing.buffer;
  const recent={...sound,id:'recent'};
  const warm=await engine.buffer(recent);
  assert.equal(await engine.buffer(sound),original);
  await engine.buffer({...sound,id:'new'});
  assert.equal(decodes.get(sound.id),1);
  const reloaded=await engine.buffer(recent);
  assert.notEqual(reloaded,warm);
  assert.equal(decodes.get(recent.id),2);
  assert.equal(playing.source.buffer,original);
  assert.equal(engine.instances[0],playing);
  const oversized={...sound,id:'oversized'};
  await engine.trigger(oversized);
  assert.equal(engine.instances[1].sound.id,'oversized');
  await engine.buffer(oversized);
  assert.equal(decodes.get(oversized.id),2);
  assert.equal(await engine.buffer(recent),reloaded);
  assert.equal(decodes.get(recent.id),2);
  assert.equal(engine.bufferBytes,48*1024*1024);
 }finally{global.fetch=originalFetch;}
});
test('invalidating an in-flight decode prevents a late result from reusing the same revision',async()=>{
 const {AudioEngine}=await moduleFrom('src/audio.js');
 const originalFetch=global.fetch;
 let finishOld;
 const oldDecode=new Promise(resolve=>{finishOld=resolve;});
 const stale={length:1,numberOfChannels:1};
 const fresh={length:2,numberOfChannels:1};
 let calls=0;
 const engine=new AudioEngine({invoke:async()=>'/clip'},()=>{});
 engine.init=async()=>{};
 engine.context={decodeAudioData:async()=>++calls===1?oldDecode:fresh};
 try{
  global.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)});
  const sound={id:'clip',audioFile:'audio/clip.wav'};
  const old=engine.buffer(sound);
  await new Promise(resolve=>setImmediate(resolve));
  engine.invalidateBuffer(sound.id);
  assert.equal(await engine.buffer(sound),fresh);
  finishOld(stale);
  assert.equal(await old,stale);
  assert.equal(await engine.buffer(sound),fresh);
  assert.equal(calls,2);
  assert.equal(engine.bufferBytes,8);
 }finally{global.fetch=originalFetch;}
});
test('preview output resolves a virtual Windows default to a physical speaker',async()=>{
 const {choosePreviewOutput}=await moduleFrom('src/preview-routing.js');const devices=[{kind:'audiooutput',deviceId:'default',label:'Default - CABLE Input',groupId:'virtual'},{kind:'audiooutput',deviceId:'cable',label:'CABLE Input',groupId:'virtual'},{kind:'audiooutput',deviceId:'speaker',label:'Speakers (Realtek)',groupId:'physical'}];assert.equal(choosePreviewOutput(devices,'default').deviceId,'speaker');assert.equal(choosePreviewOutput(devices,'cable').deviceId,'speaker');assert.equal(choosePreviewOutput(devices,'speaker').deviceId,'speaker');
});
test('preview remains muted and never routes to an available virtual-only output',async()=>{
 const {routePreviewOutput}=await moduleFrom('src/preview-routing.js');const routes=[],element={sinkId:'default',muted:false,setSinkId:async id=>routes.push(id)};await assert.rejects(routePreviewOutput(element,'default',[{kind:'audiooutput',deviceId:'cable',label:'CABLE Input'}]),/No physical listening/);assert.equal(element.muted,true);assert.deepEqual(routes,[]);
});
test('preview changes sinks while muted and resolves a physical default to its explicit ID',async()=>{
 const {routePreviewOutput}=await moduleFrom('src/preview-routing.js');const changes=[],element={sinkId:'default',muted:false,setSinkId:async function(id){changes.push({id,muted:this.muted});this.sinkId=id;}};const result=await routePreviewOutput(element,'default',[{kind:'audiooutput',deviceId:'default',label:'Default - Headphones',groupId:'phones'},{kind:'audiooutput',deviceId:'phones',label:'Headphones',groupId:'phones'}]);assert.equal(result.deviceId,'phones');assert.deepEqual(changes,[{id:'phones',muted:true}]);
});
test('replay exports a capped stereo PCM WAV with separate source channels',async()=>{
 const {Recorder}=await moduleFrom('src/recorder.js');const recorder=new Recorder();recorder.context={sampleRate:8};recorder.captureSource='both';const frame=[new Float32Array([1,.5,0,-.5,-1,.2,.3,.4]),new Float32Array([0,0,0,0,0,0,0,0])];recorder.ring={both:[frame,frame],mic:[frame,frame],system:[frame,frame]};const blob=recorder.captureReplay(1);const bytes=Buffer.from(await blob.arrayBuffer());assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WAVE');assert.equal(bytes.readUInt16LE(22),2);assert.equal(bytes.readUInt32LE(24),8);assert.equal(bytes.readUInt32LE(40),8*2*2);assert.equal(bytes.readInt16LE(44),32767);assert.equal(bytes.readInt16LE(46),0);assert.deepEqual(Object.keys(blob.channels),['both','mic','system']);
});
test('replay encodes across frame boundaries with identical WAV bytes for each source',async()=>{
 const {Recorder}=await moduleFrom('src/recorder.js');
 const recorder=new Recorder();
 recorder.context={sampleRate:4};
 recorder.captureSource='both';
 const samples=Float32Array.from([.1,.2,-2,-1,-.5,.5,0,1,2,NaN,Infinity,-Infinity]);
 for(const [i,name] of ['mic','system','both'].entries()){
  const left=samples.slice(i),right=Float32Array.from(left,(_,n)=>left[left.length-n-1]);
  recorder.ring[name]=[[left.subarray(0,3),right.subarray(0,3)],[left.subarray(3,7),right.subarray(3,7)],[left.subarray(7),right.subarray(7)]];
 }
 for(const seconds of [1.5,2,45]){
  const output=recorder.captureReplay(seconds);
  assert.equal(output,output.channels.both);
  for(const [name,frames] of Object.entries(recorder.ring)){
   const left=frames.flatMap(frame=>Array.from(frame[0])).slice(-seconds*4);
   const right=frames.flatMap(frame=>Array.from(frame[1])).slice(-seconds*4);
   const reference=recorder.wav({length:left.length,numberOfChannels:2,sampleRate:4,getChannelData:i=>i?right:left});
   assert.deepEqual(await output.channels[name].arrayBuffer(),await reference.arrayBuffer());
  }
 }
});
test('recording trim preserves stereo PCM frame alignment and duration',async()=>{
 const {Recorder,recordingBuffer,trimRecording}=await moduleFrom('src/recorder.js');const recorder=new Recorder(),left=new Float32Array(32).fill(.5),right=new Float32Array(32).fill(-.25);const blob=recorder.wav({numberOfChannels:2,length:32,sampleRate:8,getChannelData:i=>i?right:left});const result=await recordingBuffer(await trimRecording(blob,1,2.5));assert.equal(result.duration,1.5);assert.equal(result.numberOfChannels,2);assert.equal(result.length,12);assert.ok(Math.abs(result.getChannelData(0)[0]-.5)<.001);assert.ok(Math.abs(result.getChannelData(1)[0]+.25)<.001);
});
