import {t,useLocale,setLanguage} from './i18n';
import React,{lazy,Suspense,useEffect,useRef,useState,useCallback,useSyncExternalStore} from 'react';
import {createRoot} from 'react-dom/client';
import {version} from '../package.json';
import {AudioLines,LayoutGrid,Library,SlidersHorizontal,Circle,Settings,Plus,Search,Upload,Download,Share2,MoreHorizontal,Play,Pause,Square,Volume2,VolumeX,MicOff,Headphones,ChevronDown,ChevronRight,X,Check,Heart,RefreshCw,Keyboard,Repeat,SkipBack,Layers,Trash2,Pencil,FolderOpen,ExternalLink,Radio,CloudDownload,CheckCircle2,ArrowDownToLine,GripVertical,ArrowUpRight,Info,FileAudio,Copy,Shuffle,Minus,Maximize2,Loader2,Music2,MoveRight,Clock3} from './Icons';
import {AudioEngine} from './audio';
import {createPlaybackDisplay} from './playback-display';
import {Recorder,trimRecording} from './recorder';
import RecorderPanel from './RecorderPanel';
import SoundInspector from './SoundInspector';
import SettingsPage from './SettingsPage';
import VirtualMic,{useVirtualMic} from './VirtualMic';
import {chooseMixMicrophone,mixMicrophoneInputs} from './mix-input';
import SoundLibrary from './SoundLibrary';
import {waveformCover} from './sound-art';
import SoundboardDock from './SoundboardDock';
import AboutPanel from './AboutPanel';
import ShortcutDialog from './ShortcutDialog';
import './style.css';
import './layout.css';
import './soundlab.css';
import {EffectSlider} from './Controls';
import './controls-base.css';
import './panel-ux.css';
import './soundboard-dock.css';
import './studio-ui.css';
import './dock-mic.css';
import {ModeRestart,ModePause,ModeStop,ModeOverlap,ModeHold} from './Icons';
import {modeOptions} from './playback-contract';

const api=window.soundboard;
const Soundlab=lazy(()=>import('./Soundlab'));
const modeNames={overlap:'Play & Overlap',pause:'Play & Pause',stop:'Play & Stop',restart:'Play & Restart',hold:'Push to Loop'};
const modeIcons={overlap:ModeOverlap,pause:ModePause,stop:ModeStop,restart:ModeRestart,hold:ModeHold};
const formatTime=n=>`${Math.floor((n||0)/60).toString().padStart(2,'0')}:${Math.floor((n||0)%60).toString().padStart(2,'0')}`;
const imageURL=s=>s?.imageFile?`soundasset://local/${s.imageFile}`:s?.image;
const shortKey=s=>(s||'').replace('Control','Ctrl').replace('CommandOrControl','Ctrl');
const colors=['#00ded1','#b6f56b','#ad92f5','#ef9e75','#f08ca5','#7faef0'];

function IconButton({icon:Icon,title,onClick,active,className='',...rest}){return <button className={`icon-button ${active?'active':''} ${className}`} title={t(title)} aria-label={t(title)} onClick={onClick} {...rest}><Icon size={18}/></button>;}
function SoundArt({sound,large=false}){
  const [failedUrl,setFailedUrl]=useState(null);
  const url=imageURL(sound);
  const fallback=!url||url===failedUrl;
  const src=fallback?waveformCover(sound?.id||sound?.name):url;
  return <div className={`sound-art ${large?'large':''}`} style={{'--pad-color':sound?.color||colors[(sound?.name?.charCodeAt(0)||0)%colors.length]}}>
    <img key={src} src={src} alt="" loading="lazy" onError={fallback?undefined:()=>setFailedUrl(url)}/>
  </div>;
}
function PadProgress({playbackDisplay,id}){
  const instance=useSyncExternalStore(playbackDisplay.subscribe,()=>playbackDisplay.getPad(id));
  if(!instance||instance.paused)return null;
  const progress=(instance.position-instance.start)/(instance.end-instance.start)*100;
  return <span className="pad-progress" style={{width:`${progress}%`}}/>;
}
function Switch({checked,onChange,label,text=label,disabled=false}){return <label className={`switch-label ${disabled?'disabled':''}`}><span>{t(text)}</span><input aria-label={t(label)} type="checkbox" checked={!!checked} onChange={e=>onChange(e.target.checked)} disabled={disabled}/><span className="switch"/></label>;}
function Range({label,value,onChange,min=0,max=100,step=1,suffix='%',onCommit}){return <label className="range-label"><span>{t(label)}<b>{value}{suffix}</b></span><input aria-label={t(label)} type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(Number(e.target.value))} onPointerUp={onCommit} onKeyUp={onCommit} onBlur={onCommit}/></label>;}

