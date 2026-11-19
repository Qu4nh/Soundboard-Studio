param([ValidateSet('snapshot','activate','restore','watch','launch-watch')][string]$Action='snapshot',[string]$DeviceId,[string]$Journal,[int]$ParentId,[string]$ReadyFile)
# Capture-device session management; playback defaults are never changed.
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
namespace SoundboardAudio {
 [ComImport,Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class EnumeratorClass {}
 [ComImport,Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IEnumerator {
  [PreserveSig] int EnumAudioEndpoints(int flow,uint state,out ICollection devices);
  [PreserveSig] int GetDefaultAudioEndpoint(int flow,int role,out IDevice device);
 }
 [ComImport,Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface ICollection {
  [PreserveSig] int GetCount(out uint count);
  [PreserveSig] int Item(uint index,out IDevice device);
 }
 [ComImport,Guid("D666063F-1587-4E43-81F1-B948E807363F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IDevice {
  [PreserveSig] int Activate(ref Guid iid,uint context,IntPtr parameters,[MarshalAs(UnmanagedType.IUnknown)] out object result);
  [PreserveSig] int OpenPropertyStore(uint mode,out IProperties properties);
  [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
  [PreserveSig] int GetState(out uint state);
 }
 [StructLayout(LayoutKind.Sequential)] struct PropertyKey { public Guid id; public uint pid; }
 [StructLayout(LayoutKind.Explicit,Size=24)] struct Variant { [FieldOffset(0)] public ushort type; [FieldOffset(8)] public IntPtr value; }
 [ComImport,Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IProperties {
  [PreserveSig] int GetCount(out uint count);
  [PreserveSig] int GetAt(uint index,out PropertyKey key);
  [PreserveSig] int GetValue(ref PropertyKey key,out Variant value);
 }
 [ComImport,Guid("870AF99C-171D-4F9E-AF0D-E63DF40C2BC9")] class PolicyClass {}
 [ComImport,Guid("F8679F50-850A-41CF-9C72-430F290290C8"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IPolicy {
 [PreserveSig] int Slot0();[PreserveSig] int Slot1();[PreserveSig] int Slot2();[PreserveSig] int Slot3();[PreserveSig] int Slot4();[PreserveSig] int Slot5();[PreserveSig] int Slot6();[PreserveSig] int Slot7();[PreserveSig] int Slot8();[PreserveSig] int Slot9();
 [PreserveSig] int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string id,int role);
 }
 public class Endpoint { public string Flow; public string Role; public string Id; public string Name; public uint State; }
 public static class Snapshot {
  [DllImport("ole32.dll")] static extern int PropVariantClear(ref Variant value);
  static Endpoint Describe(IDevice device,int flow,string role) {
   string id;uint state;Marshal.ThrowExceptionForHR(device.GetId(out id));Marshal.ThrowExceptionForHR(device.GetState(out state));
   IProperties properties;Marshal.ThrowExceptionForHR(device.OpenPropertyStore(0,out properties));
   var key=new PropertyKey{id=new Guid("A45C254E-DF1C-4EFD-8020-67D146A850E0"),pid=14};Variant value;
   Marshal.ThrowExceptionForHR(properties.GetValue(ref key,out value));string name=value.type==31?Marshal.PtrToStringUni(value.value):"";
   PropVariantClear(ref value);Marshal.FinalReleaseComObject(properties);Marshal.FinalReleaseComObject(device);
   return new Endpoint{Flow=flow==0?"output":"input",Role=role,Id=id,Name=name,State=state};
  }
  public static void SetCapture(string id,int role) {
   if(role<0||role>2)throw new ArgumentException("Invalid role");
   bool available=false;foreach(var d in Read())if(d.Flow=="input"&&d.Role=="available"&&d.Id==id)available=true;
   if(!available)throw new InvalidOperationException("Microphone disconnected");
   var policy=(IPolicy)new PolicyClass();try{Marshal.ThrowExceptionForHR(policy.SetDefaultEndpoint(id,role));}finally{Marshal.FinalReleaseComObject(policy);}
  }
  public static Endpoint[] Read() {
   var enumerator=(IEnumerator)new EnumeratorClass();var list=new List<Endpoint>();
   for(int flow=0;flow<2;flow++){
    ICollection devices;Marshal.ThrowExceptionForHR(enumerator.EnumAudioEndpoints(flow,1,out devices));uint count;Marshal.ThrowExceptionForHR(devices.GetCount(out count));
    for(uint i=0;i<count;i++){IDevice device;Marshal.ThrowExceptionForHR(devices.Item(i,out device));list.Add(Describe(device,flow,"available"));}Marshal.FinalReleaseComObject(devices);
    string[] roles={"console","multimedia","communications"};for(int role=0;role<3;role++){IDevice device;if(enumerator.GetDefaultAudioEndpoint(flow,role,out device)>=0)list.Add(Describe(device,flow,roles[role]));}
   }
   Marshal.FinalReleaseComObject(enumerator);return list.ToArray();
  }
 }
}
'@
function Restore-Session {
 if(!$Journal -or !(Test-Path -LiteralPath $Journal)){return @{restored=$true}}
 $session=Get-Content -LiteralPath $Journal -Raw|ConvertFrom-Json
 if(!$session.pending){return @{restored=$true}}
 $issues=@();$roles=@('console','multimedia','communications')
 foreach($prior in $session.previous){
  $now=@([SoundboardAudio.Snapshot]::Read())|Where-Object {$_.Flow -eq 'input' -and $_.Role -eq $prior.Role}
  if($now.Id -ne $session.targetId){continue} # Respect a subsequent manual selection.
  try{[SoundboardAudio.Snapshot]::SetCapture($prior.Id,[Array]::IndexOf($roles,[string]$prior.Role))}catch{$issues+=($_.Exception.Message)}
 }
 $session.pending=($issues.Count -gt 0)
 $session|Add-Member -NotePropertyName restoreErrors -NotePropertyValue @($issues) -Force
 [IO.File]::WriteAllText($Journal,($session|ConvertTo-Json -Depth 8))
 return @{restored=(!$session.pending);errors=@($issues)}
}
switch($Action){
 'snapshot' { @{Endpoints=@([SoundboardAudio.Snapshot]::Read())}|ConvertTo-Json -Depth 5 }
 'activate' {
  $target=@([SoundboardAudio.Snapshot]::Read())|Where-Object {$_.Flow -eq 'input' -and $_.Role -eq 'available' -and $_.Id -eq $DeviceId -and $_.Name -match '^CABLE Output.*VB-Audio'}
  if(!$target){throw 'VB-CABLE microphone unavailable'}
  foreach($role in 0..2){[SoundboardAudio.Snapshot]::SetCapture($DeviceId,$role)}
  @{activated=$true}|ConvertTo-Json
 }
 'restore' { Restore-Session|ConvertTo-Json -Depth 5 }
 'launch-watch' {
  Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Management/Microsoft.PowerShell.Management.psd1') -Force
  $arguments=@('-NoProfile','-NonInteractive','-File',('"'+$PSCommandPath+'"'),'-Action','watch','-Journal',('"'+$Journal+'"'),'-ParentId',[string]$ParentId,'-ReadyFile',('"'+$ReadyFile+'"'))
  $watcher=Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList $arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput ($ReadyFile+'.out') -RedirectStandardError ($ReadyFile+'.err')
  @{pid=$watcher.Id}|ConvertTo-Json
 }
 'watch' {
  try{$parent=[Diagnostics.Process]::GetProcessById($ParentId)}catch{Restore-Session|Out-Null;[Console]::Error.WriteLine($_.Exception.Message);exit 1}
  [IO.File]::WriteAllText($ReadyFile,(@{pid=$PID;parentId=$ParentId;ready=$true}|ConvertTo-Json))
  try{$parent.WaitForExit()}finally{try{Restore-Session|Out-Null}catch{[IO.File]::WriteAllText(($ReadyFile+'.failure'),$_.Exception.Message)}}
 }
}

