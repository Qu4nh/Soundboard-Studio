import {t} from './i18n';
import React,{useEffect,useRef,useState} from 'react';
import {Play,Pencil,Keyboard,MoreHorizontal,Volume2,Trash2,Minus,ModeRestart,ModePause,ModeStop,ModeOverlap,ModeHold} from './Icons';
import {modeOptions} from './playback-contract';

const modes=[
 {id:'restart',label:'Restart',name:'Play & Restart',description:'Bấm để phát lại từ đầu.',icon:ModeRestart},
 {id:'pause',label:'Pause',name:'Play & Pause',description:'Bấm lần nữa để tạm dừng.',icon:ModePause},
 {id:'stop',label:'Stop',name:'Play & Stop',description:'Bấm lần nữa để dừng hẳn.',icon:ModeStop},
 {id:'overlap',label:'Overlap',name:'Play & Overlap',description:'Mỗi lần bấm phát thêm một lượt.',icon:ModeOverlap},
 {id:'hold',label:'Hold',name:'Push to Loop',description:'Giữ phím hoặc pad để phát. Thả để dừng.',icon:ModeHold}
];
export default function SoundInspector({sound,saved,onUpdate,onLive,onPreview,onSoundlab,onShortcut,onAdd,onArtwork,onRemove,onDelete,art}){
 const [volume,setVolume]=useState(sound?.volume??100);
 const [menuOpen,setMenuOpen]=useState(false),menu=useRef(null),menuButton=useRef(null);
 useEffect(()=>setVolume(sound?.volume??100),[sound?.id,sound?.volume]);
 useEffect(()=>setMenuOpen(false),[sound?.id]);
 useEffect(()=>{if(!menuOpen)return;menu.current?.querySelector('[role=menuitem]')?.focus();const outside=e=>{if(!menu.current?.contains(e.target))setMenuOpen(false);},key=e=>{if(e.key==='Escape'){e.preventDefault();setMenuOpen(false);menuButton.current?.focus();}};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key);};},[menuOpen]);
 if(!sound)return <div className="ux-empty"><Volume2 size={32}/><h2>{t("Chọn một âm thanh")}</h2><p>{t("Mở cài đặt trên sound pad để nghe thử, chọn cách phát hoặc chỉnh trong Soundlab.")}</p></div>;
 const commit=()=>onUpdate({volume});
 const changeVolume=n=>{const value=Math.max(0,Math.min(100,Number(n)||0));setVolume(value);onLive({volume:value});};
 const action=fn=>{setMenuOpen(false);fn();};
 return <section className="si-ux" aria-label={t("Sound settings")}><div className="si-scroll">
  <header className="si-summary"><button className="si-art" title={t("Change artwork")} aria-label={t("Change artwork")} disabled={!saved} onClick={onArtwork}>{art}</button><div><h2 title={t(sound.name)}>{sound.name}</h2><p>{t("by ")}{sound.author||t('Bạn')}</p><button className="si-preview" onClick={onPreview}><Play size={16}/>{t("Nghe thử")}</button></div>{saved&&<div className="si-menu" ref={menu}><button ref={menuButton} className="si-more" aria-label={t("Tùy chọn âm thanh")} title={t("Tùy chọn âm thanh")} aria-haspopup="menu" aria-expanded={menuOpen} onClick={()=>setMenuOpen(!menuOpen)}><MoreHorizontal size={20}/></button>{menuOpen&&<div className="si-menu-items" role="menu" aria-label={t("Tùy chọn âm thanh")} onKeyDown={e=>{if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const items=[...e.currentTarget.querySelectorAll('[role=menuitem]')],at=items.indexOf(document.activeElement);items[e.key==='Home'?0:e.key==='End'?items.length-1:(at+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();}}}><button role="menuitem" onClick={()=>action(onRemove)}><Minus size={16}/>{t("Gỡ khỏi soundboard này")}</button><button role="menuitem" className="danger" onClick={()=>action(onDelete)}><Trash2 size={16}/>{t("Xóa khỏi thư viện")}</button></div>}</div>}</header>
  {saved?<>
   <section className="si-section"><div className="si-section-title"><h3>{t("Âm lượng")}</h3><label className="si-volume-value"><input aria-label={t("Volume value")} type="number" min={0} max={100} value={volume} onChange={e=>changeVolume(e.target.value)} onBlur={commit} onKeyUp={commit}/><span>%</span></label></div><input className="ux-range" aria-label={t("Volume")} type="range" min={0} max={100} value={volume} style={{'--fill':volume+'%'}} onChange={e=>changeVolume(e.target.value)} onPointerUp={commit} onKeyUp={commit} onBlur={commit}/></section>
   <section className="si-section"><div className="si-section-title"><h3>{t("Chế độ phát")}</h3><span className="si-autosave">{t("Tự lưu")}</span></div><div className="si-modes">{modes.map(({id,label,name,description,icon:Icon})=><button key={id} className={'si-mode '+(sound.mode===id?'selected':'')} aria-label={t(name)} title={t(description)} aria-pressed={sound.mode===id} onClick={()=>onUpdate({mode:id})}><span className="si-mode-icon"><Icon size={22}/></span><span><strong>{t(label)}</strong><small>{t(description)}</small></span><i aria-hidden="true"/></button>)}</div></section>
   <section className="si-section"><h3>{t("Tùy chọn phát")}</h3><div className="si-options">{[['stopOthers','Dừng các âm khác','Chỉ giữ âm này khi bắt đầu phát.'],['muteOthers','Tạm tắt các âm khác','Các âm khác trở lại khi âm này kết thúc.'],['muteVoice','Tắt micro khi phát','Áp dụng cho micro đang trộn vào đầu ra.'],['loop','Phát lặp','Lặp lại cho đến khi bạn dừng.']].filter(([key])=>!modeOptions[sound.mode]?.[key]).map(([key,label,description])=><label key={key} className="ux-toggle-row" title={t(description)}><span><strong>{t(label)}</strong><small>{t(description)}</small></span><input type="checkbox" aria-label={t(label)} checked={!!sound[key]} onChange={e=>onUpdate({[key]:e.target.checked})}/><i/></label>)}</div>{sound.mode==='hold'&&<p className="si-mode-note">{t("Phát lặp tự động khi giữ phím.")}</p>}</section>
   <button className="si-shortcut" onClick={onShortcut}><Keyboard size={20}/><span>{t("Phím tắt")}</span><kbd>{sound.shortcut?sound.shortcut.replace('Control','Ctrl'):t('Gán phím')}</kbd></button>

  </>:<p className="si-add-hint">{t("Thêm âm này vào soundboard để chọn cách phát và chỉnh sửa.")}</p>}
 </div><footer className="si-footer">{saved?<button className="ux-primary" aria-label={t("Edit in Soundlab")} onClick={onSoundlab}><Pencil size={18}/><span>{t("Soundlab")}<small>{t("Cắt âm · pitch · speed · loudness")}</small></span></button>:<button className="ux-primary" onClick={onAdd}>{t("Thêm vào soundboard")}</button>}</footer></section>;
}