function App(){
  useLocale();
  const [padMenu,setPadMenu]=useState(null);
  useEffect(()=>{if(!padMenu)return;document.querySelector('.pad-context-menu button')?.focus();const close=e=>{if(!e.target.closest('.pad-context-menu'))setPadMenu(null);};const key=e=>{if(e.key==='Escape'){e.preventDefault();setPadMenu(null);document.querySelector(`[data-sound-id="${CSS.escape(padMenu.id)}"] .pad-trigger`)?.focus();}};const hide=()=>setPadMenu(null);document.addEventListener('pointerdown',close);document.addEventListener('keydown',key);window.addEventListener('resize',hide);document.addEventListener('scroll',hide,true);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',key);window.removeEventListener('resize',hide);document.removeEventListener('scroll',hide,true);};},[padMenu]);
  const [settingsTab,setSettingsTab]=useState('audio');
  const [micJump,setMicJump]=useState(0);
  const micSection=useRef(null);
  const [stopSignal,setStopSignal]=useState(0);
  const [windowVisible,setWindowVisible]=useState(false);
  const [playbackDisplay]=useState(createPlaybackDisplay);
  const playbackActivity=useSyncExternalStore(playbackDisplay.subscribe,playbackDisplay.getActivity);
  const openSettings=(tab='audio')=>{setSettingsTab(tab);setView('settings');setModal(null);};
  const [recordSource,setRecordSource]=useState('mic'),[replayBusy,setReplayBusy]=useState(false);
  const [data,setData]=useState(null),[boardId,setBoardId]=useState(localStorage.getItem('activeBoard')||''),[view,setView]=useState('board'),[panel,setPanel]=useState('library'),[selectedId,setSelectedId]=useState(null),[boardSearch,setBoardSearch]=useState(''),[libraryText,setLibraryText]=useState(''),[sort,setSort]=useState('trending'),[category,setCategory]=useState(''),[source,setSource]=useState('community'),[results,setResults]=useState([]),[next,setNext]=useState(null),[loading,setLoading]=useState(false),[libraryError,setLibraryError]=useState(null),[sync,setSync]=useState({busy:false}),[busyIds,setBusyIds]=useState(new Set()),[toast,setToast]=useState(null),[modal,setModal]=useState(null),[menu,setMenu]=useState(false),[devices,setDevices]=useState([]),[hotkeyStatus,setHotkeyStatus]=useState(null),[dropOver,setDropOver]=useState(false),[recording,setRecording]=useState(false),[recordSeconds,setRecordSeconds]=useState(0),[recordBlob,setRecordBlob]=useState(null),[recordName,setRecordName]=useState(''),[replay,setReplay]=useState(false),[replaySeconds,setReplaySeconds]=useState(30),[hotkeyCapture,setHotkeyCapture]=useState(null),[compact,setCompact]=useState(false);
  const notify=useCallback((message,type='info')=>setToast({message,type,id:Date.now()}),[]);
  const soundlabPreview=useRef(null),micToggleSeq=useRef(0);
  const boardRail=useRef(null);
  const engine=useRef(null),recorder=useRef(new Recorder()),dataRef=useRef(null),selectedRef=useRef(null),querySeq=useRef(0),recordStart=useRef(null),recordAudio=useRef(null),dragId=useRef(null),captureRef=useRef(null),settingsSeq=useRef(0),soundSeq=useRef(new Map());
  if(!engine.current&&api)engine.current=new AudioEngine(api,message=>notify(t(message),'error'));
  const accept=useCallback(value=>{if(value){setLanguage(value.settings?.language);setData(value);dataRef.current=value;}return value;},[]);
  const stopAll=useCallback(()=>{engine.current.stopAll();recordAudio.current?.pause();setStopSignal(n=>n+1);},[]);
  useEffect(()=>{
    if(view==='board')boardRail.current?.querySelector('.rail-board.active')?.scrollIntoView({block:'nearest',inline:'nearest'});
  },[boardId,view,!!data]);
  const call=useCallback(async(channel,...args)=>{try{return await api.invoke(channel,...args);}catch(e){notify(t(e.message.replace(/^Error invoking remote method '[^']+': Error: /,'')),'error');return null;}},[notify]);
  useEffect(()=>{if(!api)return;let alive=true;api.invoke('get-data').then(d=>{if(alive){accept(d);if(d.runtime?.openSettings)openSettings();if(d.runtime?.openSoundlab){const id=d.runtime.openSoundlab;setSelectedId(id);setPanel('soundlab');const board=d.boards.find(b=>b.soundIds.includes(id));if(board)setBoardId(board.id);}setHotkeyStatus({native:d.runtime?.nativeHotkeys,errors:[]});}}).catch(e=>notify(t(e.message),'error'));
    const unsub=[api.on('library-changed',accept),api.on('sync-status',setSync),api.on('hotkey-status',setHotkeyStatus),api.on('trigger',event=>{if(event.phase==='release'){const sound=dataRef.current?.sounds.find(s=>s.id===event.id);if(sound)engine.current.trigger(sound,event);return;}if(captureRef.current)return;const focused=document.activeElement;if(document.hasFocus()&&focused&&['INPUT','TEXTAREA','SELECT'].includes(focused.tagName))return;if(event.id==='__stop__'){stopAll();return;}const s=dataRef.current?.sounds.find(s=>s.id===event.id);if(s)engine.current.trigger(s,event);})];
    return()=>{alive=false;unsub.forEach(f=>f());engine.current.stopAll();recorder.current.close();};
  },[]);
  useEffect(()=>{
    if(!api)return;
    let useInitialVisibility=true;
    const unsubscribe=api.on('window-visibility',visible=>{
      useInitialVisibility=false;
      setWindowVisible(visible);
    });
    api.invoke('window','is-visible').then(visible=>{
      if(useInitialVisibility)setWindowVisible(visible);
    }).catch(error=>notify(error.message,'error'));
    return()=>{useInitialVisibility=false;unsubscribe();};
  },[notify]);
  useEffect(()=>{
    if(!windowVisible||!engine.current)return;
    const sample=()=>{
      const editor=soundlabPreview.current,player=editor?.player;
      if(!engine.current.instances.length&&!player?.playing&&!playbackDisplay.getVoices().length)return;
      const current=engine.current.snapshot();
      if(player?.playing)current.push({instanceId:'soundlab',loop:player.loop,speed:player.edit.speed,id:editor.sound.id,name:editor.sound.name,image:editor.sound.image,imageFile:editor.sound.imageFile,preview:true,editor:true,position:player.position(),start:player.edit.start,end:player.edit.end,paused:false});
      playbackDisplay.update(current);
    };
    sample();
    const interval=setInterval(sample,80);
    return()=>clearInterval(interval);
  },[playbackDisplay,windowVisible]);
  useEffect(()=>{if(!data)return;let id=boardId;if(!data.boards.some(b=>b.id===id))id=data.boards[0]?.id;if(id!==boardId)setBoardId(id);localStorage.setItem('activeBoard',id||'');dataRef.current=data;engine.current.applySettings(data.settings).catch(e=>notify(t('Thiết bị âm thanh: '+e.message),'error'));for(const s of data.sounds)engine.current.updateSound(s);},[data,boardId]);
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(null),5000);return()=>clearTimeout(t);},[toast]);
  useEffect(()=>{captureRef.current=hotkeyCapture;},[hotkeyCapture]);
  useEffect(()=>{selectedRef.current=selectedId;},[selectedId]);
  const refreshDevices=useCallback(async(ask=false)=>{try{if(ask){const stream=await navigator.mediaDevices.getUserMedia({audio:true});stream.getTracks().forEach(t=>t.stop());}setDevices(await navigator.mediaDevices.enumerateDevices());}catch(e){notify(t('Không truy cập được thiết bị: '+e.message),'error');}},[notify]);
  useEffect(()=>{const changed=()=>refreshDevices();refreshDevices();navigator.mediaDevices?.addEventListener('devicechange',changed);return()=>navigator.mediaDevices?.removeEventListener('devicechange',changed);},[]);
  const changeLibrary=(key,value)=>{const current={source,text:libraryText,sort,category}[key];if(value===current)return;querySeq.current++;setNext(null);setLibraryError(null);if(key!=='source'||value==='community'){setResults([]);setLoading(true);}({source:setSource,text:setLibraryText,sort:setSort,category:setCategory})[key](value);};
  const fetchCommunity=useCallback(async({append=false,explicit=false}={})=>{
    if(!api||source!=='community')return;const seq=++querySeq.current;setLoading(true);setLibraryError(null);
    try{const response=await api.invoke('community-query',{text:libraryText,sort,category,next:append?next:null});if(seq!==querySeq.current)return;setResults(prev=>append?[...new Map([...prev,...response.items].map(s=>[s.id,s])).values()]:response.items);setNext(response.next);}
    catch(e){if(seq!==querySeq.current)return;setLibraryError('Không kết nối được. Đang hiển thị bản cache.');setResults((dataRef.current?.community.items||[]).filter(s=>(!libraryText||s.name.toLowerCase().includes(libraryText.toLowerCase()))&&(!category||(s.categories||[s.category]).includes(category))));setNext(null);if(explicit)notify(t(e.message),'error');}
    finally{if(seq===querySeq.current)setLoading(false);}
  },[source,libraryText,sort,category,next,notify]);
  useEffect(()=>{if(!data||source!=='community')return;setLoading(true);const t=setTimeout(()=>fetchCommunity(),350);return()=>{clearTimeout(t);querySeq.current++;};},[!!data,source,libraryText,sort,category]);
  useEffect(()=>{if(!sync.busy&&sync.lastSync&&source==='community'&&!libraryText&&!category)fetchCommunity();},[sync.lastSync]);
  useEffect(()=>{if(!recording)return;const t=setInterval(()=>{const seconds=(Date.now()-recordStart.current)/1000;setRecordSeconds(seconds);if(seconds>=45)stopRecording();},100);return()=>clearInterval(t);},[recording]);
  useEffect(()=>{const release=()=>{for(const i of engine.current?.instances||[])if(i.sound.mode==='hold')engine.current.stop(i.sound.id);};window.addEventListener('pointerup',release);return()=>window.removeEventListener('pointerup',release);},[]);
  const updateSound=async(id,patch)=>{const before=dataRef.current.sounds.find(s=>s.id===id);if(!before)return;const sequence=(soundSeq.current.get(id)||0)+1;soundSeq.current.set(id,sequence);const next=patch.mode&&patch.mode!==before.mode?{...before,loop:patch.mode==='hold',stopOthers:false,muteOthers:false,muteVoice:false,...patch}:{...before,...patch};accept({...dataRef.current,sounds:dataRef.current.sounds.map(s=>s.id===id?next:s)});const result=await call('sound-update',id,patch);if(soundSeq.current.get(id)===sequence){const saved=result?.sounds.find(s=>s.id===id)||before;accept({...dataRef.current,sounds:dataRef.current.sounds.map(s=>s.id===id?saved:s)});}return result;};
  const updateSettings=async patch=>{const previous=dataRef.current.settings,sequence=++settingsSeq.current;accept({...dataRef.current,settings:{...previous,...patch}});const result=await call('settings-update',patch);if(sequence===settingsSeq.current)accept({...dataRef.current,settings:result?result.settings:previous});return result;};
  const updateBoard=async patch=>accept(await call('board-update',boardId,patch));
  const play=async(sound,options={})=>{setSelectedId(sound.id);setBusyIds(s=>new Set(s).add(sound.id));try{const duration=await engine.current.trigger(sound,options);if(duration&&dataRef.current.sounds.some(s=>s.id===sound.id)&&Math.abs((sound.duration||0)-duration)>.1)updateSound(sound.id,{duration});}finally{setBusyIds(s=>{const n=new Set(s);n.delete(sound.id);return n;});}};
  const addSound=async sound=>{setBusyIds(s=>new Set(s).add(sound.id));const result=await call('sound-add',sound.id,boardId);if(result){accept(result);notify(t('Đã thêm và lưu offline: '+sound.name),'success');}setBusyIds(s=>{const n=new Set(s);n.delete(sound.id);return n;});};
  const importAudio=async()=>{const result=await call('import-audio',boardId);if(result){accept(result);notify(t('Đã nhập âm thanh.'),'success');}};
  const createBoard=async name=>{const result=await call('board-create',name);if(result){accept(result);setBoardId(result.boards.at(-1).id);setView('board');}setModal(null);};
  const importBoard=async()=>{const result=await call('board-import');if(result){accept(result);setBoardId(result.boards.at(-1).id);setView('board');notify(t('Đã nhập soundboard.'),'success');}};
  const exportBoard=async()=>{setMenu(false);const file=await call('board-export',boardId);if(file)notify(t('Đã xuất gói soundboard gồm các tệp âm thanh.'),'success');};
  const startRecording=async()=>{try{await recorder.current.start(data.settings.micDevice,recordSource);recordStart.current=Date.now();setRecording(true);setRecordSeconds(0);setRecordBlob(null);setRecordName('Recording '+new Date().toLocaleTimeString('vi-VN'));}catch(e){notify(t('Ghi âm thất bại: '+e.message),'error');}};
  const stopRecording=async()=>{let blob;try{blob=await recorder.current.stop();}catch(e){notify(t(e.message),'error');}setRecording(false);if(blob)setRecordBlob({blob,format:'wav',channels:blob.channels});if(!replay)recorder.current.close();};
  const saveRecording=async selection=>{if(!recordBlob)return;const blob=selection?await trimRecording(recordBlob.blob,selection.start,selection.end):recordBlob.blob;const bytes=new Uint8Array(await blob.arrayBuffer());const result=await call('record-save',bytes,recordName,boardId,recordBlob.format);if(result){accept(result);setRecordBlob(null);notify(t('Đã lưu bản ghi vào soundboard.'),'success');}};
  const changeMicDevice=async device=>{
    try{
      if(routing.status?.active){
        const selected=chooseMixMicrophone(devices,device);
        if(!selected)throw Error('No physical microphone available.');
        device=selected.deviceId;
      }
      if(dataRef.current.settings.micEnabled){
        const switched=await engine.current.enableMic(true,device);
        if(!switched)return;
      }
      await updateSettings({micDevice:device});
    }catch(e){notify(t(e.message),'error');}
  };
  const toggleMic=async enabled=>{let device=dataRef.current.settings.micDevice;if(enabled&&routing.status?.active){try{const selected=chooseMixMicrophone(devices,device);if(!selected)throw Error("No physical microphone available.");device=selected.deviceId;}catch(error){notify(t(error.message),"error");return;}}const sequence=++micToggleSeq.current,previous=dataRef.current.settings.micEnabled;accept({...dataRef.current,settings:{...dataRef.current.settings,micEnabled:enabled}});try{await engine.current.enableMic(enabled,device);if(sequence!==micToggleSeq.current)return;await updateSettings({micEnabled:enabled});refreshDevices();}catch(e){if(sequence!==micToggleSeq.current)return;accept({...dataRef.current,settings:{...dataRef.current.settings,micEnabled:previous}});notify(t('Không bật được micro: '+e.message),'error');}};
  const toggleReplay=async enabled=>{setReplay(enabled);setReplayBusy(true);try{await recorder.current.setReplay(enabled,data.settings.micDevice,recordSource);}catch(e){setReplay(!enabled);notify(t(e.message),'error');}finally{setReplayBusy(false);}};
  const captureReplay=()=>{try{const blob=recorder.current.captureReplay(replaySeconds);toggleReplay(false);setRecordBlob({blob,format:'wav',channels:blob.channels});setRecordName('Instant replay '+new Date().toLocaleTimeString('vi-VN'));notify(t('Đã lấy '+replaySeconds+' giây gần nhất.'),'success');}catch(e){notify(t(e.message),'error');}};
  useEffect(()=>{if(!recordBlob)return;const url=URL.createObjectURL(recordBlob.blob);if(recordAudio.current)recordAudio.current.src=url;return()=>URL.revokeObjectURL(url);},[recordBlob]);

  const openVirtualMic=()=>{openSettings('audio');setMicJump(request=>request+1);};
  const routing=useVirtualMic({data,devices,engine:engine.current,updateSettings,onNeedsSetup:openVirtualMic});
  useEffect(()=>{
    const section=micSection.current;
    if(!section||!micJump)return;
    section.focus({preventScroll:true});
    section.scrollIntoView({block:'nearest'});
  },[micJump]);
  if(!api)return <div className="desktop-required"><AudioLines size={50}/><h1>{t("Soundboard Studio")}</h1><p>{t("Hãy mở ứng dụng desktop để phát âm thanh, dùng phím tắt và đồng bộ thư viện.")}</p><code>{t("npm run build")}<br/>{t("npm start")}</code></div>;
  if(!data)return <div className="boot"><AudioLines size={48}/><p>{t("Đang mở thư viện âm thanh…")}</p><Loader2 className="spin"/></div>;
  const board=data.boards.find(b=>b.id===boardId)||data.boards[0];
  const allItems=[...data.sounds,...results.filter(s=>!data.sounds.some(x=>x.id===s.id))];
  const selected=allItems.find(s=>s.id===selectedId);
  const savedSelected=selected&&data.sounds.some(s=>s.id===selected.id);
  const boardSounds=(view==='all'?data.sounds:view==='favorites'?data.sounds.filter(s=>s.favorite):board.soundIds.map(id=>data.sounds.find(s=>s.id===id)).filter(Boolean)).filter(s=>!boardSearch||s.name.toLowerCase().includes(boardSearch.toLowerCase())||s.tags?.some(t=>t.toLowerCase().includes(boardSearch.toLowerCase())));
  const libraryItems=source==='community'?results:data.sounds.filter(s=>(source!=='favorites'||s.favorite)&&(!libraryText||s.name.toLowerCase().includes(libraryText.toLowerCase())));
  const outputs=devices.filter(d=>d.kind==='audiooutput'),inputs=devices.filter(d=>d.kind==='audioinput');
  const mixInputs=routing.status?.active?mixMicrophoneInputs(inputs):inputs;
  
  const lastSync=data.community.lastSync?new Date(data.community.lastSync).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'}):'Chưa đồng bộ';
  const isBoard=view==='board';
  return <div className={`app studio-ui ${compact?'compact':''}`} onDragEnd={()=>setDropOver(false)}>
    <header className="topbar"><button className="brand-mark" title={t("Soundboard Studio")} onClick={()=>setModal({type:'help'})}><img src={import.meta.env.BASE_URL+'brand/app-mark.png'} alt=""/></button><span className="app-name">{t("Soundboard Studio")}</span><div className="top-actions"><span className="app-caption">{t("SOUNDBOARD STUDIO")}</span><IconButton icon={Minus} title={t("Minimize")} onClick={()=>call('window','minimize')}/><IconButton icon={Maximize2} title={t("Maximize")} onClick={()=>call('window','maximize')}/><IconButton icon={X} title={t("Close window")} onClick={()=>call('window','close')}/></div></header>
    <nav className="rail" aria-label={t("Main navigation")}><IconButton icon={Library} title={t("Tất cả âm thanh")} data-label="Tất cả" active={view==='all'} onClick={()=>{setBoardSearch('');setView('all');}}/><IconButton icon={Heart} title={t("Yêu thích")} data-label="Yêu thích" active={view==='favorites'} onClick={()=>{setBoardSearch('');setView('favorites');}}/><IconButton icon={Settings} title={t("Audio settings")} data-label="Cài đặt" active={view==='settings'} onClick={()=>openSettings()}/><div className="rail-line"/><div className="rail-board-zone"><div className="rail-boards" ref={boardRail}>{data.boards.map(b=><button key={b.id} title={t(b.name)} aria-label={t('Open board '+b.name)} draggable onDragStart={e=>e.dataTransfer.setData('board-id',b.id)} className={'rail-board '+(b.id===boardId&&isBoard?'active':'')} onClick={()=>{setBoardId(b.id);setView('board');setBoardSearch('');}} onDragOver={e=>e.preventDefault()} onDrop={async e=>{e.preventDefault();const dragged=e.dataTransfer.getData('board-id');if(dragged&&dragged!==b.id){const ids=data.boards.map(x=>x.id).filter(id=>id!==dragged);ids.splice(data.boards.findIndex(x=>x.id===b.id),0,dragged);accept(await call('boards-reorder',ids));return;}const id=e.dataTransfer.getData('sound-id');if(id)accept(await call('sound-add',id,b.id));}}>{b.coverFile?<img src={'soundasset://local/'+b.coverFile} alt=""/>:<LayoutGrid size={21} style={{color:b.color}}/>}</button>)}</div><IconButton icon={Plus} title={t("Tạo soundboard")} data-label="Thêm board" onClick={()=>setModal({type:'board-new',value:''})}/></div><div className="rail-bottom"><IconButton icon={Info} title={t("Hướng dẫn")} data-label="Trợ giúp" onClick={()=>setModal({type:'help'})}/></div></nav>
    <main className={`workspace ${view==='settings'?'settings-workspace':''} ${dropOver?'drop-over':''}`} data-screen-label="Soundboard" onDragOver={e=>{e.preventDefault();if(e.dataTransfer.types.includes('Files'))setDropOver(true);}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget))setDropOver(false);}} onDrop={async e=>{e.preventDefault();setDropOver(false);const id=e.dataTransfer.getData('sound-id');if(id){if(!board.soundIds.includes(id))await addSound(allItems.find(s=>s.id===id)||{id,name:'sound'});return;}const paths=[...e.dataTransfer.files].map(f=>api.filePath(f)).filter(Boolean);if(paths.length)accept(await call('drop-audio',paths,boardId));}}>
      {view==='settings'?<SettingsPage virtualMic={<VirtualMic sectionRef={micSection} routing={routing} settings={data.settings} Switch={Switch}/>} settings={data.settings} onUpdate={updateSettings} engine={engine.current} inputs={mixInputs} outputs={outputs} onRefresh={refreshDevices} onMic={toggleMic} onMicDevice={changeMicDevice} recording={recording||replay} tab={settingsTab} onTabChange={setSettingsTab} sync={sync} onSync={()=>call('community-sync')} lastSync={data.community.lastSync} onImport={importBoard} onData={()=>call('open-data')} onQuit={()=>call('window','quit')} onShortcut={setHotkeyCapture} sounds={data.sounds} SoundArt={SoundArt} hotkeyStatus={hotkeyStatus} Switch={Switch}/>:<>
      <section className="board-hero" style={{'--board-accent':board.color}}><span className="chassis-screw left" aria-hidden="true"/><span className="chassis-screw right" aria-hidden="true"/><div className="hero-content">{board.coverFile&&isBoard&&<img className="board-cover-thumb" src={'soundasset://local/'+board.coverFile} alt=""/>}<div className="board-readout"><div className="board-readout-top"><span>{t("SOUNDBOARD")}</span><span><i className={'board-led '+(playbackActivity.boardAudio?'on':'')}/>{playbackActivity.boardAudio?t('PLAYING'):t('READY')}</span></div><h1 title={t("Double-click to rename")} onDoubleClick={()=>{if(isBoard)setModal({type:'board-edit',value:board.name,color:board.color});}}>{isBoard?board.name:view==='all'?t('All sounds'):t('Favorites')}</h1><div className="board-readout-bottom"><span>{boardSounds.length}{t(" SOUNDS")}</span><span>{t("GLOBAL HOTKEYS")}</span></div></div><div className="hero-actions"><button className="secondary" title={t("Thêm âm thanh")} aria-label={t("Upload sound")} onClick={importAudio}><Upload size={15}/>{t("Upload sound")}</button>{isBoard&&<><button className="secondary" title={t("Xuất soundboard")} aria-label={t("Export board")} onClick={exportBoard}><Download size={15}/>{t("Export board")}</button><div className="menu-anchor"><IconButton icon={MoreHorizontal} title={t("Tùy chọn soundboard")} onClick={()=>setMenu(!menu)}/>{menu&&<div className="dropdown"><button onClick={async()=>{setMenu(false);accept(await call('board-cover',boardId));}}><Pencil size={15}/>{t("Edit cover")}</button><button onClick={()=>{setMenu(false);setModal({type:'board-edit',value:board.name,color:board.color});}}><Pencil size={15}/>{t("Rename soundboard")}</button><button onClick={()=>{setMenu(false);importBoard();}}><Download size={15}/>{t("Import soundboard")}</button><button onClick={exportBoard}><Share2 size={15}/>{t("Export package")}</button><button className="danger" onClick={()=>{setMenu(false);setModal({type:'board-delete'});}}><Trash2 size={15}/>{t("Remove soundboard")}</button></div>}</div></>}</div></div></section>
      <div className="board-toolbar"><div className="board-tools"><div className="inline-search"><Search size={15}/><input aria-label={t("Tìm trong soundboard")} placeholder={t("Find a sound…")} value={boardSearch} onChange={e=>setBoardSearch(e.target.value)}/>{boardSearch&&<button onClick={()=>setBoardSearch('')}><X size={12}/></button>}</div><IconButton icon={compact?LayoutGrid:GripVertical} title={t("Đổi kích thước pad")} active={compact} onClick={()=>setCompact(!compact)}/></div></div>
      <div className="pads-area"><div className="sound-grid">{boardSounds.map(s=>{const isPlaying=playbackActivity.playingPadIds.has(s.id);return <div key={s.id} data-sound-id={s.id} onContextMenu={e=>{e.preventDefault();setPadMenu({id:s.id,x:Math.max(8,Math.min(e.clientX,window.innerWidth-240)),y:Math.max(8,Math.min(e.clientY,window.innerHeight-300))});}} className={`sound-pad ${selectedId===s.id?'selected':''} ${isPlaying?'playing':''}`} draggable onDragStart={e=>{dragId.current=s.id;e.dataTransfer.setData('sound-id',s.id);}} onDragOver={e=>e.preventDefault()} onDrop={e=>{const id=e.dataTransfer.getData('sound-id');if(id&&board.soundIds.includes(id)&&isBoard){e.preventDefault();e.stopPropagation();const ids=board.soundIds.filter(x=>x!==id),at=board.soundIds.indexOf(s.id);ids.splice(at,0,id);updateBoard({soundIds:ids});}}}>
        <button className="pad-trigger" title={t(`${s.name} · ${modeNames[s.mode]||'Play'}`)} onPointerDown={e=>{if(e.button!==0)return;if(s.mode==='hold'){e.currentTarget.setPointerCapture(e.pointerId);play(s);}}} onPointerUp={()=>{if(s.mode==='hold')engine.current.trigger(s,{phase:'release'});}} onPointerCancel={()=>engine.current.trigger(s,{phase:'release'})} onClick={()=>{if(s.mode!=='hold')play(s);}} onKeyDown={e=>{if(s.mode==='hold'&&[' ','Enter'].includes(e.key)&&!e.repeat){e.preventDefault();play(s);}}} onKeyUp={e=>{if(s.mode==='hold'&&[' ','Enter'].includes(e.key)){e.preventDefault();engine.current.trigger(s,{phase:'release'});}}}><SoundArt sound={s}/><span className="pad-play">{busyIds.has(s.id)?<Loader2 className="spin" size={22}/>:isPlaying?<Pause size={22} fill="currentColor"/>:<Play size={22} fill="currentColor"/>}</span>{s.loop&&<span className="pad-loop"><Repeat size={12}/></span>}<span className="pad-duration">{formatTime(s.duration)}</span>{isPlaying&&<PadProgress playbackDisplay={playbackDisplay} id={s.id}/>}</button>
        <span className="pad-caption" title={t(s.name)}>{s.name}</span><div className="pad-title"><span title={t(s.name)}>{s.name}</span><button className={s.favorite?'favorited':''} title={t("Yêu thích")} onClick={()=>updateSound(s.id,{favorite:!s.favorite})}><Heart size={13} fill={s.favorite?'currentColor':'none'}/></button></div><div className="pad-actions"><button className={"pad-shortcut "+(!s.shortcut?"is-empty":"")} aria-label={t("Phím tắt "+s.name)} title={t("Gán phím tắt")} onClick={()=>setHotkeyCapture(s.id)}><Keyboard size={11}/>{s.shortcut?shortKey(s.shortcut):t('Add shortcut')}</button><button className="pad-edit" title={t('Chỉnh '+s.name)} aria-label={t('Chỉnh '+s.name)} onClick={()=>{setSelectedId(s.id);setPanel('inspector');}}><SlidersHorizontal size={15}/><span>{t("Chỉnh")}</span></button></div>
      </div>;})}<button className="add-pad" onClick={importAudio}><span><Plus size={26} strokeWidth={1.3}/></span><strong>{t("Add sound")}</strong><small>{t("or drop a file here")}</small></button></div>{!boardSounds.length&&<div className="empty-hint"><ArrowUpRight size={18}/><p>{boardSearch?t('Không tìm thấy âm thanh.'):t('Thêm tệp âm thanh hoặc chọn một âm từ Community Library bên cạnh.')}</p></div>}<div className="board-note"><Keyboard size={14}/><span>{t("Phím tắt hoạt động cả khi app chạy nền.")}</span><button onClick={()=>openSettings('shortcuts')}>{t("Manage shortcuts")}<ArrowUpRight size={12}/></button></div></div>
      {dropOver&&<div className="drop-overlay"><Upload size={42}/><h2>{t("Drop it. Make some noise.")}</h2><p>{t("MP3 · WAV · OGG · FLAC · M4A · WEBM")}</p></div>}
      </>}
      <SoundboardDock engine={engine.current} playbackDisplay={playbackDisplay} windowVisible={windowVisible} sounds={data.sounds} settings={data.settings} outputs={outputs} inputs={mixInputs} recording={recording||replay} onMic={toggleMic} onMicDevice={changeMicDevice} onStopInstance={instance=>{if(instance.editor){soundlabPreview.current?.player?.pause();}else engine.current.stopInstance(instance.instanceId);}} onStop={stopAll} onSettings={()=>openSettings()} onUpdate={updateSettings} onRefresh={()=>refreshDevices()} SoundArt={SoundArt}/>
    </main>
    <aside className={`right-panel panel-${panel}`}><div className="panel-head"><span>{panel==='library'?t('Library'):panel==='inspector'?t('Sound'):panel==='soundlab'?t('Soundlab'):t('Recorder')}</span><div><IconButton icon={SlidersHorizontal} title={t("Inspector")} active={panel==='inspector'} onClick={()=>setPanel('inspector')}/><IconButton icon={Library} title={t("Library")} active={panel==='library'} onClick={()=>setPanel('library')}/><IconButton icon={Circle} title={t("Recorder")} active={panel==='recorder'} onClick={()=>setPanel('recorder')}/></div></div>
      {panel==='library'&&<SoundLibrary source={source} onSource={value=>changeLibrary('source',value)} text={libraryText} onText={value=>changeLibrary('text',value)} sort={sort} onSort={value=>changeLibrary('sort',value)} category={category} onCategory={value=>changeLibrary('category',value)} items={libraryItems} selectedId={selectedId} boardIds={board.soundIds} busyIds={busyIds} previewIds={playbackActivity.previewIds} onPreview={(sound,stop)=>stop?engine.current.stopPreviews():play(sound,{preview:true})} onInspect={sound=>{setSelectedId(sound.id);setPanel('inspector');}} onAdd={addSound} loading={loading} next={next} onMore={()=>fetchCommunity({append:true})} error={libraryError} onRetry={()=>fetchCommunity({explicit:true})} autoSync={data.settings.autoSync} syncMinutes={data.settings.syncMinutes} lastSync={data.community.lastSync} syncBusy={sync.busy} onSync={()=>call('community-sync')} onSettings={()=>openSettings('library')} SoundArt={SoundArt}/ >}
      {panel==='inspector'&&<SoundInspector sound={selected} saved={savedSelected} art={<SoundArt sound={selected} large/>} onUpdate={patch=>{if(patch.mode||patch.speed||patch.loop!==undefined)engine.current.stop(selected.id);return updateSound(selected.id,patch);}} onLive={patch=>accept({...dataRef.current,sounds:dataRef.current.sounds.map(s=>s.id===selected.id?{...s,...patch}:s)})} onPreview={()=>play(selected,{preview:true})} onSoundlab={()=>{engine.current.stop(selected.id);setPanel('soundlab');}} onShortcut={()=>setHotkeyCapture(selected.id)} onAdd={()=>addSound(selected)} onArtwork={async()=>accept(await call('sound-image',selected.id))} onRemove={()=>{engine.current.stop(selected.id);call('sound-remove',selected.id,boardId).then(accept);}} onDelete={()=>setModal({type:'sound-delete',id:selected.id,name:selected.name})}/>}
      {panel==='recorder'&&<RecorderPanel recording={recording} seconds={recordSeconds} blob={recordBlob} name={recordName} onName={setRecordName} audioRef={recordAudio} recorder={recorder.current} settings={data.settings} source={recordSource} onSource={setRecordSource} inputs={inputs} onMicDevice={device=>updateSettings({micDevice:device})} onStart={startRecording} onStop={stopRecording} onSave={saveRecording} onDiscard={()=>setRecordBlob(null)} onChannel={channel=>setRecordBlob({...recordBlob,blob:recordBlob.channels[channel]})} replay={replay} replayBusy={replayBusy} onReplay={toggleReplay} replaySeconds={replaySeconds} onReplaySeconds={setReplaySeconds} onCapture={captureReplay} onError={message=>notify(t(message),'error')} Switch={Switch}/>}
    {panel==='soundlab'&&selected&&<Suspense fallback={<div className="sl-loading" role="status"><Loader2 className="spin"/><p>{t('Loading sound…')}</p></div>}><Soundlab previewRef={soundlabPreview} windowVisible={windowVisible} stopSignal={stopSignal} sound={selected} engine={engine.current} settings={data.settings} onError={message=>notify(t(message),'error')} onClose={()=>setPanel('inspector')} onPickArtwork={()=>call('soundlab-image')} onSave={async(blob,name,copy,volume,imageFile)=>{const bytes=new Uint8Array(await blob.arrayBuffer());const result=await call('sound-render-save',selected.id,bytes,name,boardId,copy,volume,imageFile);if(result){if(!copy)engine.current.invalidateBuffer(selected.id);accept(result);setSelectedId(copy?result.sounds.at(-1).id:selected.id);setPanel('inspector');notify(t('Đã render và lưu âm thanh.'),'success');}}}/></Suspense>}
    </aside>
    <footer className="statusbar"><span><span className="status-dot"/>{playbackActivity.boardAudio?t('Audio engine active'):t('Audio engine ready')}</span><span><Keyboard size={12}/>{data.sounds.filter(s=>s.shortcut).length}{t(" global shortcuts")}</span><button onClick={()=>openSettings()}><Volume2 size={12}/>{outputs.find(d=>d.deviceId===data.settings.outputDevice)?.label||t('System default output')}<ChevronRight size={12}/></button><small>{t("Soundboard Studio")} · v{version}</small></footer>
    {padMenu&&(()=>{const s=data.sounds.find(sound=>sound.id===padMenu.id);if(!s)return null;const run=fn=>{setPadMenu(null);fn();};return <div className="pad-context-menu" role="menu" aria-label={t('Tùy chọn '+s.name)} style={{left:padMenu.x,top:padMenu.y}} onKeyDown={e=>{if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const buttons=[...e.currentTarget.querySelectorAll('button')],at=buttons.indexOf(document.activeElement);buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(at+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}}}><strong>{s.name}</strong><button role="menuitem" onClick={()=>run(()=>{setSelectedId(s.id);setPanel('inspector');})}><SlidersHorizontal size={17}/>{t("Chỉnh âm")}</button><button role="menuitem" onClick={()=>run(()=>{engine.current.stop(s.id);setSelectedId(s.id);setPanel('soundlab');})}><Pencil size={17}/>{t("Soundlab")}</button><button role="menuitem" onClick={()=>run(()=>setHotkeyCapture(s.id))}><Keyboard size={17}/>{t("Phím tắt")}</button><button role="menuitem" onClick={()=>run(()=>updateSound(s.id,{favorite:!s.favorite}))}><Heart size={17} fill={s.favorite?'currentColor':'none'}/>{s.favorite?t('Bỏ yêu thích'):t('Yêu thích')}</button>{isBoard&&<button role="menuitem" className="danger" onClick={()=>run(()=>{engine.current.stop(s.id);call('sound-remove',s.id,boardId).then(accept);})}><Minus size={17}/>{t("Gỡ khỏi board")}</button>}</div>;})()}
    {toast&&<div className={`toast ${toast.type}`} role="status">{toast.type==='error'?<Info size={18}/>:toast.type==='success'?<CheckCircle2 size={18}/>:<AudioLines size={18}/>}<span>{toast.message}</span><button onClick={()=>setToast(null)}><X size={15}/></button></div>}
    {hotkeyCapture&&<ShortcutDialog name={hotkeyCapture==='__stop__'?t('Stop all sounds'):data.sounds.find(sound=>sound.id===hotkeyCapture)?.name||''} shortcut={hotkeyCapture==='__stop__'?data.settings.stopShortcut:data.sounds.find(sound=>sound.id===hotkeyCapture)?.shortcut} onClose={()=>setHotkeyCapture(null)} onAssign={async shortcut=>{const duplicate=dataRef.current.sounds.find(s=>s.id!==hotkeyCapture&&s.shortcut===shortcut);if(duplicate||(hotkeyCapture!=='__stop__'&&dataRef.current.settings.stopShortcut===shortcut))throw Error(t('This shortcut is already used.'));const result=hotkeyCapture==='__stop__'?await updateSettings({stopShortcut:shortcut}):await updateSound(hotkeyCapture,{shortcut});if(!result)throw Error(t('Could not save shortcut.'));setHotkeyCapture(null);}} onClear={async()=>{const result=hotkeyCapture==='__stop__'?await updateSettings({stopShortcut:''}):await updateSound(hotkeyCapture,{shortcut:''});if(!result)throw Error(t('Could not save shortcut.'));setHotkeyCapture(null);}}/>}
    {modal&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(null);}}><div className={`modal ${modal.type==='settings'||modal.type==='shortcuts'?'wide':''}`} role="dialog" aria-modal="true"><div className="modal-head"><h2>{modal.type==='settings'?t('Settings'):modal.type==='shortcuts'?t('Keyboard shortcuts'):modal.type==='help'?t('About'):modal.type==='board-new'?t('Create a soundboard'):modal.type==='board-edit'?t('Your soundboard'):modal.type==='sound-delete'?t('Delete sound?'):t('Delete soundboard?')}</h2><IconButton icon={X} title={t("Đóng")} onClick={()=>setModal(null)}/></div>
      {['board-new','board-edit'].includes(modal.type)&&<form onSubmit={async e=>{e.preventDefault();if(!modal.value?.trim())return;if(modal.type==='board-new')createBoard(modal.value.trim());else{await updateBoard({name:modal.value.trim(),color:modal.color});setModal(null);}}}><label className="field">{t("Soundboard name")}<input autoFocus minLength="3" maxLength="30" value={modal.value} onChange={e=>setModal({...modal,value:e.target.value})} placeholder={t("A name for your collection")}/></label>{modal.type==='board-edit'&&<div className="color-picker">{colors.map(c=><button type="button" key={c} aria-label={t(c)} style={{background:c}} className={modal.color===c?'selected':''} onClick={()=>setModal({...modal,color:c})}>{modal.color===c&&<Check size={16}/>}</button>)}</div>}<div className="modal-foot"><button type="button" className="secondary" onClick={()=>setModal(null)}>{t("Cancel")}</button><button className="primary" disabled={(modal.value?.trim().length||0)<3}>{modal.type==='board-new'?t('Create soundboard'):t('Save changes')}</button></div></form>}
      {modal.type==='board-delete'&&<><p>{t("Gỡ “")}{board.name}{t("” khỏi danh sách. Các âm thanh vẫn còn trong All sounds.")}</p><div className="modal-foot"><button className="secondary" onClick={()=>setModal(null)}>{t("Cancel")}</button><button className="danger-button" disabled={data.boards.length<2} onClick={async()=>{accept(await call('board-delete',boardId));setModal(null);}}>{t("Delete board")}</button></div>{data.boards.length<2&&<p className="muted">{t("Cần giữ ít nhất một soundboard.")}</p>}</>}
      {modal.type==='sound-delete'&&<><p>{t("Xóa “")}{modal.name}{t("” khỏi thư viện và tất cả soundboard?")}</p><div className="modal-foot"><button className="secondary" onClick={()=>setModal(null)}>{t("Cancel")}</button><button className="danger-button" onClick={async()=>{engine.current.stop(modal.id);const result=await call('sound-delete',modal.id);if(result)engine.current.invalidateBuffer(modal.id);accept(result);setSelectedId(null);setModal(null);}}>{t("Delete sound")}</button></div></>}
      {modal.type==='shortcuts'&&<><p className="muted">{hotkeyStatus?.native?t('Native keyboard hook đang hoạt động. Push to Loop dừng khi thả phím, kể cả khi app chạy nền.'):t('Đang dùng Electron global shortcuts. Push to Loop dùng phím bật/tắt khi app chạy nền.')}</p>{hotkeyStatus?.errors?.map(e=><p className="inline-warning" key={e}>{e}</p>)}<div className="shortcut-list"><div><span><Square size={15}/>{t("Stop all sounds")}</span><button className="shortcut-button" onClick={()=>setHotkeyCapture('__stop__')}>{shortKey(data.settings.stopShortcut)||t('Set shortcut')}</button></div>{data.sounds.map(s=><div key={s.id}><span><SoundArt sound={s}/>{s.name}</span><button className="shortcut-button" onClick={()=>setHotkeyCapture(s.id)}>{shortKey(s.shortcut)||t('Add shortcut')}</button></div>)}</div></>}

      {modal.type==='help'&&<AboutPanel onAudio={()=>openSettings('audio')} onShortcuts={()=>openSettings('shortcuts')}/>}
    </div></div>}
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
