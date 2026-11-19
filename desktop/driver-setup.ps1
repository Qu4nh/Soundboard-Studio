param([Parameter(Mandatory=$true)][string]$Archive,[Parameter(Mandatory=$true)][string]$Destination,[switch]$Launch)
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1') -Force
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root=[IO.Path]::GetFullPath($Destination)+[IO.Path]::DirectorySeparatorChar
$zip=[IO.Compression.ZipFile]::OpenRead($Archive)
try{foreach($entry in $zip.Entries){if(![IO.Path]::GetFullPath((Join-Path $root $entry.FullName)).StartsWith($root,[StringComparison]::OrdinalIgnoreCase)){throw 'Invalid installer archive path'}}}finally{$zip.Dispose()}
if(!(Test-Path -LiteralPath $root)){[IO.Compression.ZipFile]::ExtractToDirectory($Archive,$root)}
$name=if([Environment]::Is64BitOperatingSystem){'VBCABLE_Setup_x64.exe'}else{'VBCABLE_Setup.exe'}
$installer=Get-ChildItem -LiteralPath $root -Recurse -File -Filter $name|Select-Object -First 1
if(!$installer){throw 'VB-CABLE setup program not found'}
$signature=Get-AuthenticodeSignature -LiteralPath $installer.FullName
if($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'VB-Audio|Vincent Burel|BUREL VINCENT'){throw 'VB-CABLE publisher signature could not be verified'}
if($Launch){$process=Start-Process -FilePath $installer.FullName -WorkingDirectory $installer.DirectoryName -Verb RunAs -PassThru -WindowStyle Normal;$process.WaitForExit();@{opened=$true;exitCode=$process.ExitCode;rebootRequired=$true}|ConvertTo-Json}
else{@{verified=$true;publisher=$signature.SignerCertificate.Subject;installer=$installer.FullName}|ConvertTo-Json}
