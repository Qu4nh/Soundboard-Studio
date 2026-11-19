const aliases=new Set(['default','communications']);
export const isVirtualOutput=device=>/cable|virtual|voicemeeter|vb-audio|voicemod|steam streaming|nvidia broadcast|wave link|blackhole|soundflower|sonar.*(?:stream|virtual)/i.test(device?.label||'');
export const physicalOutputs=devices=>devices.filter(d=>d.kind==='audiooutput'&&!aliases.has(d.deviceId)&&d.label&&!isVirtualOutput(d));
export function resolveOutput(devices,id='default'){
 const output=devices.find(d=>d.kind==='audiooutput'&&d.deviceId===id);if(!output||!aliases.has(id))return output;
 return devices.find(d=>d.kind==='audiooutput'&&!aliases.has(d.deviceId)&&((output.groupId&&d.groupId===output.groupId)||d.label===output.label.replace(/^(Default|Communications)\s*-\s*/i,'')))||output;
}
export function choosePreviewOutput(devices,preferred='default'){
 const physical=physicalOutputs(devices),requested=resolveOutput(devices,preferred);
 return physical.find(d=>d.deviceId===requested?.deviceId)||physical.find(d=>/headphones|headset|tai nghe/i.test(d.label))||physical[0]||null;
}
export async function routePreviewOutput(element,preferred='default',devices){
 if(!element.sinkId||aliases.has(element.sinkId))element.muted=true;
 try{const available=devices||await navigator.mediaDevices.enumerateDevices(),device=choosePreviewOutput(available,preferred);if(!device)throw Error('No physical listening device available. Connect speakers or headphones to preview.');if(element.sinkId!==device.deviceId){element.muted=true;await element.setSinkId(device.deviceId);}return device;}
 catch(error){element.muted=true;throw error;}
}
