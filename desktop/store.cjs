const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const {enforceMode}=require('./playback-contract.cjs');
const {clearRetiredArtwork}=require('./artwork.cjs');
const modes = ['overlap','pause','stop','restart','hold'];
function soundSettings(s) {
  return enforceMode({ volume:100, mode:'restart', loop:false, stopOthers:false, muteOthers:false, muteVoice:false, shortcut:'', trimStart:0, trimEnd:0, speed:1, fadeIn:0,fadeOut:0, ...s, volume:Math.min(100,Math.max(0,Number(s?.volume ?? 100))), speed:Math.min(3.5,Math.max(.5,Number(s?.speed)||1)), mode:modes.includes(s?.mode)?s.mode:'restart',fadeIn:Math.min(10,Math.max(0,Number(s?.fadeIn)||0)),fadeOut:Math.min(10,Math.max(0,Number(s?.fadeOut)||0)) });
}
function initial() {
  return {version:1, boards:[{id:'my-first-board',name:'My first soundboard',color:'#00fff6',soundIds:require('./starter.json').map(s=>s.id)}], sounds:require('./starter.json').map(s=>soundSettings({...s})), settings:{manageWindowsMic:true,language:'en',master:80,monitorVolume:70,monitor:true,outputDevice:'default',monitorDevice:'default',micDevice:'default',micEnabled:false,micVolume:100,micMonitor:0,micBroadcast:100,soundMonitor:100,soundBroadcast:100,micMuted:false,monitorMuted:false,broadcastMuted:false,micMonitorMuted:false,micBroadcastMuted:false,soundMonitorMuted:false,soundBroadcastMuted:false,noiseSuppression:false,speakerEchoCancellation:false,noiseGate:false,noiseGateThreshold:-50,audioMode:'basic',startMinimized:false,launchAtStartup:false,stopShortcut:'Control+Shift+Space',autoSync:true,syncMinutes:15,closeToTray:false}, community:{items:[],lastSync:null,error:null}};
}
class Store {
  constructor(dir) { this.dir=dir; this.tail=Promise.resolve(); }
  async init() { await fs.mkdir(path.join(this.dir,'audio'),{recursive:true}); await fs.mkdir(path.join(this.dir,'images'),{recursive:true}); try {this.data=JSON.parse(await fs.readFile(path.join(this.dir,'library.json'),'utf8')); if(this.data.version!==1||!Array.isArray(this.data.boards)||!Array.isArray(this.data.sounds)) throw Error('Invalid library'); if(!Object.hasOwn(this.data.settings||{},"manageWindowsMic")){this.data.settings={...this.data.settings,manageWindowsMic:true,closeToTray:false};}this.data.settings={...initial().settings,...this.data.settings}; this.data.settings.language=this.data.settings.language==='vi'?'vi':'en'; this.data.community={...initial().community,...this.data.community};} catch(e) { if(e.code!=='ENOENT') { try {await fs.copyFile(path.join(this.dir,'library.json'),path.join(this.dir,`library-recovery-${Date.now()}.json`));} catch {} } this.data=initial(); await this.save(); } if(await clearRetiredArtwork(this.data,this.dir))await this.save(); }
  save() { const content=JSON.stringify(this.data,null,2); const job=this.tail.catch(()=>{}).then(async()=>{const temp=path.join(this.dir,`library-${randomUUID()}.tmp`);await fs.writeFile(temp,content);await fs.rename(temp,path.join(this.dir,'library.json'));});this.tail=job;return job; }
  async mutate(fn) { const result=fn(this.data);await this.save();return result; }
}
module.exports = {Store,initial,soundSettings,modes};
