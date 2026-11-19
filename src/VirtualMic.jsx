import React,{useCallback,useEffect,useId,useRef,useState} from 'react';
import {t} from './i18n';
import {Mic,RefreshCw,Download,ChevronDown,ExternalLink} from './Icons';
import {chooseMixMicrophone} from './mix-input';
import VirtualMicTest from './VirtualMicTest';
import './virtual-mic.css';
const api=window.soundboard;
const matches=(device,endpoint)=>device.label===endpoint?.Name||device.label?.startsWith(endpoint?.Name+' (');
export function useVirtualMic({data,devices,engine,updateSettings,onNeedsSetup}){
 const [status,setStatus]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[installing,setInstalling]=useState(false),[reboot,setReboot]=useState(false),attempted=useRef(false),working=useRef(false);
 const current=useRef();current.current={data,devices,engine,updateSettings,onNeedsSetup};
 const refresh=useCallback(async()=>{try{const next=await api.invoke('audio-session-status');setStatus(next);return next;}catch(e){setError(e.message.replace(/^Error invoking remote method '[^']+': Error: /,''));return null;}},[]);
 useEffect(()=>{if(!api)return;refresh();const changed=()=>refresh();navigator.mediaDevices.addEventListener('devicechange',changed);return()=>navigator.mediaDevices.removeEventListener('devicechange',changed);},[refresh]);
 const start=useCallback(async()=>{
  if(working.current)return;working.current=true;setBusy(true);setError('');let previous;
  try{
   const state=current.current,s=await refresh();if(!s||s.disabled)throw Error('Automatic microphone switching is unavailable.');if(!s.virtualInput||!s.virtualOutput)throw Error('Install VB-CABLE to use the virtual microphone.');
   const available=await navigator.mediaDevices.enumerateDevices();
   const mic=chooseMixMicrophone(available,state.data.settings.micDevice,s.defaults?.find(d=>d.Role==='console')?.Name),output=available.find(d=>d.kind==='audiooutput'&&!['default','communications'].includes(d.deviceId)&&matches(d,s.virtualOutput));
   if(!output)throw Error('VB-CABLE output is unavailable. Refresh devices or restart Windows.');
   previous={...state.data.settings};const settings={...previous,outputDevice:output.deviceId,micDevice:mic?.deviceId||'default',micEnabled:!!mic};
   await state.engine.enableMic(false);await state.engine.applySettings(settings);await state.engine.init();if(mic)await state.engine.enableMic(true,mic.deviceId);
   await state.updateSettings(settings);setStatus(await api.invoke('audio-session-start'));
  }catch(e){setError(e.message.replace(/^Error invoking remote method '[^']+': Error: /,''));if(previous){await current.current.engine.enableMic(false).catch(()=>{});await current.current.engine.applySettings({...previous,micEnabled:false}).catch(()=>{});await current.current.updateSettings({...previous,micEnabled:false});}current.current.onNeedsSetup();}
  finally{working.current=false;setBusy(false);}
 },[refresh]);
 const stop=useCallback(async()=>{if(working.current)return;working.current=true;setBusy(true);setError('');try{await api.invoke('audio-session-stop');await current.current.engine.enableMic(false);await current.current.updateSettings({micEnabled:false});await refresh();}catch(e){setError(e.message);}finally{working.current=false;setBusy(false);}},[refresh]);
 const setEnabled=async enabled=>{if(!enabled){await stop();await current.current.updateSettings({manageWindowsMic:false});}else{await current.current.updateSettings({manageWindowsMic:true});await start();}};
 const install=async()=>{setInstalling(true);setError('');try{const result=await api.invoke('audio-driver-install');setReboot(!!result.rebootRequired);await refresh();}catch(e){setError(e.message.replace(/^Error invoking remote method '[^']+': Error: /,''));}finally{setInstalling(false);}};
 useEffect(()=>{if(!data||!status||status.disabled||!devices.length||attempted.current||!data.settings.manageWindowsMic)return;attempted.current=true;if(!status.virtualInput||!status.virtualOutput)onNeedsSetup();else start();},[!!data,status?.virtualInput?.Id,status?.disabled,devices.length,data?.settings.manageWindowsMic,start]);
 return {status,error,busy,installing,reboot,start,stop,refresh,install,setEnabled};
}
export default function VirtualMic({routing,settings,Switch,sectionRef}){
 const {status,error,busy,installing,reboot}=routing;
 const [expanded,setExpanded]=useState(false);
 const detailsId=useId();
 const installed=Boolean(status?.virtualInput&&status?.virtualOutput);
 const connected=Boolean(status?.active);
 const needsDriver=Boolean(status&&!connected&&!status.disabled&&!installed);
 const manualConnection=connected&&!settings.manageWindowsMic;
 const locked=busy||installing||!status||status.disabled;
 const stateLabel=busy?'Switching…':status?.active?'Connected':installed?'Ready':status?.disabled?'Unavailable':needsDriver?'Setup required':error?'Unavailable':'Checking…';

 return <section ref={sectionRef} tabIndex={-1} className="virtual-mic-setup" aria-label={t('Virtual microphone setup')}>
  <div className="vm-row">
   <div className="vm-identity">
    <Mic size={17} aria-hidden="true"/>
    <div className="vm-name">
     <strong>{t('Virtual microphone')}</strong>
     <span className="vm-status" data-state={status?.active?'active':needsDriver?'setup':'idle'} role="status">{t(stateLabel)}</span>
    </div>
   </div>
   <div className="vm-controls">
    {needsDriver&&<button className="vm-install" disabled={locked} onClick={routing.install}>
     <Download size={14} aria-hidden="true"/>{t(installing?'Installing…':'Install VB-CABLE')}
    </button>}
    <Switch label="Switch Windows mic automatically" text="Auto-switch" checked={settings.manageWindowsMic} disabled={locked} onChange={routing.setEnabled}/>
    <button type="button" className="vm-details-toggle" aria-expanded={expanded} aria-controls={detailsId} aria-label={t('Virtual microphone details')} title={t('Virtual microphone details')} onClick={()=>setExpanded(value=>!value)}>
     <ChevronDown size={16} aria-hidden="true"/>
    </button>
   </div>
  </div>
  {reboot&&!connected&&<p className="vm-notice" role="status">{t('Finish the installer, restart Windows, then reopen the app.')}</p>}
  {error&&<p className="vm-notice vm-error" role="alert">{t(error)}</p>}
  {status?.active&&!status.physicalInputs?.length&&<p className="vm-notice">{t('No physical microphone connected. Soundboard only.')}</p>}
  <div className="vm-details" id={detailsId} hidden={!expanded}>
   {status?.restoreTo&&<dl className="vm-restore"><dt>{t('After exit')}</dt><dd>{status.restoreTo}</dd></dl>}
   {expanded&&connected&&<VirtualMicTest key={status.virtualInput?.Id} endpointName={status.virtualInput?.Name} settings={settings} disabled={locked}/>}
   <div className="vm-actions">
    {installed&&!connected&&<button disabled={locked} onClick={routing.start}>{t('Use virtual mic')}</button>}
    {manualConnection&&<button disabled={locked} onClick={routing.stop}>{t('Disconnect virtual mic')}</button>}
    <button disabled={busy||installing} onClick={routing.refresh}><RefreshCw size={14} aria-hidden="true"/>{t('Refresh devices')}</button>
    {needsDriver&&<button onClick={()=>api.invoke('audio-setup-guide')}><ExternalLink size={14} aria-hidden="true"/>{t('Installation guide')}</button>}
   </div>
   {!connected&&<div className="vm-help">
    <p>{t('Open app → virtual mic. Quit → previous Windows mic.')}</p>
    <p>{t('In Discord/game, choose System default as the microphone.')}</p>
    {needsDriver&&<p>{t('Installation requires Windows administrator approval and a restart. Press Install Driver in the VB-CABLE installer.')}</p>}
    {settings.closeToTray&&<p>{t('Closing to tray keeps the virtual microphone active.')}</p>}
   </div>}
  </div>
 </section>;
}
