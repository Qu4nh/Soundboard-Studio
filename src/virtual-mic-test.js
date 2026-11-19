export function findVirtualMicInput(devices,endpointName){
  if(!endpointName)return null;
  return devices.find(device=>device.kind==='audioinput'&&device.deviceId&&
    !['default','communications'].includes(device.deviceId)&&
    (device.label===endpointName||device.label?.startsWith(endpointName+' (')))||null;
}

export function inputLevel(frame){
  let sum=0,count=0;
  for(const channel of frame||[])for(const value of channel){sum+=value*value;count++;}
  const rms=count?Math.sqrt(sum/count):0;
  return Math.max(-60,Math.min(0,20*Math.log10(rms||1e-6)));
}
