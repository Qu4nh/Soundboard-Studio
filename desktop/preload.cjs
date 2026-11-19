const {contextBridge,ipcRenderer,webUtils}=require('electron');
const channels=['audio-session-status','audio-session-start','audio-session-stop','audio-driver-install','audio-setup-guide','soundlab-image','boards-reorder','board-cover','sound-render-save','get-data','board-create','board-update','board-delete','sound-update','sound-add','sound-remove','sound-delete','sound-play-url','community-query','community-sync','settings-update','import-audio','drop-audio','record-save','sound-image','board-export','board-import','open-data','window'];
contextBridge.exposeInMainWorld('soundboard',{
  invoke:(channel,...args)=>{if(!channels.includes(channel))throw Error('Unknown operation');return ipcRenderer.invoke(channel,...args);},
  filePath:file=>webUtils.getPathForFile(file),
  on:(channel,callback)=>{if(!['library-changed','sync-status','trigger','hotkey-status','window-visibility'].includes(channel))throw Error('Unknown event');const listener=(_e,data)=>callback(data);ipcRenderer.on(channel,listener);return()=>ipcRenderer.removeListener(channel,listener);}
});
