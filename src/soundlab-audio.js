import {routePreviewOutput} from './preview-routing.js';
import {Context,Offline,Player,PitchShift,Distortion,Compressor,Volume} from 'tone';

const distortion=[{distortion:0,wet:0},{distortion:.23,wet:.22},{distortion:1,wet:1}];
const compressor=[{threshold:0,ratio:1,attack:0,release:0,knee:0},{threshold:-16,ratio:20,attack:.003,release:.23,knee:30}];
const attenuation=[0,-.5,-2.5];
export const fadeSeconds=(value,duration)=>typeof value==='number'?Math.max(0,Math.min(value,duration)):value?Math.min(1,duration*.2):0;
export function bufferToWav(buffer){
 const channels=buffer.numberOfChannels,length=buffer.length,view=new DataView(new ArrayBuffer(44+length*channels*2));
 const text=(at,value)=>{for(let i=0;i<value.length;i++)view.setUint8(at+i,value.charCodeAt(i));};
 text(0,'RIFF');view.setUint32(4,36+length*channels*2,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels,true);view.setUint32(24,buffer.sampleRate,true);view.setUint32(28,buffer.sampleRate*channels*2,true);view.setUint16(32,channels*2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,length*channels*2,true);
 const samples=Array.from({length:channels},(_,i)=>buffer.getChannelData(i));let at=44;for(let i=0;i<length;i++)for(let c=0;c<channels;c++){const s=Math.max(-1,Math.min(1,samples[c][i]));view.setInt16(at,s<0?s*32768:s*32767,true);at+=2;}
 return new Blob([view.buffer],{type:'audio/wav'});
}
export async function renderEdit(buffer,edit){
 const start=Math.max(0,Math.min(edit.start,buffer.duration-.01)),end=Math.min(buffer.duration,Math.max(edit.end,start+.01)),duration=(end-start)/edit.speed;
 if(duration>480)throw Error('Âm thanh sau chỉnh sửa tối đa 8 phút.');
 const effects=[];
 try{const rendered=await Offline(context=>{
  const player=new Player({context,url:buffer,playbackRate:edit.speed,fadeIn:fadeSeconds(edit.fadeIn,duration),fadeOut:fadeSeconds(edit.fadeOut,duration)});effects.push(player);
  const chain=[];if(edit.pitch){const shift=new PitchShift({context,pitch:edit.pitch,windowSize:.055});chain.push(shift);effects.push(shift);}
  if(edit.loudness){const shape=new Distortion({context,...distortion[edit.loudness],oversample:'none'}),compress=new Compressor({context,...compressor[1]}),level=new Volume({context,volume:attenuation[edit.loudness]});chain.push(shape,compress,level);effects.push(shape,compress,level);}
  player.chain(...chain,context.destination);player.start(0,start,end-start);
 },duration,Math.min(2,buffer.numberOfChannels),buffer.sampleRate);return bufferToWav(rendered.get());}finally{effects.forEach(e=>e.dispose());}
}

// A separate monitor-only context keeps editing out of the broadcast stream.
export class SoundlabPlayer{
 constructor(buffer,edit,onChange){
  this.buffer=buffer;this.edit={...edit};this.offset=edit.start;this.playing=false;this.loop=false;this.generation=0;this.onChange=onChange;
  this.context=new Context({latencyHint:'interactive',lookAhead:.01});
  this.pitch=new PitchShift({context:this.context,pitch:0,windowSize:.055,wet:0});
  this.shape=new Distortion({context:this.context,distortion:0,wet:0,oversample:'none'});
  this.compress=new Compressor({context:this.context,...compressor[0]});
  this.level=new Volume({context:this.context,volume:0});this.volume=new Volume({context:this.context,volume:0});
  this.destination=this.context.rawContext.createMediaStreamDestination();
  this.pitch.chain(this.shape,this.compress,this.level,this.volume,this.destination);
  this.output=new Audio();this.output.muted=true;this.output.srcObject=this.destination.stream;this.update(edit);this.onDevicesChanged=()=>{this.output.muted=true;if(this.monitorSettings)this.monitor(this.monitorSettings).catch(error=>this.onError?.(error));};navigator.mediaDevices.addEventListener('devicechange',this.onDevicesChanged);
 }
 async route(device='default'){if(this.output.sinkId!==device)await this.output.setSinkId(device);}
 async monitor(settings){this.monitorSettings=settings;this.monitorReady=routePreviewOutput(this.output,settings.monitorDevice||'default').then(()=>{this.output.muted=!!settings.monitorMuted;this.output.volume=Math.max(0,Math.min(1,(settings.monitorVolume??70)/100));});await this.monitorReady;}
 position(){if(!this.playing)return this.offset;const p=this.offset+(this.context.rawContext.currentTime-this.at)*this.edit.speed;return this.loop?this.edit.start+(p-this.edit.start)%(this.edit.end-this.edit.start):Math.min(this.edit.end,p);}
 emit(){this.onChange?.({playing:this.playing,position:this.position(),loop:this.loop});}
 async play(){
  if(this.disposed)return;const request=++this.generation;await this.monitorReady;await this.context.resume();await this.output.play();if(this.disposed||request!==this.generation)return;
  if(this.offset>=this.edit.end-.005||this.offset<this.edit.start)this.offset=this.edit.start;
  this.player?.dispose();const edit=this.edit,duration=(edit.end-edit.start)/edit.speed;
  const player=new Player({context:this.context,url:this.buffer,playbackRate:edit.speed,loop:this.loop,loopStart:edit.start,loopEnd:edit.end,fadeIn:fadeSeconds(edit.fadeIn,duration),fadeOut:fadeSeconds(edit.fadeOut,duration),onstop:()=>{if(request===this.generation&&this.playing){this.playing=false;this.offset=this.edit.start;this.emit();}}});
  player.connect(this.pitch);this.player=player;this.at=this.context.rawContext.currentTime;this.playing=true;
  if(this.loop)player.start(this.context.now(),this.offset);else player.start(this.context.now(),this.offset,edit.end-this.offset);this.emit();
 }
 pause(){this.offset=this.position();this.playing=false;this.generation++;this.player?.stop();this.player?.dispose();this.player=null;this.emit();}
 seek(position){const resume=this.playing;this.pause();this.offset=Math.max(this.edit.start,Math.min(this.edit.end,position));this.emit();if(resume)return this.play();}
 reset(){return this.seek(this.edit.start);}
 setLoop(loop){const resume=this.playing;if(resume)this.pause();this.loop=loop;this.emit();if(resume)this.play().catch(this.onError);}
 update(edit){
  const restart=this.playing&&['speed','start','end','fadeIn','fadeOut'].some(k=>edit[k]!==this.edit[k]);if(restart)this.pause();this.edit={...edit};this.offset=Math.max(edit.start,Math.min(edit.end,this.offset));
  this.pitch.pitch=edit.pitch;this.pitch.wet.value=edit.pitch?1:0;this.shape.set(distortion[edit.loudness]);this.compress.set(compressor[edit.loudness?1:0]);this.level.volume.value=attenuation[edit.loudness];this.volume.volume.value=edit.volume>0?20*Math.log10(edit.volume/100):-Infinity;
  if(restart)this.play().catch(this.onError);else this.emit();
 }
 dispose(){navigator.mediaDevices.removeEventListener('devicechange',this.onDevicesChanged);this.disposed=true;this.pause();this.output.pause();this.output.srcObject=null;[this.pitch,this.shape,this.compress,this.level,this.volume].forEach(n=>n.dispose());this.destination.disconnect();this.context.dispose();}
}
