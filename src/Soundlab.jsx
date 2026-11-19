import {t} from './i18n';
import React,{useEffect,useRef,useState} from 'react';
import {AudioLines,Loader2,Pencil} from './Icons';
import {Knob,Loudometer,Waveform} from './SoundlabControls';
import {SoundlabPlayer,renderEdit,fadeSeconds} from './soundlab-audio';
export {bufferToWav,renderEdit} from './soundlab-audio';

export default function Soundlab({sound,engine,settings,onSave,onClose,onError,onPickArtwork,stopSignal=0,previewRef,windowVisible}){
 const [buffer,setBuffer]=useState(null),[edit,setEdit]=useState(null),[busy,setBusy]=useState(null),[error,setError]=useState(null),[playback,setPlayback]=useState({position:0,playing:false,loop:false});
 const player=useRef(null),alive=useRef(false),editRef=useRef(null),reportError=useRef(onError);reportError.current=onError;
 useEffect(()=>{alive.current=true;engine.stopPreviews();engine.buffer(sound).then(b=>{
  if(!alive.current)return;const start=Math.max(0,Math.min(Number(sound.trimStart)||0,Math.max(0,b.duration-.01))),end=Number(sound.trimEnd)>start?Math.min(Number(sound.trimEnd),b.duration):b.duration,speed=Number(sound.speed)||1,duration=(end-start)/speed;
  const value={name:sound.name,start,end,speed,pitch:0,fadeIn:fadeSeconds(Number(sound.fadeIn)||0,duration),fadeOut:fadeSeconds(Number(sound.fadeOut)||0,duration),loudness:0,volume:sound.volume??100,imageFile:sound.imageFile||'',image:sound.image||''};setBuffer(b);setEdit(value);editRef.current=value;
  const preview=new SoundlabPlayer(b,value,state=>{if(alive.current)setPlayback(state);});preview.onError=e=>reportError.current(e.message);player.current=preview;if(previewRef)previewRef.current={player:preview,sound};preview.monitor(settings).catch(preview.onError);
 }).catch(e=>{if(alive.current)setError(e.message);});return()=>{alive.current=false;if(previewRef?.current?.player===player.current)previewRef.current=null;player.current?.dispose();player.current=null;};},[sound.id]);
 useEffect(()=>{player.current?.monitor(settings).catch(e=>onError(e.message));},[settings.monitorDevice,settings.monitorVolume,settings.monitorMuted]);
 useEffect(()=>{if(player.current){player.current.pause();player.current.reset();}},[stopSignal]);
 useEffect(()=>{if(!playback.playing||!windowVisible)return;let frame;const tick=()=>{if(alive.current&&player.current){setPlayback(p=>({...p,position:player.current.position()}));frame=requestAnimationFrame(tick);}};tick();return()=>cancelAnimationFrame(frame);},[playback.playing,windowVisible]);
 const patch=value=>{const next={...editRef.current,...value};editRef.current=next;setEdit(next);setError(null);player.current?.update(next);};
 const preview=operation=>{try{const result=operation(player.current);result?.catch(e=>onError(e.message));}catch(e){onError(e.message);}};
 const changeArtwork=async()=>{const file=await onPickArtwork?.();if(file)patch({imageFile:file});};
 const save=async copy=>{
  if(busy||!edit)return;const name=edit.name.trim();if(name.length<3||name.length>63){setError('Use 3–63 characters for the sound name.');return;}if((edit.end-edit.start)/edit.speed>480){setError('The selection must be 8 minutes or shorter.');return;}
  player.current?.pause();setBusy(copy?'copy':'save');setError(null);
  try{const blob=await renderEdit(buffer,edit);if(alive.current)await onSave(blob,name,copy,edit.volume,edit.imageFile);}catch(e){if(alive.current)setError(e.message);}finally{if(alive.current)setBusy(null);}
 };
 const valid=edit&&edit.name.trim().length>=3&&edit.name.trim().length<=63&&(edit.end-edit.start)/edit.speed<=480;
 const image=edit?.imageFile?'soundasset://local/'+edit.imageFile:edit?.image;
 return <section className="soundlab-panel sl-editor" aria-label={t("Editing sound")} aria-busy={!!busy}>
  {!edit?<div className="sl-loading" role="status">{error?<><AudioLines/><p>{t(error)}</p><button onClick={onClose}>{t("Back to inspector")}</button></>:<><Loader2 className="spin"/><p>{t("Loading sound…")}</p></>}</div>:<>
   <div className="sl-content">
    <div className="sl-block sl-sound-header"><button className="sl-artwork" aria-label={t("Change Soundlab artwork")} title={t("Change artwork")} onClick={changeArtwork} disabled={!!busy}>{image?<img src={image} alt=""/>:<img src={import.meta.env.BASE_URL+'assets/sound-default.png'} alt=""/>}<span><Pencil size={20}/></span></button><label className="sl-name-field"><span>{t("Sound name")}</span><input aria-label={t("Soundlab name")} minLength={3} maxLength={63} value={edit.name} aria-invalid={edit.name.trim().length<3} disabled={!!busy} onChange={e=>patch({name:e.target.value})}/><small className={edit.name.trim().length<3?'invalid':''}>{edit.name.length} / 63</small></label></div>
    <div className="sl-block sl-wave-block"><button className={'sl-fade fade-in '+(edit.fadeIn?'active':'')} aria-label={t("Fade in")} aria-pressed={!!edit.fadeIn} title={t("Fade in")} disabled={!!busy} onClick={()=>patch({fadeIn:edit.fadeIn?0:Number(Math.min(1,(edit.end-edit.start)/edit.speed*.2).toFixed(3))})}><i/></button><button className={'sl-fade fade-out '+(edit.fadeOut?'active':'')} aria-label={t("Fade out")} aria-pressed={!!edit.fadeOut} title={t("Fade out")} disabled={!!busy} onClick={()=>patch({fadeOut:edit.fadeOut?0:Math.min(1,(edit.end-edit.start)/edit.speed*.2)})}><i/></button><Waveform buffer={buffer} edit={edit} playback={playback} onChange={patch} onSeek={value=>preview(p=>p?.seek(value))} onPlay={()=>preview(p=>p?.play())} onPause={()=>preview(p=>p?.pause())} onReset={()=>preview(p=>p?.reset())} onLoop={value=>preview(p=>p?.setLoop(value))}/></div>
    {(edit.fadeIn>0||edit.fadeOut>0)&&<div className="sl-block sl-fade-times">{[['fadeIn','Fade in'],['fadeOut','Fade out']].filter(([key])=>edit[key]>0).map(([key,label])=><label key={key}>{t(label)}<span><input type="number" aria-label={t('Soundlab '+label.toLowerCase()+' seconds')} min={0} max={Math.min(10,(edit.end-edit.start)/edit.speed)} step={.01} value={edit[key]} onChange={e=>{if(e.target.value!=='')patch({[key]:Math.max(0,Math.min(10,(edit.end-edit.start)/edit.speed,Number(e.target.value)||0))});}}/>{t("s")}</span></label>)}</div>}
    <div className="sl-block sl-knobs" inert={busy?true:undefined}><Knob label={t("Pitch")} value={edit.pitch} min={-24} max={24} origin={0} onChange={value=>patch({pitch:value})}/><Knob label={t("Speed")} value={edit.speed} min={.5} max={3.5} step={.05} origin={1} unit="x" markers={[.5,1,1.5,2,2.5,3,3.5]} onChange={value=>patch({speed:value})}/><Knob highlightFromMin label={t("Volume")} value={edit.volume} min={0} max={100} origin={sound.volume??100} onChange={value=>patch({volume:value})}/></div>
    <div className="sl-block sl-loudness-block" inert={busy?true:undefined}><Loudometer value={edit.loudness} onChange={value=>patch({loudness:value})}/></div>
   </div>
   <footer className="sl-actions">{error&&<p className="sl-error" role="alert">{t(error)}</p>}<div className="sl-action-buttons"><button disabled={!!busy||!valid} className="sl-save-copy" onClick={()=>save(true)}>{busy==='copy'?<Loader2 size={18} className="spin"/>:t('Save a copy')}</button><button disabled={!!busy||!valid} className="sl-save" onClick={()=>save(false)}>{busy==='save'?<Loader2 size={18} className="spin"/>:t('Save')}</button></div>{busy&&<span className="sl-saving-status" role="status">{t("Saving sound…")}</span>}</footer>
   {busy&&<div className="sl-saving-overlay" aria-hidden="true"/>}
  </>}
 </section>;
}
