const fs=require('node:fs/promises'),path=require('node:path'),{execFile,spawn}=require('node:child_process'),{promisify}=require('node:util');
const virtual=d=>/cable|virtual|voicemod|voicemeeter|camo|steam streaming/i.test(d.Name||'');
function describe(snapshot){
 const endpoints=snapshot.Endpoints||[],inputs=endpoints.filter(d=>d.Flow==='input'&&d.Role==='available'),outputs=endpoints.filter(d=>d.Flow==='output'&&d.Role==='available');
 return {inputs,outputs,physicalInputs:inputs.filter(d=>!virtual(d)),virtualInput:inputs.find(d=>/^CABLE Output.*VB-Audio/i.test(d.Name)),virtualOutput:outputs.find(d=>/^CABLE Input.*VB-Audio/i.test(d.Name)),defaults:endpoints.filter(d=>d.Flow==='input'&&d.Role!=='available')};
}
class AudioSession{
 constructor(dir,{disabled=false,run,watch,helperDir=__dirname}={}){this.helperDir=helperDir;this.journal=path.join(dir,'windows-microphone-session.json');this.preInstall=path.join(dir,'microphone-before-driver-install.json');this.disabled=disabled;this.active=false;this.run=run||this.command.bind(this);this.watch=watch||this.watchParent.bind(this);this.queue=Promise.resolve();}
 args(action,extra=[]){return ['-NoProfile','-NonInteractive','-File',path.join(this.helperDir,'windows-audio.ps1'),'-Action',action,...extra];}
 executable(){return path.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe');}
 async command(action,extra=[]){const {stdout}=await promisify(execFile)(this.executable(),this.args(action,extra),{windowsHide:true,timeout:20000,maxBuffer:1024*1024});return JSON.parse(stdout.replace(/^\uFEFF/,''));}
 async status(){if(this.disabled)return {disabled:true,active:false,physicalInputs:[],inputs:[],outputs:[]};const status=describe(await this.run('snapshot'));let restoreTo=status.defaults.find(d=>d.Role==='console')?.Name;try{const record=JSON.parse(await fs.readFile(this.journal,'utf8'));if(record.pending)restoreTo=record.previous.find(d=>d.Role==='console')?.Name;}catch{}return {...status,active:this.active,restoreTo};}
 async pending(){try{return JSON.parse(await fs.readFile(this.journal,'utf8')).pending;}catch(error){if(error.code==='ENOENT')return false;throw error;}}
 async rememberBeforeInstall(){const status=await this.status();if(status.defaults?.length===3)await fs.writeFile(this.preInstall,JSON.stringify({previous:status.defaults,at:new Date().toISOString()},null,2));}
 async recover(){if(this.disabled||!await this.pending())return;const result=await this.run('restore',['-Journal',this.journal]);if(!result.restored)throw Error('Previous microphone could not be restored. Reconnect it and retry.');}
 exclusive(fn){const task=this.queue.catch(()=>{}).then(fn);this.queue=task;return task;}
 start(){return this.exclusive(async()=>{
  if(this.disabled)return this.status();if(this.active)return this.status();
  await this.recover();const status=await this.status();if(!status.virtualInput||!status.virtualOutput)throw Error('Install VB-CABLE to use the virtual microphone.');
  if(status.defaults.length!==3)throw Error('Cannot save all Windows microphone defaults.');
  let previous=status.defaults;
  try{const installed=JSON.parse(await fs.readFile(this.preInstall,'utf8'));previous=previous.map(d=>{const prior=installed.previous.find(p=>p.Role===d.Role);return d.Id===status.virtualInput.Id&&prior&&status.inputs.some(input=>input.Id===prior.Id)?prior:d;});}catch{}
  const session={pending:true,targetId:status.virtualInput.Id,previous,startedAt:new Date().toISOString(),parentId:process.pid};await fs.writeFile(this.journal,JSON.stringify(session,null,2));await fs.unlink(this.preInstall).catch(()=>{});
  try{await this.watch();await this.run('activate',['-DeviceId',session.targetId]);this.active=true;return await this.status();}catch(error){this.active=false;await this.run('restore',['-Journal',this.journal]).catch(()=>{});throw error;}
 });}
 stop(){return this.exclusive(async()=>{if(this.disabled||!await this.pending()){this.active=false;return {restored:true};}const result=await this.run('restore',['-Journal',this.journal]);if(!result.restored)throw Error('Previous microphone could not be restored. Reconnect it and retry.');this.active=false;return result;});}
 async watchParent(){
  if(this.watchPid){try{process.kill(this.watchPid,0);return;}catch{this.watchPid=null;}}
  const readyFile=this.journal+'.watcher-'+Date.now()+'.json';
  const launched=await this.run('launch-watch',['-Journal',this.journal,'-ParentId',String(process.pid),'-ReadyFile',readyFile]);
  for(let n=0;n<100;n++){
   try{const state=JSON.parse(await fs.readFile(readyFile,'utf8'));if(state.ready&&state.pid===launched.pid){this.watchPid=state.pid;return;}}catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw Error('Microphone recovery watchdog did not start.');
 }
}
module.exports={AudioSession,describe};
