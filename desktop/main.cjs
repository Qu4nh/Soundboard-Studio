const {clearRetiredArtwork}=require('./artwork.cjs');
const {app,BrowserWindow,ipcMain,dialog,protocol,net,globalShortcut,Tray,Menu,shell,desktopCapturer} = require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url');
const {randomUUID}=require('node:crypto');
if(process.env.SOUNDBOARD_DATA_DIR){const profile=path.join(process.env.SOUNDBOARD_DATA_DIR,'electron-profile');require('node:fs').mkdirSync(profile,{recursive:true});app.setPath('userData',profile);}
const {Store,soundSettings}=require('./store.cjs');
const {applyMode}=require('./playback-contract.cjs');
const {configureStartup}=require('./startup.cjs');
const {AudioSession}=require('./audio-session.cjs');

const {prepareDriver,runDriver}=require('./driver-setup.cjs');
const {keys:localDeviceKeys,localAudioDirectory,loadLocalDevices,saveLocalDevices}=require('./local-audio.cjs');
const community=require('./community.cjs');
// This 2D interface uses less resident memory with software rendering on Windows.
if(process.platform==='win32'&&!process.argv.includes('--soundboard-hardware-acceleration'))app.disableHardwareAcceleration();
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
protocol.registerSchemesAsPrivileged([{scheme:'soundasset',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true,bypassCSP:false}}]);
let win,store,tray,quitting=false,syncTimer,syncing=false,hook,hookKeys=new Map(),held=new Map(),keyStates=new Map();
let audioSession,nativeSessionDir,helperDir,restoringQuit=false,quitRestored=false,driverJob;
const downloads=new Map();
const audioExtensions=['.mp3','.wav','.ogg','.flac','.m4a','.aac','.webm','.opus'];
const send=(event,value)=>{if(win&&!win.isDestroyed())win.webContents.send(event,value);};
const isWindowVisible=()=>Boolean(win&&!win.isDestroyed()&&win.isVisible()&&!win.isMinimized());
const asset=rel=>'soundasset://local/'+rel.split(path.sep).join('/');
function publicData(){return structuredClone(store.data);}
async function download(url,kind='audio') {
  const safe=community.safeURL(url).toString();
  const key=require('node:crypto').createHash('sha256').update(safe).digest('hex');
  const ext=kind==='audio'?(audioExtensions.includes(path.extname(new URL(safe).pathname))?path.extname(new URL(safe).pathname):'.mp3'):'.img';
  const rel=`${kind==='audio'?'audio':'images'}/${key}${ext}`,file=path.join(store.dir,rel);
  try{await fs.access(file);return rel;}catch{}
  if(downloads.has(rel))return downloads.get(rel);
  const job=(async()=>{
    const response=await community.request(safe);
    const max=kind==='audio'?50*1024*1024:5*1024*1024;
    if(Number(response.headers.get('content-length'))>max)throw Error('Tệp quá lớn (tối đa 50 MB âm thanh / 5 MB hình).');
    const chunks=[];let size=0;
    for await(const chunk of response.body){size+=chunk.length;if(size>max)throw Error('Tệp tải về quá lớn.');chunks.push(chunk);}
    const temp=file+'.tmp'; await fs.writeFile(temp,Buffer.concat(chunks));await fs.rename(temp,file);return rel;
  })().finally(()=>downloads.delete(rel));
  downloads.set(rel,job);return job;
}
async function cacheSound(s) {
  const audioFile=await download(s.audioUrl);
  let imageFile='';if(s.image)try{imageFile=await download(s.image,'images');}catch{}
  return {...s,audioFile,imageFile};
}
async function syncCommunity() {
  if(syncing)return {busy:true};syncing=true;send('sync-status',{busy:true});
  try {
    const trending=await community.query({sort:'trending',size:40});
    // Newest sort is verified against the public API, and can fail independently.
    let newest={items:[]};try{newest=await community.query({sort:'created',size:40});}catch{}
    const items=[...trending.items,...newest.items];
    const known=new Map(store.data.community.items.map(s=>[s.id,s]));for(const s of items)known.set(s.id,s);
    store.data.community.items=[...known.values()].slice(-2000);
    const savedSounds=store.data.sounds.filter(s=>s.source==='community');
    for(let offset=0;offset<savedSounds.length;offset+=4){await Promise.allSettled(savedSounds.slice(offset,offset+4).filter(s=>!items.some(x=>x.id===s.id)).map(async s=>{const latest=await community.detail(s.id);if(latest)items.push(latest);}));}
    for(const saved of savedSounds){
      const latest=items.find(s=>s.id===saved.id);if(!latest)continue;
      if(saved.audioUrl!==latest.audioUrl||saved.remoteHash!==latest.remoteHash){try{const cached=await cacheSound(latest);Object.assign(saved,{audioFile:cached.audioFile,imageFile:cached.imageFile,audioUrl:cached.audioUrl,remoteHash:cached.remoteHash,duration:cached.duration,image:cached.image});}catch{continue;}}
      else {if(!saved.customName)saved.name=latest.name;saved.author=latest.author;saved.tags=latest.tags;saved.plays=latest.plays;}
    }
    store.data.community.lastSync=new Date().toISOString();store.data.community.error=null;await store.save();send('library-changed',publicData());
    return {lastSync:store.data.community.lastSync,count:items.length};
  }catch(e){store.data.community.error=e.message;await store.save();return {error:e.message};}
  finally{syncing=false;send('sync-status',{busy:false,error:store.data.community.error,lastSync:store.data.community.lastSync});}
}
function configureSync(){clearInterval(syncTimer);if(store.data.settings.autoSync)syncTimer=setInterval(syncCommunity,Math.max(1,Number(store.data.settings.syncMinutes)||15)*60000);syncTimer?.unref();}
function parseShortcut(value,keyMap){
  const parts=String(value).split('+');const name=parts.pop();
  const alias={Space:'Space',Enter:'Enter',Esc:'Escape',Up:'ArrowUp',Down:'ArrowDown',Left:'ArrowLeft',Right:'ArrowRight'};
  return {keycode:keyMap[alias[name]||name],ctrl:parts.includes('Control')||parts.includes('CommandOrControl'),alt:parts.includes('Alt'),shift:parts.includes('Shift'),meta:parts.includes('Super')};
}
function configureHotkeys(){
  globalShortcut.unregisterAll();hookKeys.clear();const errors=[];
  const bindings=[...store.data.sounds.filter(s=>s.shortcut).map(s=>({id:s.id,shortcut:s.shortcut})),{id:'__stop__',shortcut:store.data.settings.stopShortcut}];
  const used=new Set();
  for(const b of bindings){if(!b.shortcut)continue;if(used.has(b.shortcut)){errors.push(`${b.shortcut}: trùng phím tắt`);continue;}used.add(b.shortcut);
    const parsed=hook?parseShortcut(b.shortcut,hook.UiohookKey):null;
    if(parsed?.keycode)hookKeys.set(b.id,{...parsed,...b});
    // RegisterHotKey supplies reliable modifier matching; the low-level hook
    // supplies key release for hold mode. Both paths share held to avoid duplicates.
    try{if(!globalShortcut.register(b.shortcut,()=>{if(parsed?.keycode)pressHotkey({...b,...parsed});else send('trigger',{id:b.id,phase:'press',toggleHold:true});}))errors.push(`${b.shortcut}: đang được ứng dụng khác dùng`);}catch{errors.push(`${b.shortcut}: không hợp lệ`);}
  }
  send('hotkey-status',{errors,native:!!hook});return {errors,native:!!hook};
}
function pressHotkey(binding){
  const state=keyStates.get(binding.keycode);if(held.has(binding.id)||state?.delivered.has(binding.id))return;
  state?.delivered.add(binding.id);held.set(binding.id,binding.keycode);send('trigger',{id:binding.id,phase:'press'});
  // WM_HOTKEY can reach JS after the low-level key-up for a quick tap.
  if(!state?.down){held.delete(binding.id);send('trigger',{id:binding.id,phase:'release'});}
}
function startHook(){
  try{hook=require('uiohook-napi');
    hook.uIOhook.on('keydown',e=>{let state=keyStates.get(e.keycode);if(!state?.down){state={down:true,delivered:new Set()};keyStates.set(e.keycode,state);}for(const b of hookKeys.values()){if(e.keycode===b.keycode&&!!e.ctrlKey===b.ctrl&&!!e.altKey===b.alt&&!!e.shiftKey===b.shift&&!!e.metaKey===b.meta)pressHotkey(b);}});
    hook.uIOhook.on('keyup',e=>{const state=keyStates.get(e.keycode);if(state)state.down=false;for(const [id,keycode]of held){if(e.keycode===keycode){held.delete(id);send('trigger',{id,phase:'release'});}}});
    hook.uIOhook.start();
  }catch(e){hook=null;console.warn('Native hold hotkeys unavailable; using Electron shortcuts:',e.message);}
}
function addToBoard(id,boardId){const board=store.data.boards.find(b=>b.id===boardId);if(!board)throw Error('Soundboard không tồn tại.');if(!board.soundIds.includes(id))board.soundIds.push(id);}
async function importFiles(paths,boardId){
  const added=[];
  for(const file of paths.slice(0,100)){
    const ext=path.extname(file).toLowerCase();if(!audioExtensions.includes(ext))continue;
    const stat=await fs.stat(file);if(!stat.isFile()||stat.size>50*1024*1024)throw Error('Chỉ nhận âm thanh tối đa 50 MB/tệp.');
    const id=randomUUID(),rel=`audio/${id}${ext}`;await fs.copyFile(file,path.join(store.dir,rel));
    const sound=soundSettings({id,name:path.basename(file,ext),source:'local',author:'Bạn',audioFile:rel,duration:0,color:'#00ded1'});store.data.sounds.push(sound);addToBoard(id,boardId);added.push(sound);
  }
  await store.save();return publicData();
}
function setupIPC(){
  const handle=(name,fn)=>ipcMain.handle(name,(_e,...args)=>fn(...args));
  handle('audio-session-status',()=>audioSession.status());
  handle('audio-session-start',()=>audioSession.start());
  handle('audio-session-stop',()=>audioSession.stop());
  handle('audio-driver-install',async()=>{const status=await audioSession.status();if(status.virtualInput&&status.virtualOutput)return {alreadyInstalled:true};if(!driverJob)driverJob=(async()=>{const files=await prepareDriver(nativeSessionDir);await runDriver(files,{helperDir});await audioSession.rememberBeforeInstall();return runDriver(files,{launch:true,helperDir});})().finally(()=>{driverJob=null;});return driverJob;});
  handle('audio-setup-guide',()=>shell.openExternal('https://vb-audio.com/Cable/'));
  handle('get-data',()=>({...publicData(),runtime:{nativeHotkeys:!!hook,dataDir:store.dir,openSettings:process.argv.includes('--settings'),openSoundlab:process.argv.includes('--soundlab')?(store.data.sounds.find(s=>s.name==='Explosion')||store.data.sounds[0])?.id:null}}));
  handle('boards-reorder',async ids=>{if(!Array.isArray(ids)||ids.length!==store.data.boards.length||new Set(ids).size!==ids.length||ids.some(id=>!store.data.boards.some(b=>b.id===id)))throw Error('Invalid board order');store.data.boards=ids.map(id=>store.data.boards.find(b=>b.id===id));await store.save();return publicData();});
  handle('board-create',async name=>{store.data.boards.push({id:randomUUID(),name:String(name||'New soundboard').slice(0,100),color:'#00ded1',soundIds:[]});await store.save();return publicData();});
  handle('board-update',async(id,patch)=>{const b=store.data.boards.find(b=>b.id===id);if(!b)throw Error('Không tìm thấy soundboard.');if(typeof patch.name==='string')b.name=patch.name.slice(0,100);if(/^#[0-9a-f]{6}$/i.test(patch.color))b.color=patch.color;if(Array.isArray(patch.soundIds))b.soundIds=[...new Set(patch.soundIds)].filter(x=>store.data.sounds.some(s=>s.id===x));await store.save();return publicData();});
  handle('board-delete',async id=>{if(store.data.boards.length<2)throw Error('Cần giữ ít nhất một soundboard.');store.data.boards=store.data.boards.filter(b=>b.id!==id);await store.save();return publicData();});
  handle('sound-update',async(id,patch)=>{const s=store.data.sounds.find(s=>s.id===id);if(!s)throw Error('Không tìm thấy âm thanh.');if(Object.hasOwn(patch,'name'))s.customName=true;if(patch.mode&&patch.mode!==s.mode)Object.assign(s,applyMode(s,patch.mode));const allowed=['fadeIn','fadeOut','name','volume','mode','loop','stopOthers','muteOthers','muteVoice','shortcut','trimStart','trimEnd','speed','favorite','color','duration'];for(const k of allowed)if(Object.hasOwn(patch,k))s[k]=patch[k];Object.assign(s,soundSettings(s));s.name=String(s.name).slice(0,200);s.shortcut=String(s.shortcut||'').slice(0,100);s.trimStart=Math.max(0,Number(s.trimStart)||0);s.trimEnd=Math.max(0,Number(s.trimEnd)||0);await store.save();configureHotkeys();return publicData();});
  handle('sound-add',async(id,boardId)=>{if(!store.data.sounds.some(s=>s.id===id)){const c=store.data.community.items.find(s=>s.id===id)||await community.detail(id);if(!c)throw Error('Âm thanh không còn công khai.');store.data.sounds.push(soundSettings(await cacheSound(c)));}addToBoard(id,boardId);await store.save();return publicData();});
  handle('sound-remove',async(id,boardId)=>{const b=store.data.boards.find(b=>b.id===boardId);if(b)b.soundIds=b.soundIds.filter(x=>x!==id);await store.save();return publicData();});
  handle('sound-delete',async id=>{store.data.sounds=store.data.sounds.filter(s=>s.id!==id);for(const b of store.data.boards)b.soundIds=b.soundIds.filter(x=>x!==id);await store.save();configureHotkeys();return publicData();});
  handle('sound-play-url',async id=>{const saved=store.data.sounds.find(s=>s.id===id);if(saved?.audioFile)return asset(saved.audioFile);const c=saved||store.data.community.items.find(s=>s.id===id)||await community.detail(id);if(!c)throw Error('Không tải được âm thanh.');const rel=await download(c.audioUrl);if(saved){saved.audioFile=rel;await store.save();}return asset(rel);});
  handle('community-query',async options=>{const result=await community.query(options);const map=new Map(store.data.community.items.map(s=>[s.id,s]));for(const s of result.items)map.set(s.id,s);store.data.community.items=[...map.values()].slice(-2000);await store.save();return result;});
  handle('community-sync',syncCommunity);
  handle('settings-update',async patch=>{if(patch.manageWindowsMic===false)await audioSession.stop();if(Object.hasOwn(patch,'launchAtStartup')){configureStartup(app,patch.launchAtStartup);}for(const k of Object.keys(store.data.settings))if(Object.hasOwn(patch,k))store.data.settings[k]=patch[k];store.data.settings.syncMinutes=Math.min(1440,Math.max(1,Number(store.data.settings.syncMinutes)||15));for(const key of ['master','monitorVolume','micVolume','micMonitor','micBroadcast','soundMonitor','soundBroadcast'])store.data.settings[key]=Math.max(0,Math.min(key==='micVolume'?200:100,Number(store.data.settings[key])||0));store.data.settings.noiseGateThreshold=Math.max(-60,Math.min(0,Number(store.data.settings.noiseGateThreshold)||0));store.data.settings.audioMode=store.data.settings.audioMode==='mixer'?'mixer':'basic';store.data.settings.language=store.data.settings.language==='vi'?'vi':'en';if(localDeviceKeys.some(key=>Object.hasOwn(patch,key)))await saveLocalDevices(nativeSessionDir,store.data.settings);await store.save();configureSync();const hotkeys=configureHotkeys();return {...publicData(),hotkeys};});
  handle('import-audio',async boardId=>{const result=await dialog.showOpenDialog(win,{properties:['openFile','multiSelections'],filters:[{name:'Audio',extensions:audioExtensions.map(x=>x.slice(1))}]});return result.canceled?null:importFiles(result.filePaths,boardId);});
  handle('drop-audio',importFiles);
  handle('record-save',async(bytes,name,boardId,format='webm')=>{const buffer=Buffer.from(bytes);if(buffer.length>50*1024*1024)throw Error('Bản ghi quá lớn.');const id=randomUUID(),rel=`audio/${id}.${format==='wav'?'wav':'webm'}`;await fs.writeFile(path.join(store.dir,rel),buffer);store.data.sounds.push(soundSettings({id,name:String(name||'Recording').slice(0,200),source:'recording',author:'Bạn',audioFile:rel,duration:0}));addToBoard(id,boardId);await store.save();return publicData();});
  handle('sound-image',async id=>{const sound=store.data.sounds.find(s=>s.id===id);if(!sound)return null;const r=await dialog.showOpenDialog(win,{filters:[{name:'Artwork',extensions:['png','jpg','jpeg','webp']}],properties:['openFile']});if(r.canceled)return null;const file=r.filePaths[0];if((await fs.stat(file)).size>5*1024*1024)throw Error('Ảnh tối đa 5 MB.');const rel=`images/${randomUUID()}${path.extname(file)}`;await fs.copyFile(file,path.join(store.dir,rel));sound.imageFile=rel;await store.save();return publicData();});
  handle('board-cover',async id=>{const b=store.data.boards.find(b=>b.id===id);if(!b)throw Error('Unknown board');const r=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'Artwork',extensions:['png','jpg','jpeg','webp']}]});if(r.canceled)return null;const bytes=await fs.readFile(r.filePaths[0]);if(bytes.length>5*1024*1024)throw Error('Ảnh tối đa 5 MB.');b.coverFile=`images/${randomUUID()}${path.extname(r.filePaths[0])}`;await fs.writeFile(path.join(store.dir,b.coverFile),bytes);await store.save();return publicData();});
  handle('soundlab-image',async()=>{const r=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'Artwork',extensions:['png','jpg','jpeg','webp']}]});if(r.canceled)return null;const bytes=await fs.readFile(r.filePaths[0]);if(bytes.length>5*1024*1024)throw Error('Ảnh tối đa 5 MB.');const rel=`images/${randomUUID()}${path.extname(r.filePaths[0])}`;await fs.writeFile(path.join(store.dir,rel),bytes);return rel;});
  handle('sound-render-save',async(id,bytes,name,boardId,copy,volume,imageFile)=>{const original=store.data.sounds.find(s=>s.id===id);if(!original)throw Error('Unknown sound');const buffer=Buffer.from(bytes);if(buffer.length>128*1024*1024||buffer.toString('ascii',0,4)!=='RIFF'||buffer.toString('ascii',8,12)!=='WAVE')throw Error('Invalid rendered WAV');if(imageFile&&(!/^images\/[a-zA-Z0-9_.-]+$/.test(imageFile)||(await fs.stat(path.join(store.dir,imageFile))).size>5*1024*1024))throw Error('Invalid artwork');const newId=copy?randomUUID():id,rel=`audio/${randomUUID()}.wav`;await fs.writeFile(path.join(store.dir,rel),buffer);const sound=soundSettings({...original,imageFile:imageFile||original.imageFile,volume:volume??original.volume,id:newId,name:String(name).slice(0,63),source:'local',audioFile:rel,originalAudioFile:original.originalAudioFile||original.audioFile,trimStart:0,trimEnd:0,speed:1,fadeIn:0,fadeOut:0,shortcut:copy?'':original.shortcut});if(copy){store.data.sounds.push(sound);addToBoard(newId,boardId);}else Object.assign(original,sound);await store.save();configureHotkeys();return publicData();});
  handle('board-export',async id=>{const board=store.data.boards.find(b=>b.id===id);if(!board)throw Error('Không tìm thấy soundboard.');const r=await dialog.showSaveDialog(win,{defaultPath:board.name.replace(/[<>:"/\\|?*]/g,'_')+'.soundboard.json',filters:[{name:'Soundboard package',extensions:['json']}]});if(r.canceled)return null;const sounds=[];let total=0;for(const soundId of board.soundIds){const s=store.data.sounds.find(s=>s.id===soundId);if(!s)continue;const audio=await fs.readFile(path.join(store.dir,s.audioFile));total+=audio.length;if(total>200*1024*1024)throw Error('Soundboard quá lớn để xuất (tối đa 200 MB).');const image=s.imageFile?await fs.readFile(path.join(store.dir,s.imageFile)):null;sounds.push({...s,audioBase64:audio.toString('base64'),imageBase64:image?.toString('base64'),extension:path.extname(s.audioFile)});}await fs.writeFile(r.filePath,JSON.stringify({format:'soundboard-studio',version:1,board,sounds,coverBase64:board.coverFile?(await fs.readFile(path.join(store.dir,board.coverFile))).toString('base64'):undefined}));return r.filePath;});
  handle('board-import',async()=>{const r=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'Soundboard package',extensions:['json']}]});if(r.canceled)return null;if((await fs.stat(r.filePaths[0])).size>300*1024*1024)throw Error('Gói tối đa 300 MB.');const data=JSON.parse(await fs.readFile(r.filePaths[0],'utf8'));if(data.format!=='soundboard-studio'||data.version!==1||!Array.isArray(data.sounds)||data.sounds.length>500)throw Error('Gói soundboard không hợp lệ.');const board={id:randomUUID(),name:String(data.board?.name||'Imported board').slice(0,100),color:'#00ded1',soundIds:[]};for(const x of data.sounds){if(typeof x.audioBase64!=='string'||!audioExtensions.includes(x.extension))throw Error('Âm thanh trong gói không hợp lệ.');const buffer=Buffer.from(x.audioBase64,'base64');if(buffer.length>50*1024*1024)throw Error('Âm thanh quá lớn.');const id=randomUUID(),rel=`audio/${id}${x.extension}`;await fs.writeFile(path.join(store.dir,rel),buffer);const s=soundSettings({id,name:String(x.name||'Imported sound').slice(0,200),author:String(x.author||'Bạn'),source:'local',audioFile:rel,volume:x.volume,mode:x.mode,loop:!!x.loop,stopOthers:!!x.stopOthers,muteOthers:!!x.muteOthers,muteVoice:!!x.muteVoice,trimStart:Math.max(0,Number(x.trimStart)||0),trimEnd:Math.max(0,Number(x.trimEnd)||0),speed:x.speed,fadeIn:x.fadeIn,fadeOut:x.fadeOut,favorite:!!x.favorite});if(typeof x.imageBase64==='string'){const image=Buffer.from(x.imageBase64,'base64');if(image.length<=5*1024*1024){s.imageFile=`images/${id}.img`;await fs.writeFile(path.join(store.dir,s.imageFile),image);}}store.data.sounds.push(s);board.soundIds.push(id);}if(typeof data.coverBase64==='string'){const bytes=Buffer.from(data.coverBase64,'base64');if(bytes.length<=5*1024*1024){board.coverFile=`images/${randomUUID()}.img`;await fs.writeFile(path.join(store.dir,board.coverFile),bytes);}}store.data.boards.push(board);await clearRetiredArtwork(store.data,store.dir);await store.save();return publicData();});
  handle('open-data',()=>shell.openPath(store.dir));
  handle('window',action=>{if(action==='is-visible')return isWindowVisible();if(action==='minimize')win.minimize();if(action==='maximize')win.isMaximized()?win.unmaximize():win.maximize();if(action==='close')win.close();if(action==='quit'){quitting=true;app.quit();}});
}
function createWindow(){
  win=new BrowserWindow({width:1480,height:940,frame:false,minWidth:1040,minHeight:700,backgroundColor:'#080b0b',title:'Soundboard Studio',icon:path.join(__dirname,'../dist/brand/app.ico'),autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  for(const event of ['show','hide','minimize','restore'])win.on(event,()=>send('window-visibility',isWindowVisible()));
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('render-process-gone',()=>audioSession?.stop().catch(error=>console.error('Microphone recovery:',error.message)));
  win.webContents.on('will-navigate',(e,url)=>{const origin=process.env.SOUNDBOARD_DEV_URL;if(!(origin&&url.startsWith(origin+'/')))e.preventDefault();});
  win.webContents.session.setDisplayMediaRequestHandler(async(_request,callback)=>{try{const sources=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:1,height:1}});callback(sources.length?{video:sources[0],audio:'loopback'}:{});}catch{callback({});}});
  const localRenderer=web=>web?.id===win.webContents.id;
  const capturePermission=permission=>permission==='media'||permission==='display-capture';
  win.webContents.session.setPermissionCheckHandler((web,permission)=>localRenderer(web)&&capturePermission(permission));
  win.webContents.session.setPermissionRequestHandler((web,permission,cb)=>cb(localRenderer(web)&&capturePermission(permission)));
  win.webContents.session.webRequest.onHeadersReceived((details,cb)=>cb({responseHeaders:{...details.responseHeaders,'Content-Security-Policy':["default-src 'self'; script-src 'self'"+(process.env.SOUNDBOARD_DEV_URL?" 'unsafe-inline'":"")+"; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: soundasset: https://*.voicemod.net; media-src 'self' blob: soundasset:; connect-src 'self' soundasset: ws://127.0.0.1:5173; object-src 'none'"]}}));
  if(process.env.SOUNDBOARD_DEV_URL)win.loadURL(process.env.SOUNDBOARD_DEV_URL);else win.loadFile(path.join(__dirname,'../dist/index.html'));
  win.on('close',e=>{if(!quitting){e.preventDefault();if(tray&&store.data.settings.closeToTray)win.hide();else app.quit();}});
}
if(!app.requestSingleInstanceLock())app.quit();else{
  app.on('second-instance',()=>{win?.show();win?.focus();});
  app.whenReady().then(async()=>{
    const dataDir=process.env.SOUNDBOARD_DATA_DIR||(app.isPackaged?path.join(app.getPath('userData'),'library'):path.join(__dirname,'../.soundboard-data'));
    store=new Store(dataDir);await store.init();store.data.settings.micEnabled=false;
    nativeSessionDir=localAudioDirectory(process.env,app.getPath('userData'));store.data.settings=await loadLocalDevices(nativeSessionDir,store.data.settings);
    helperDir=path.join(nativeSessionDir,'native-audio-helpers');await fs.mkdir(helperDir,{recursive:true});for(const file of ['windows-audio.ps1','driver-setup.ps1'])await fs.writeFile(path.join(helperDir,file),await fs.readFile(path.join(__dirname,file)));
    audioSession=new AudioSession(nativeSessionDir,{helperDir,disabled:process.env.SOUNDBOARD_AUDIO_AUTOMATION==='0'});await audioSession.recover().catch(e=>console.error('Microphone recovery:',e.message));
    protocol.handle('soundasset',async request=>{try{const url=new URL(request.url),rel=decodeURIComponent(url.pathname).slice(1),full=path.resolve(store.dir,rel);if(url.host!=='local'||(!rel.startsWith('audio/')&&!rel.startsWith('images/'))||!full.startsWith(path.resolve(store.dir)+path.sep))return new Response('Forbidden',{status:403});const response=await net.fetch(pathToFileURL(full).toString());const headers=new Headers(response.headers);headers.set('Access-Control-Allow-Origin','*');return new Response(response.body,{status:response.status,headers});}catch{return new Response('Not found',{status:404});}});
    setupIPC();startHook();createWindow();configureHotkeys();configureSync();
    tray=new Tray(path.join(__dirname,'../dist/brand/app.ico'));tray.setToolTip('Soundboard Studio');tray.setContextMenu(Menu.buildFromTemplate([{label:'Mở Soundboard Studio',click:()=>win.show()},{label:'Dừng tất cả',click:()=>send('trigger',{id:'__stop__',phase:'press'})},{label:'Thoát',click:()=>{quitting=true;app.quit();}}]));tray.on('double-click',()=>win.show());
    if(store.data.settings.startMinimized)win.hide();
    if(store.data.settings.autoSync)setTimeout(syncCommunity,2000).unref();
  }).catch(e=>{console.error(e);dialog.showErrorBox('Soundboard Studio',e.message);app.quit();});
  app.on('before-quit',e=>{quitting=true;if(quitRestored||!audioSession){clearInterval(syncTimer);globalShortcut.unregisterAll();try{hook?.uIOhook.stop();}catch{}return;}if(audioSession&&!quitRestored){e.preventDefault();if(restoringQuit)return;restoringQuit=true;audioSession.stop().then(()=>{quitRestored=true;app.quit();}).catch(async error=>{restoringQuit=false;quitting=false;win?.show();const choice=await dialog.showMessageBox(win,{type:'warning',title:'Soundboard Studio',message:error.message,detail:'The microphone recovery record will be kept for the next launch.',buttons:['Keep open','Quit anyway'],defaultId:0,cancelId:0});if(choice.response===1){quitRestored=true;app.quit();}});}});
  app.on('window-all-closed',()=>app.quit());
}
