import {t} from './i18n';
import React from 'react';
import {LayoutGrid,Keyboard,Square,SlidersHorizontal,Mic} from './Icons';
import {version} from '../package.json';
export default function AboutPanel({onAudio,onShortcuts}){
 return <div className="about-panel">
  <img className="about-logo" src={import.meta.env.BASE_URL+'brand/logo.png'} alt={t("Soundboard Studio")}/>
  <div className="about-meta"><span>{t("v")}{version}</span><span>{t("By ")}<strong>{t("Qu4nh")}</strong></span></div>
  <p className="about-description">{t('A desktop soundboard for playing, recording and editing your sounds.')}</p>
  <div className="about-guide"><div><LayoutGrid size={20}/><strong>{t("Play")}</strong><span>{t("Click a pad")}</span></div><div><SlidersHorizontal size={20}/><strong>{t("Edit")}</strong><span>{t("Right-click a pad")}</span></div><div><Square size={20}/><strong>{t("Stop all")}</strong><span>{t("Use the dock")}</span></div></div>
  <div className="about-actions"><button className="secondary" onClick={onAudio}><Mic size={17}/>{t("Audio settings")}</button><button className="secondary" onClick={onShortcuts}><Keyboard size={17}/>{t("Shortcuts")}</button></div>
 </div>;
}
