const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
const keys=['micDevice','monitorDevice','outputDevice'];
function localAudioDirectory(env,userData){return env.SOUNDBOARD_DATA_DIR||path.join(env.LOCALAPPDATA||userData,'Soundboard Studio','audio');}
async function loadLocalDevices(dir,settings){let saved={};try{saved=JSON.parse(await fs.readFile(path.join(dir,'devices.json'),'utf8'));}catch{}return {...settings,...Object.fromEntries(keys.map(key=>[key,typeof saved[key]==='string'?saved[key]:'default']))};}
async function saveLocalDevices(dir,settings){await fs.mkdir(dir,{recursive:true});const file=path.join(dir,'devices.json'),temp=path.join(dir,'devices-'+randomUUID()+'.tmp');await fs.writeFile(temp,JSON.stringify(Object.fromEntries(keys.map(key=>[key,settings[key]||'default'])),null,2));await fs.rename(temp,file);}
module.exports={keys,localAudioDirectory,loadLocalDevices,saveLocalDevices};
