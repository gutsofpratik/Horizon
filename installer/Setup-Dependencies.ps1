param([switch]$Documents,[switch]$Inference,[switch]$Docker,[switch]$Worker,[switch]$BrowserRuntime,[switch]$Check)
$ErrorActionPreference='Stop'
$taskRoot=$PSScriptRoot
if(!(Test-Path -LiteralPath (Join-Path $taskRoot 'backend'))){$taskRoot=Split-Path -Parent $taskRoot}
$taskBackend=Join-Path $taskRoot 'backend'
$taskNode=Join-Path $taskBackend 'node\node.exe'
$taskPython=Join-Path $taskBackend 'python\python.exe'
$taskData=Join-Path $env:LOCALAPPDATA 'OpenClaude\data'
if($Check){
 [pscustomobject]@{Node=(Test-Path -LiteralPath $taskNode);Python=(Test-Path -LiteralPath $taskPython);DataDirectory=$taskData}
 exit 0
}
try{
 if($BrowserRuntime){
  $taskWebViewKeys=@('HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}','HKCU:\Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}')
  $taskWebViewReady=$false
  foreach($taskKey in $taskWebViewKeys){$taskVersion=(Get-ItemProperty -LiteralPath $taskKey -Name pv -ErrorAction SilentlyContinue).pv;if($taskVersion -and $taskVersion -ne '0.0.0.0'){$taskWebViewReady=$true}}
  if(!$taskWebViewReady){
   $taskBootstrap=Join-Path ([IO.Path]::GetTempPath()) ('Horizon-WebView2-'+[guid]::NewGuid().ToString()+'.exe')
   Invoke-WebRequest -Uri 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile $taskBootstrap -UseBasicParsing
   $taskSignature=Get-AuthenticodeSignature -LiteralPath $taskBootstrap
   if($taskSignature.Status -ne 'Valid' -or $taskSignature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') {throw 'WebView2 bootstrapper signature verification failed.'}
   $taskInstall=Start-Process -FilePath $taskBootstrap -ArgumentList '/silent','/install' -WindowStyle Hidden -Wait -PassThru
   if($taskInstall.ExitCode -ne 0){throw 'WebView2 installation failed. Install the runtime from https://developer.microsoft.com/en-us/microsoft-edge/webview2/ and retry.'}
   Remove-Item -LiteralPath $taskBootstrap
  }
 }
 if($Documents -or $Inference){
  if(!(Test-Path -LiteralPath $taskNode) -or !(Test-Path -LiteralPath $taskPython)){throw 'Bundled runtime files are missing. Extract the whole release ZIP or repair the installation.'}
  $env:OPENCLAUDE_DATA_DIR=$taskData
  $env:OPENCLAUDE_BUNDLED_PYTHON=Join-Path $taskBackend 'python'
  Push-Location -LiteralPath $taskBackend
  try{
   if($Documents){& $taskNode (Join-Path $taskBackend 'setup-runtime.mjs') --documents-only;if($LASTEXITCODE -ne 0){throw 'Local OfficeCLI/PDF setup failed. Retry document setup in Settings.'}}
   if($Inference){& $taskNode (Join-Path $taskBackend 'setup-runtime.mjs') --inference-only;if($LASTEXITCODE -ne 0){throw 'Inference runtime installation failed. You can retry from Settings > Runtime packs.'}}
  }finally{Pop-Location}
 }
 if($Docker -and !(Get-Command docker -ErrorAction SilentlyContinue)){
  Add-Type -AssemblyName System.Windows.Forms
  $taskChoice=[System.Windows.Forms.MessageBox]::Show('Install Docker Desktop from its official Windows package? Docker has its own subscription/license requirements. Windows may request administrator approval, WSL installation or a reboot. Choose Yes to accept the Docker license and start setup.','Horizon optional Docker setup','YesNo','Question')
  if($taskChoice -ne 'Yes'){Write-Host 'Docker setup skipped.';exit 0}
  $taskWinget=Get-Command winget -ErrorAction SilentlyContinue
  if(!$taskWinget){throw 'Windows App Installer (winget) is unavailable. Install Docker Desktop from https://docs.docker.com/desktop/setup/install/windows-install/ and rerun setup.'}
  & $taskWinget.Source install --id Docker.DockerDesktop --exact --source winget --accept-package-agreements --accept-source-agreements --disable-interactivity
  if($LASTEXITCODE -notin @(0,3010)){throw 'Docker installation did not finish. Check Windows administrator/WSL requirements, reboot if requested, and rerun setup.'}
 }
 if($Docker -or $Worker){
  $taskDocker=Get-Command docker -ErrorAction SilentlyContinue
  if(!$taskDocker){$taskDockerPath=Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin\docker.exe';if(Test-Path -LiteralPath $taskDockerPath){$taskDocker=Get-Item -LiteralPath $taskDockerPath}}
  if(!$taskDocker){throw 'Docker CLI is not available yet. Restart Windows if setup requested it, then rerun Horizon dependency setup.'}
  $taskDockerExe=if($taskDocker.Source){$taskDocker.Source}else{$taskDocker.FullName}
  & $taskDockerExe info --format '{{.ServerVersion}}' 2>$null
  if($LASTEXITCODE -ne 0){
   $taskDesktop=Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
   if(Test-Path -LiteralPath $taskDesktop){Start-Process -FilePath $taskDesktop -WindowStyle Hidden}
   $taskReady=$false
   for($taskAttempt=0;$taskAttempt -lt 24;$taskAttempt++){Start-Sleep -Seconds 5;& $taskDockerExe info --format '{{.ServerVersion}}' 2>$null;if($LASTEXITCODE -eq 0){$taskReady=$true;break}}
   if(!$taskReady){throw 'Docker engine is not ready. Finish Docker/WSL setup and rerun this helper; the chat, browser and native terminal do not require Docker.'}
  }
  & $taskDockerExe compose -f (Join-Path $taskBackend 'runtime\compose.yml') up -d --build
  if($LASTEXITCODE -ne 0){throw 'Docker is installed but the optional document/search containers failed to build. Retry from Settings > Runtime packs.'}
 }
 Write-Host 'Horizon dependency setup completed.'
}catch{
 Add-Type -AssemblyName System.Windows.Forms
 [System.Windows.Forms.MessageBox]::Show($_.Exception.Message,'Horizon setup needs attention','OK','Warning')|Out-Null
 exit 1
}
