import {routePreviewOutput,resolveOutput} from './preview-routing.js';

const BUFFER_CACHE_LIMIT = 64 * 1024 * 1024;

export class AudioEngine {
  constructor(api, onError) {this.api=api;this.onError=onError;this.instanceSeq=0;this.instances=[];this.buffers=new Map();this.bufferBytes=0;this.loads=new Map();this.pending=new Map();this.epoch=0;this.settings={master:80,monitorVolume:70,monitor:true,outputDevice:'default',monitorDevice:'default',micVolume:100};}
  async init(){
    if(this.initializing)return this.initializing;
    this.initializing=this.initialize().catch(async error=>{
      if(this.deviceChange)navigator.mediaDevices.removeEventListener('devicechange',this.deviceChange);
      this.broadcastOutput=null;
      for(const player of [this.legacyBroadcast,this.monitorOutput]){
        if(player){player.pause();player.srcObject=null;}
      }
      try{await this.context?.close();}catch{}
      this.context=null;
      throw error;
    }).finally(()=>{this.initializing=null;});
    return this.initializing;
  }
  async initialize(){
    if(!this.context){
      this.context=new AudioContext({latencyHint:'interactive'});
      this.bus=this.context.createGain();this.master=this.context.createGain();this.monitor=this.context.createGain();this.previewBus=this.context.createGain();this.micGain=this.context.createGain();
      this.limiter=this.context.createDynamicsCompressor();this.limiter.threshold.value=-3;this.limiter.knee.value=0;this.limiter.ratio.value=20;this.limiter.attack.value=.003;this.limiter.release.value=.1;
      this.soundBroadcast=this.context.createGain();this.soundMonitor=this.context.createGain();this.micBroadcast=this.context.createGain();this.micMonitor=this.context.createGain();this.micInput=this.context.createGain();
      await this.context.audioWorklet.addModule(new URL('noise-gate.js',document.baseURI).href);
      this.gate=new AudioWorkletNode(this.context,'soundboard-noise-gate');
      this.bus.connect(this.limiter);this.limiter.connect(this.soundBroadcast);this.soundBroadcast.connect(this.master);this.limiter.connect(this.soundMonitor);this.soundMonitor.connect(this.monitor);
      this.micInput.connect(this.gate);this.gate.connect(this.micGain);this.micGain.connect(this.micBroadcast);this.micBroadcast.connect(this.master);this.micGain.connect(this.micMonitor);this.micMonitor.connect(this.monitor);
      this.master.gain.value=0;
      this.legacyBroadcast=null;
      if(typeof this.context.setSinkId==='function'){
        // Send the broadcast directly to its device without a media-element buffer.
        this.broadcastOutput=this.context;
        this.master.connect(this.context.destination);
      }else{
        const destination=this.context.createMediaStreamDestination();
        this.legacyBroadcast=new Audio();
        this.legacyBroadcast.srcObject=destination.stream;
        this.broadcastOutput=this.legacyBroadcast;
        this.master.connect(destination);
      }
      const monitorDestination=this.context.createMediaStreamDestination();
      this.monitor.connect(monitorDestination);this.previewBus.connect(monitorDestination);
      this.meters={};for(const [key,node]of Object.entries({input:this.micInput,output:this.master,monitor:this.monitor,voice:this.micGain,sound:this.limiter,micMonitor:this.micMonitor,micBroadcast:this.micBroadcast,soundMonitor:this.soundMonitor,soundBroadcast:this.soundBroadcast})){const analyser=this.context.createAnalyser();analyser.fftSize=512;node.connect(analyser);this.meters[key]={analyser,values:new Float32Array(512)};}
      this.previewBus.connect(this.meters.monitor.analyser);
      this.monitorOutput=new Audio();this.monitorOutput.muted=true;this.monitorOutput.srcObject=monitorDestination.stream;
      this.deviceChange=()=>{this.monitorOutput.muted=true;this.applySettings(this.settings).catch(error=>this.onError(error.message));};navigator.mediaDevices.addEventListener('devicechange',this.deviceChange);
      await this.applySettings(this.settings);
    }
    if(this.context.state!=='running')await this.context.resume();
    await Promise.all([this.legacyBroadcast,this.monitorOutput].filter(player=>player?.paused).map(player=>player.play()));
  }
  async applySettings(settings){
    this.settings={...this.settings,...settings};
    if(!this.broadcastOutput)return;
    const update=(this.settingsUpdate||Promise.resolve()).catch(()=>{}).then(()=>this.configureSettings());
    this.settingsUpdate=update;
    try{await update;}finally{if(this.settingsUpdate===update)this.settingsUpdate=null;}
  }
  async configureSettings(){
    const s=this.settings,gain=(key,fallback=100)=>Math.max(0,Math.min(2,(s[key]??fallback)/100));
    const device=s.outputDevice||'default';
    const sinkId=!this.legacyBroadcast&&device==='default'?'':device;
    if(this.broadcastOutput.sinkId!==sinkId){
      this.master.gain.value=0;
      await this.broadcastOutput.setSinkId(sinkId);
    }
    // Two sinks on the same device must not duplicate the sound.
    const devices=await navigator.mediaDevices.enumerateDevices();
    try{this.previewDevice=await routePreviewOutput(this.monitorOutput,s.monitorDevice||'default',devices);this.previewRouteError=null;this.monitorOutput.muted=!!s.monitorMuted;}catch(error){this.previewDevice=null;this.previewRouteError=error;}
    const sharedSink=!!this.previewDevice&&this.previewDevice.deviceId===resolveOutput(devices,s.outputDevice||'default')?.deviceId;
    this.monitor.gain.value=this.previewDevice&&s.monitor&&!s.monitorMuted&&!sharedSink?gain('monitorVolume',70):0;
    this.previewBus.gain.value=!this.previewDevice||s.monitorMuted?0:Math.max(0,Math.min(1,s.monitorVolume/100));
    if(sharedSink!==!!this.sharedMeter){if(sharedSink)this.master.connect(this.meters.monitor.analyser);else this.master.disconnect(this.meters.monitor.analyser);this.sharedMeter=sharedSink;}
    this.micInput.gain.value=s.micMuted?0:gain('micVolume');
    for(const key of ['soundBroadcast','soundMonitor','micBroadcast','micMonitor'])this[key].gain.value=s[key+'Muted']?0:gain(key,key==='micMonitor'?0:100);
    this.gate.parameters.get('enabled').value=s.noiseGate?1:0;this.gate.parameters.get('threshold').value=Math.max(-60,Math.min(0,s.noiseGateThreshold??-50));
    if(this.micStream&&this.appliedSuppression!==!!s.noiseSuppression){await this.micStream.getAudioTracks()[0].applyConstraints({noiseSuppression:!!s.noiseSuppression});this.appliedSuppression=!!s.noiseSuppression;}
    if(s===this.settings)this.master.gain.value=s.broadcastMuted?0:gain('master',80);
    this.recompute();
  }
  async setSpeakerEchoCancellation(enabled){
    if(!this.micStream)return true;
    return this.enableMic(true,this.activeMicDevice,enabled);
  }
  async enableMic(enabled,deviceId='default',echoCancellation=!!this.settings.speakerEchoCancellation){
    const request=this.micRequest=(this.micRequest||0)+1;
    let stream=null,source=null;
    const suppression=!!this.settings.noiseSuppression;
    if(enabled){
      await this.init();
      const audio={deviceId:deviceId==='default'?undefined:{exact:deviceId},echoCancellation:echoCancellation?{exact:'all'}:false,noiseSuppression:suppression,autoGainControl:false};
      try{stream=await navigator.mediaDevices.getUserMedia({audio});}
      catch(error){
        if(!echoCancellation||error.name!=='OverconstrainedError'||error.constraint!=='echoCancellation')throw error;
        if(request!==this.micRequest)return false;
        stream=await navigator.mediaDevices.getUserMedia({audio:{...audio,echoCancellation:{exact:true}}});
      }
      if(request!==this.micRequest){stream.getTracks().forEach(track=>track.stop());return false;}
      try{source=this.context.createMediaStreamSource(stream);source.connect(this.micInput);}
      catch(error){source?.disconnect();stream.getTracks().forEach(track=>track.stop());throw error;}
    }
    this.micSource?.disconnect();
    this.micStream?.getTracks().forEach(track=>track.stop());
    this.micStream=stream;
    this.micSource=source;
    this.activeMicDevice=stream?deviceId:null;
    if(stream)this.appliedSuppression=suppression;
    this.recompute();
    return true;
  }
  removeCachedBuffer(id){
    const cached=this.buffers.get(id);
    if(!cached)return;
    this.buffers.delete(id);
    this.bufferBytes-=cached.bytes;
  }
  invalidateBuffer(id){
    this.removeCachedBuffer(id);
    this.loads.delete(id);
  }
  async buffer(sound){
    const {id}=sound,revision=sound.audioFile||sound.audioUrl||id;
    const cached=this.buffers.get(id);
    if(cached&&cached.revision===revision){
      this.buffers.delete(id);
      this.buffers.set(id,cached);
      return cached.buffer;
    }
    const loading=this.loads.get(id);
    if(loading&&loading.revision===revision)return loading.promise;

    this.invalidateBuffer(id);
    const entry={revision};
    entry.promise=(async()=>{
      await this.init();
      const response=await fetch(await this.api.invoke('sound-play-url',id));
      if(!response.ok)throw Error('Không đọc được tệp âm thanh.');
      const buffer=await this.context.decodeAudioData(await response.arrayBuffer());
      const bytes=buffer.length*buffer.numberOfChannels*Float32Array.BYTES_PER_ELEMENT;
      if(this.loads.get(id)===entry&&bytes<=BUFFER_CACHE_LIMIT){
        while(this.bufferBytes+bytes>BUFFER_CACHE_LIMIT){
          this.removeCachedBuffer(this.buffers.keys().next().value);
        }
        // Playing and paused instances retain their own references to the decoded audio.
        this.buffers.set(id,{revision,buffer,bytes});
        this.bufferBytes+=bytes;
      }
      return buffer;
    })().finally(()=>{
      if(this.loads.get(id)===entry)this.loads.delete(id);
    });
    this.loads.set(id,entry);
    return entry.promise;
  }
  bounds(sound,buffer){const start=Math.max(0,Math.min(Number(sound.trimStart)||0,buffer.duration-.01));const end=Number(sound.trimEnd)>start?Math.min(Number(sound.trimEnd),buffer.duration):buffer.duration;return {start,end};}
  position(instance){if(instance.paused)return instance.offset;const elapsed=(this.context.currentTime-instance.startedAt)*instance.speed;const p=instance.offset+elapsed;return instance.loop?instance.start+(p-instance.start)%(instance.end-instance.start):Math.min(instance.end,p);}
  async trigger(sound,{phase='press',toggleHold=false,preview=false}={}){
    if(phase==='release'){this.pending.delete(sound.id);if(sound.mode==='hold')this.stop(sound.id);return;}
    const existing=this.instances.filter(i=>i.sound.id===sound.id&&i.preview===preview);
    if(!preview){
      if(['pause','stop'].includes(sound.mode)&&!existing.length&&this.pending.get(sound.id)?.size){this.pending.delete(sound.id);return;}
      if((sound.mode==='stop'||sound.mode==='hold'&&toggleHold)&&existing.length){this.stop(sound.id);return;}
      if(sound.mode==='pause'&&existing.length){for(const i of existing)i.paused?this.resume(i):this.pause(i);return;}
      if(sound.mode==='restart'||sound.mode==='hold')this.stop(sound.id);
      if(sound.stopOthers)this.stopAll();
    }else this.stopPreviews();
    const epoch=this.epoch,token=Symbol();if(!this.pending.has(sound.id))this.pending.set(sound.id,new Set());this.pending.get(sound.id).add(token);
    try{const buffer=await this.buffer(sound);if(preview&&this.previewRouteError)throw this.previewRouteError;if(epoch!==this.epoch||!this.pending.get(sound.id)?.has(token))return;this.pending.get(sound.id).delete(token);if(!this.pending.get(sound.id).size)this.pending.delete(sound.id);
      const {start,end}=this.bounds(sound,buffer),i={instanceId:String(++this.instanceSeq),sound:{...sound},buffer,start,end,offset:start,startedAt:0,speed:Math.max(.5,Math.min(3.5,Number(sound.speed)||1)),loop:!preview&&(sound.loop||sound.mode==='hold'),paused:false,preview};
      i.gain=this.context.createGain();i.gain.connect(preview?this.previewBus:this.bus);i.envelope=this.context.createGain();i.fadeOutNode=this.context.createGain();i.envelope.connect(i.fadeOutNode);i.fadeOutNode.connect(i.gain);this.instances.push(i);this.resume(i);this.recompute();return buffer.duration;
    }catch(e){this.pending.delete(sound.id);this.onError(e.message);}
  }
  resume(i){const source=this.context.createBufferSource();source.buffer=i.buffer;source.playbackRate.value=i.speed;source.loop=i.loop;source.loopStart=i.start;source.loopEnd=i.end;source.connect(i.envelope);i.source=source;i.startedAt=this.context.currentTime;i.paused=false;const now=this.context.currentTime,remaining=(i.end-i.offset)/i.speed,elapsed=(i.offset-i.start)/i.speed,fadeIn=Math.min(Number(i.sound.fadeIn)||0,(i.end-i.start)/i.speed),fadeOut=Math.min(Number(i.sound.fadeOut)||0,(i.end-i.start)/i.speed),gain=i.envelope.gain;gain.cancelScheduledValues(now);gain.setValueAtTime(fadeIn>elapsed?elapsed/fadeIn:1,now);if(fadeIn>elapsed)gain.linearRampToValueAtTime(1,now+fadeIn-elapsed);const out=i.fadeOutNode.gain;out.cancelScheduledValues(now);out.setValueAtTime(fadeOut>0&&!i.loop?Math.min(1,remaining/fadeOut):1,now);if(fadeOut>0&&!i.loop){if(remaining>fadeOut)out.setValueAtTime(1,now+remaining-fadeOut);out.linearRampToValueAtTime(0,now+remaining);}source.onended=()=>{if(i.source===source&&!i.paused)this.remove(i);};if(i.loop)source.start(0,i.offset);else source.start(0,i.offset,Math.max(.001,i.end-i.offset));this.recompute();}
  pause(i){i.offset=this.position(i);i.paused=true;const source=i.source;i.source=null;try{source.stop();source.disconnect();}catch{}this.recompute();}
  remove(i){i.source=null;try{i.envelope.disconnect();i.fadeOutNode.disconnect();i.gain.disconnect();}catch{}this.instances=this.instances.filter(x=>x!==i);this.recompute();}
  stop(id){this.pending.delete(id);for(const i of [...this.instances])if(i.sound.id===id){const source=i.source;i.source=null;try{source?.stop();source?.disconnect();}catch{}this.remove(i);}}
  stopInstance(instanceId){const i=this.instances.find(item=>item.instanceId===instanceId);if(!i)return;const source=i.source;i.source=null;try{source?.stop();source?.disconnect();}catch{}this.remove(i);}
  stopAll(){this.epoch++;this.pending.clear();for(const i of [...this.instances])this.stop(i.sound.id);}
  stopPreviews(){for(const i of [...this.instances])if(i.preview){const source=i.source;i.source=null;try{source?.stop();source?.disconnect();}catch{}this.remove(i);}}
  recompute(){if(!this.context)return;const active=this.instances.filter(i=>!i.paused&&!i.preview),ducks=active.filter(i=>i.sound.muteOthers);for(const i of this.instances){const muted=ducks.some(d=>d!==i);i.gain.gain.setTargetAtTime(muted?0:Math.min(2,Math.max(0,(i.sound.volume??100)/100)),this.context.currentTime,.01);}this.micGain.gain.setTargetAtTime(!this.settings.micEnabled||active.some(i=>i.sound.muteVoice)?0:1,this.context.currentTime,.01);}
  levels(){const result={};for(const [key,{analyser,values}]of Object.entries(this.meters||{})){analyser.getFloatTimeDomainData(values);const rms=Math.sqrt(values.reduce((sum,v)=>sum+v*v,0)/values.length);result[key]={db:Math.max(-60,20*Math.log10(rms||1e-6)),rms};}return result;}
  microphoneLevel(){
    const track=this.micStream?.getAudioTracks()[0],enabled=!!this.settings.micEnabled,available=track?.readyState==='live',muted=!!this.settings.micMuted||!!track?.muted||track?.enabled===false,meter=this.meters?.input;
    if(!enabled||!available||muted||!meter)return {enabled,available,muted,db:-60,peak:0};
    meter.analyser.getFloatTimeDomainData(meter.values);let sum=0,peak=0;for(const value of meter.values){sum+=value*value;peak=Math.max(peak,Math.abs(value));}return {enabled,available,muted,db:Math.max(-60,20*Math.log10(Math.sqrt(sum/meter.values.length)||1e-6)),peak};
  }
  updateSound(sound){
    const {id}=sound,revision=sound.audioFile||sound.audioUrl||id;
    const cached=this.buffers.get(id),loading=this.loads.get(id);
    if((cached&&cached.revision!==revision)||(loading&&loading.revision!==revision))this.invalidateBuffer(id);
    for(const i of this.instances)if(i.sound.id===id)i.sound={...i.sound,...sound};
    this.recompute();
  }
  snapshot(){return this.instances.map(i=>({instanceId:i.instanceId,id:i.sound.id,name:i.sound.name,speed:i.speed,image:i.sound.image,imageFile:i.sound.imageFile,paused:i.paused,preview:i.preview,position:this.position(i),start:i.start,end:i.end,loop:i.loop}));}
}
