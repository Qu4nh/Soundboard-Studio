function createWavData(length,channels,rate){
  const frameBytes=channels*2,dataBytes=length*frameBytes;
  const view=new DataView(new ArrayBuffer(44+dataBytes));
  const text=(offset,value)=>{
    for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i));
  };
  text(0,'RIFF');view.setUint32(4,36+dataBytes,true);
  text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);
  view.setUint16(20,1,true);view.setUint16(22,channels,true);
  view.setUint32(24,rate,true);view.setUint32(28,rate*frameBytes,true);
  view.setUint16(32,frameBytes,true);view.setUint16(34,16,true);
  text(36,'data');view.setUint32(40,dataBytes,true);
  return view;
}

function pcm16(sample){
  const level=Math.max(-1,Math.min(1,sample));
  return level<0?level*32768:level*32767;
}

export function encodeWav(samples,rate){
  const view=createWavData(samples.length,1,rate);
  for(let i=0;i<samples.length;i++)view.setInt16(44+i*2,pcm16(samples[i]),true);
  return new Blob([view.buffer],{type:'audio/wav'});
}
export async function recordingBuffer(blob){
 const bytes=await blob.arrayBuffer(),view=new DataView(bytes);if(view.getUint32(0)!==0x52494646||view.getUint16(20,true)!==1||view.getUint16(34,true)!==16)throw Error('Unsupported recording format');
 const channels=view.getUint16(22,true),rate=view.getUint32(24,true),length=Math.floor(view.getUint32(40,true)/2/channels),samples=Array.from({length:channels},()=>new Float32Array(length));for(let i=0;i<length;i++)for(let c=0;c<channels;c++)samples[c][i]=view.getInt16(44+(i*channels+c)*2,true)/32768;
 return {numberOfChannels:channels,sampleRate:rate,length,duration:length/rate,getChannelData:i=>samples[i]};
}
export async function trimRecording(blob,start,end){
 const bytes=await blob.arrayBuffer(),source=new DataView(bytes),rate=source.getUint32(24,true),block=source.getUint16(32,true),length=source.getUint32(40,true)/block;
 const from=Math.max(0,Math.min(length-1,Math.floor(start*rate))),to=Math.max(from+1,Math.min(length,Math.floor(end*rate))),data=new Uint8Array(44+(to-from)*block);data.set(new Uint8Array(bytes,0,44));data.set(new Uint8Array(bytes,44+from*block,(to-from)*block),44);const view=new DataView(data.buffer);view.setUint32(4,data.length-8,true);view.setUint32(40,data.length-44,true);return new Blob([data],{type:'audio/wav'});
}
export class Recorder {
  constructor(){this.ring={};this.frames={};this.replay=false;this.streams=[];this.nodes=[];this.recording={state:'inactive'};}
  async open(device='default',source='mic'){
    if(this.streams.length&&this.device===device&&this.captureSource===source)return;
    this.close();this.device=device;this.captureSource=source;this.context=new AudioContext();this.silent=this.context.createGain();this.silent.gain.value=0;this.silent.connect(this.context.destination);
    try{
      const inputs={};
      if(source!=='system'){const mic=await navigator.mediaDevices.getUserMedia({audio:{deviceId:device==='default'?undefined:{exact:device},echoCancellation:false,noiseSuppression:false,autoGainControl:false}});this.streams.push(mic);inputs.mic=this.context.createMediaStreamSource(mic);}
      if(source!=='mic'){const system=await navigator.mediaDevices.getDisplayMedia({video:true,audio:true});if(!system.getAudioTracks().length){system.getTracks().forEach(t=>t.stop());throw Error('Không có kênh system audio. Hãy chọn nguồn có chia sẻ âm thanh.');}system.getVideoTracks().forEach(t=>t.enabled=false);this.streams.push(system);inputs.system=this.context.createMediaStreamSource(new MediaStream(system.getAudioTracks()));}
      if(source==='both'){const mix=this.context.createGain();inputs.mic.connect(mix);inputs.system.connect(mix);inputs.both=mix;this.nodes.push(mix);}
      for(const [name,input]of Object.entries(inputs)){
        this.ring[name]=[];this.frames[name]=[];const processor=this.context.createScriptProcessor(4096,2,2);
        processor.onaudioprocess=e=>{if(!this.replay&&this.recording.state!=='recording')return;const left=new Float32Array(e.inputBuffer.getChannelData(0)),right=new Float32Array(e.inputBuffer.getChannelData(Math.min(1,e.inputBuffer.numberOfChannels-1))),frame=[left,right];if(name===this.captureSource)this.latestFrame=left;if(this.replay){this.ring[name].push(frame);const max=Math.ceil(this.context.sampleRate*45/4096);if(this.ring[name].length>max)this.ring[name].shift();}if(this.recording.state==='recording')this.frames[name].push(frame);};
        input.connect(processor);processor.connect(this.silent);this.nodes.push(input,processor);
      }
      await this.context.resume();
    }catch(e){this.close();throw e;}
  }
  async start(device,source='mic'){await this.open(device,source);for(const name of Object.keys(this.frames))this.frames[name]=[];this.recording={state:'recording'};this.startedAt=Date.now();}
  blobs(frameMap,seconds){
    const channels={};
    for(const [name,frames]of Object.entries(frameMap)){
      const total=frames.reduce((n,frame)=>n+frame[0].length,0);
      if(!total)continue;
      const rate=this.context.sampleRate;
      const count=seconds?Math.min(total,Math.floor(seconds*rate)):total;
      if(count<=0)continue;
      const view=createWavData(count,2,rate);
      let skip=total-count,offset=44;
      for(const [left,right]of frames){
        if(left.length<=skip){skip-=left.length;continue;}
        for(let i=skip;i<left.length;i++){
          view.setInt16(offset,pcm16(left[i]),true);
          view.setInt16(offset+2,pcm16(right[i]),true);
          offset+=4;
        }
        skip=0;
      }
      channels[name]=new Blob([view.buffer],{type:'audio/wav'});
    }
    const preferred=channels[this.captureSource]||channels.both||channels.mic||channels.system;if(!preferred)throw Error('Bản ghi chưa có dữ liệu.');preferred.channels=channels;return preferred;
  }
  wav(buffer){
    const {length,numberOfChannels,sampleRate}=buffer;
    const view=createWavData(length,numberOfChannels,sampleRate);
    let offset=44;
    for(let i=0;i<length;i++)for(let channel=0;channel<numberOfChannels;channel++){
      view.setInt16(offset,pcm16(buffer.getChannelData(channel)[i]),true);
      offset+=2;
    }
    return new Blob([view.buffer],{type:'audio/wav'});
  }
  async stop(){if(this.recording.state!=='recording')return null;this.recording.state='inactive';return this.blobs(this.frames);}
  async setReplay(enabled,device,source='mic'){if(enabled)await this.open(device,source);this.replay=enabled;if(!enabled){for(const name of Object.keys(this.ring))this.ring[name]=[];if(this.recording.state!=='recording')this.close();}}
  captureReplay(seconds=30){return this.blobs(this.ring,seconds);}
  close(){this.latestFrame=null;this.streams.forEach(s=>s.getTracks().forEach(t=>t.stop()));this.streams=[];this.nodes.forEach(n=>{try{n.disconnect();}catch{}});this.nodes=[];this.silent?.disconnect();if(this.context&&this.context.state!=='closed')this.context.close();this.ring={};this.frames={};this.recording={state:'inactive'};}
}
