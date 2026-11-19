const {spawn}=require('node:child_process');const path=require('node:path');const electron=require('electron');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
spawn(electron,[path.resolve('.'),...process.argv.slice(2).filter(x=>x==='--soundlab')],{detached:true,stdio:'ignore',env,windowsHide:true}).unref();
