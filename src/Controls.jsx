import {t} from './i18n';
import React from 'react';
import {Volume2} from './Icons';
// Slider with an editable value.
export function EffectSlider({label,value,min=0,max=100,step=1,onChange,onCommit,icon=true}){
 const clamp=n=>Math.max(min,Math.min(max,Number(n)||0));
 return <div className="ref-effect-slider"><div className="ref-effect-track"><div className="ref-effect-progress" style={{width:(value-min)/(max-min)*100+'%'}}/><div className="ref-effect-label">{icon&&<Volume2 size={16}/>}<span>{t(label)}</span></div><input aria-label={t(label)} type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(Number(e.target.value))} onPointerUp={onCommit} onKeyUp={onCommit} onBlur={onCommit}/></div><input className="ref-effect-number" aria-label={t(label+' value')} type="number" min={min} max={max} step={step} value={value} onChange={e=>onChange(clamp(e.target.value))} onBlur={onCommit} onKeyUp={onCommit}/></div>;
}
