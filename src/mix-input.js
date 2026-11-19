import {isVirtualOutput} from './preview-routing.js';
const aliases=['default','communications'];

export function mixMicrophoneInputs(devices){
 return devices.filter(d=>d.kind==='audioinput'&&!aliases.includes(d.deviceId)&&d.label&&!isVirtualOutput(d));
}

export function chooseMixMicrophone(devices,preferred='default',priorName){
 const allowed=mixMicrophoneInputs(devices);
 if(preferred&&!aliases.includes(preferred)){
  const requested=devices.find(d=>d.kind==='audioinput'&&d.deviceId===preferred);
  if(!requested)throw Error('Selected microphone is disconnected. Choose another input.');
  if(!allowed.includes(requested))throw Error('Choose a physical microphone to avoid audio feedback.');
  return requested;
 }
 const physical=allowed.filter(d=>!/camo/i.test(d.label));
 return physical.find(d=>d.label===priorName||d.label.startsWith(priorName+' ('))||physical[0]||null;
}
