import {useSyncExternalStore} from 'react';
import catalog from './locales.json';
let language='en';const listeners=new Set(),lookup=new Map();
for(const [en,vi]of Object.entries(catalog)){lookup.set(en,{en,vi});lookup.set(vi,{en,vi});}
export const getLanguage=()=>language;
export function setLanguage(value){const next=value==='vi'?'vi':'en';document.documentElement.lang=next;if(language===next)return;language=next;for(const listener of listeners)listener();}
export function useLocale(){return useSyncExternalStore(listener=>{listeners.add(listener);return()=>listeners.delete(listener);},getLanguage,getLanguage);}
export const dateLocale=()=>language==='vi'?'vi-VN':'en-US';
export function t(value){
 if(typeof value!=='string')return value;
 const normalized=value.replace(/\s+/g,' ').trim(),entry=lookup.get(normalized);
 if(entry){const left=/^\s/.test(value)?' ':'',right=/\s$/.test(value)?' ':'';return left+entry[language]+right;}
 const patterns=[
  [/^Tự cập nhật · (\d+) phút$/,n=>`Auto update · ${n} min`,n=>`Tự cập nhật · ${n} phút`],
  [/^Auto update · (\d+) min$/,n=>`Auto update · ${n} min`,n=>`Tự cập nhật · ${n} phút`],
  [/^(\d+) PLAYING$/,n=>`${n} PLAYING`,n=>`${n} ĐANG PHÁT`],
  [/^(\d+) âm đang phát$/,n=>`${n} sounds playing`,n=>`${n} âm đang phát`],
  [/^Cập nhật lúc (.+)$/,s=>`Updated ${s}`,s=>`Cập nhật lúc ${s}`]
 ];
 for(const [pattern,en,vi]of patterns){const match=normalized.match(pattern);if(match)return(language==='vi'?vi:en)(match[1]);}
 const prefixes=[['Audio device: ','Thiết bị âm thanh: '],['Cannot access device: ','Không truy cập được thiết bị: '],['Added and saved offline: ','Đã thêm và lưu offline: '],['Recording failed: ','Ghi âm thất bại: '],['Cannot enable microphone: ','Không bật được micro: '],['Stop preview ','Dừng nghe thử '],['Preview ','Nghe thử '],['Edit ','Chỉnh '],['Shortcut ','Phím tắt '],['Added ','Đã thêm '],['Add ','Thêm '],['Stop ','Dừng '],['Open board ','Mở board '],['Playback progress ','Tiến độ phát '],['Set ','Đặt ']];
 for(const [en,vi]of prefixes){if(value.startsWith(vi))return language==='en'?en+value.slice(vi.length):value;if(value.startsWith(en))return language==='vi'?vi+value.slice(en.length):value;}
 return value;
}
