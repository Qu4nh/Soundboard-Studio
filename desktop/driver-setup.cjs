const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const DRIVER_URL='https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack46.zip';
async function prepareDriver(dir,{fetcher=fetch}={}){
 const folder=path.join(dir,'driver-setup',randomUUID());await fs.mkdir(folder,{recursive:true});const archive=path.join(folder,'VB-CABLE.zip');
 const response=await fetcher(DRIVER_URL,{redirect:'error',signal:AbortSignal.timeout(120000)});if(!response.ok)throw Error('Could not download VB-CABLE. Open the installation guide and retry.');
 const chunks=[];let size=0;for await(const part of response.body){size+=part.length;if(size>20*1024*1024)throw Error('VB-CABLE download exceeded the expected size.');chunks.push(part);}const bytes=Buffer.concat(chunks);if(bytes.length<4||bytes.readUInt16LE(0)!==0x4b50)throw Error('Invalid VB-CABLE download.');await fs.writeFile(archive,bytes);
 return {archive,destination:path.join(folder,'extracted')};
}
async function runDriver(files,{launch=false,helperDir=__dirname}={}){const args=['-NoProfile','-NonInteractive','-File',path.join(helperDir,'driver-setup.ps1'),'-Archive',files.archive,'-Destination',files.destination];if(launch)args.push('-Launch');const {stdout}=await promisify(execFile)(path.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),args,{windowsHide:true,timeout:launch?0:30000,maxBuffer:1024*1024});return JSON.parse(stdout.replace(/^\uFEFF/,''));}
module.exports={DRIVER_URL,prepareDriver,runDriver};
