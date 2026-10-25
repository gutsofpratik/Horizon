param([Parameter(Mandatory=$true)][string]$ConfigPath)
$ErrorActionPreference = 'Stop'
$log = Join-Path (Split-Path -Parent $ConfigPath) 'last-install.log'
try {
 $config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
 $parent = Get-Process -Id $config.pid -ErrorAction SilentlyContinue
 if ($parent -and -not $parent.WaitForExit(120000)) { throw 'Horizon did not exit. Installation was not started.' }
 $installer = Get-Item -LiteralPath $config.installer
 if ($installer.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Installer must be a regular file' }
 if ((Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256).Hash -ne $config.sha256) { throw 'Installer checksum changed' }
 $target = Get-Item -LiteralPath $config.directory
 if (-not (Test-Path -LiteralPath (Join-Path $target.FullName 'Horizon.exe'))) { throw 'Horizon installation was not found' }
 $result = Start-Process -FilePath $installer.FullName -ArgumentList "/S /UPDATE /D=$($target.FullName)" -WindowStyle Hidden -Wait -PassThru
 if ($result.ExitCode -ne 0) { throw "Installer exited with code $($result.ExitCode). Run the installer to repair the application." }
 'Update installed successfully. Your profiles and chats were preserved.' | Set-Content -LiteralPath $log
} catch {
 $_.Exception.Message | Set-Content -LiteralPath $log
} finally {
 Remove-Item -LiteralPath $ConfigPath -Force -ErrorAction SilentlyContinue
}
