import React,{useEffect,useId,useRef,useState} from 'react';
import {Keyboard,X,Trash2,Loader2} from './Icons';
import {t} from './i18n';
const tokens=shortcut=>(shortcut||'').split('+').filter(Boolean).map(key=>key==='Control'?'Ctrl':key==='Super'?'Win':key);
export default function ShortcutDialog({name,shortcut,onAssign,onClear,onClose}){
 const [pressed,setPressed]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),root=useRef(null),capture=useRef(null),handlers=useRef({onAssign,onClose});handlers.current={onAssign,onClose};const id=useId();
 useEffect(()=>{const previous=document.activeElement;capture.current?.focus();return()=>{queueMicrotask(()=>{if(previous?.isConnected)previous.focus();});};},[]);
 useEffect(()=>{const modifiers=e=>[e.ctrlKey?'Control':null,e.altKey?'Alt':null,e.shiftKey?'Shift':null,e.metaKey?'Super':null].filter(Boolean);
  const down=async e=>{
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(!busy)handlers.current.onClose();return;}
   if(e.key==='Tab'&&!e.ctrlKey&&!e.altKey&&!e.metaKey){const items=[capture.current,...root.current.querySelectorAll('button:not(:disabled)')],at=items.indexOf(document.activeElement);e.preventDefault();e.stopPropagation();items[(at+(e.shiftKey?-1:1)+items.length)%items.length]?.focus();return;}
   if(e.target.closest?.('button')&&['Enter',' '].includes(e.key)&&!e.ctrlKey&&!e.altKey&&!e.metaKey)return;
   e.preventDefault();e.stopPropagation();if(busy||e.repeat)return;const mods=modifiers(e);if(['Control','Alt','Shift','Meta'].includes(e.key)){setPressed(mods);return;}
   const key=e.code.startsWith('Numpad')?e.code:e.key===' '?'Space':e.key.length===1?e.key.toUpperCase():e.key;const keys=[...mods,key];setPressed(keys);setError('');setBusy(true);try{await handlers.current.onAssign(keys.join('+'));}catch(error){setError(t(error.message));setBusy(false);}
  };
  const up=e=>{if(['Control','Alt','Shift','Meta'].includes(e.key)&&!busy)setPressed(modifiers(e));};
  window.addEventListener('keydown',down,true);window.addEventListener('keyup',up,true);return()=>{window.removeEventListener('keydown',down,true);window.removeEventListener('keyup',up,true);};
 },[busy]);
 const clear=async()=>{setBusy(true);setError('');try{await onClear();}catch(error){setError(t(error.message));setBusy(false);}};
 return <div className="modal-backdrop hotkey-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}><section ref={root} className="hotkey-modal shortcut-dialog" role="dialog" aria-modal="true" aria-labelledby={id}>
  <header><span className="shortcut-icon"><Keyboard size={23}/></span><div><h2 id={id}>{t('Shortcut')}</h2><p title={name}>{name}</p></div><button aria-label={t('Close')} title={t('Close')} disabled={busy} onClick={onClose}><X size={20}/></button></header>
  <div className="shortcut-current"><span>{t('Current')}</span><div>{shortcut?tokens(shortcut).map((key,i)=><React.Fragment key={i}>{i>0&&<b>+</b>}<kbd>{key}</kbd></React.Fragment>):<span>{t('Not assigned')}</span>}</div></div>
  <div ref={capture} className={'shortcut-listener '+(busy?'saving':'')} tabIndex={0} role="group" aria-label={t('Capture shortcut')} aria-live="polite">{pressed.length?<div className="shortcut-keys">{tokens(pressed.join('+')).map((key,i)=><React.Fragment key={i}>{i>0&&<b>+</b>}<kbd>{key}</kbd></React.Fragment>)}</div>:<><Keyboard size={26}/><span>{t('Press keys')}</span></>}{busy&&<Loader2 className="spin" size={16}/>}</div>
  <div className="shortcut-feedback">{error?<span role="alert">{error}</span>:<span><kbd>Esc</kbd>{t(' to cancel')}</span>}</div>
  <footer><button className="shortcut-remove" disabled={!shortcut||busy} onClick={clear}><Trash2 size={16}/>{t('Remove')}</button><button className="secondary" disabled={busy} onClick={onClose}>{t('Cancel')}</button></footer>
 </section></div>;
}
