const {test}=require('node:test'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url'),path=require('node:path');
const load=()=>import(pathToFileURL(path.resolve('src/mix-input.js')).href);
test('automatic microphone mixing never captures the current virtual default',async()=>{const {chooseMixMicrophone}=await load();const devices=[{kind:'audioinput',deviceId:'default',label:'Default - CABLE Output'},{kind:'audioinput',deviceId:'cable',label:'CABLE Output'},{kind:'audioinput',deviceId:'usb',label:'Microphone (USB)'}];assert.equal(chooseMixMicrophone(devices,'default').deviceId,'usb');assert.throws(()=>chooseMixMicrophone(devices,'cable'),/audio feedback/);assert.equal(chooseMixMicrophone(devices.filter(d=>d.deviceId!=='usb')),null);});
test('a saved disconnected microphone requires selection rather than silently opening a different mic',async()=>{const {chooseMixMicrophone}=await load();assert.throws(()=>chooseMixMicrophone([{kind:'audioinput',deviceId:'other',label:'Other physical microphone'}],'saved-usb'),/disconnected/);});

test('Camo can be selected explicitly without becoming the automatic microphone',async()=>{
 const {chooseMixMicrophone,mixMicrophoneInputs}=await load();
 const camo={kind:'audioinput',deviceId:'camo',label:'Microphone (Camo)'};
 const usb={kind:'audioinput',deviceId:'usb',label:'Microphone (DM30)'};
 const cable={kind:'audioinput',deviceId:'cable',label:'CABLE Output (VB-Audio Virtual Cable)'};
 const devices=[camo,cable,usb];
 assert.deepEqual(mixMicrophoneInputs(devices),[camo,usb]);
 assert.equal(chooseMixMicrophone(devices,'camo'),camo);
 assert.equal(chooseMixMicrophone(devices,'default'),usb);
 assert.throws(()=>chooseMixMicrophone(devices,'cable'),/audio feedback/);
});
