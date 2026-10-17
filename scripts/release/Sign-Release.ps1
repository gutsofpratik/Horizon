param([string]$Path, [switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$thumbprint = $env:OPENCLAUDE_SIGN_CERT_SHA1
$dlib = $env:OPENCLAUDE_SIGN_DLIB
$metadata = $env:OPENCLAUDE_SIGN_METADATA
$tool = $env:OPENCLAUDE_SIGNTOOL
if (-not $tool) {
 $kitRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
 $tool = Get-ChildItem -LiteralPath $kitRoot -Directory -ErrorAction SilentlyContinue |
  Where-Object Name -Match '^10\.\d+\.\d+\.\d+$' |
  Sort-Object { [version]$_.Name } -Descending |
  ForEach-Object { Join-Path $_.FullName 'x64\signtool.exe' } |
  Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}
if (-not $tool -or -not (Test-Path -LiteralPath $tool)) { throw 'Windows SDK x64 SignTool is required; set OPENCLAUDE_SIGNTOOL if needed.' }
if ($thumbprint -and ($dlib -or $metadata)) { throw 'Choose one signing identity.' }
$signArgs = @('sign','/fd','SHA256','/tr','http://timestamp.acs.microsoft.com','/td','SHA256')
if ($thumbprint) {
 if ($thumbprint -notmatch '^[a-fA-F0-9]{40}$') { throw 'Invalid certificate thumbprint.' }
 $cert = Get-Item -LiteralPath "Cert:\CurrentUser\My\$thumbprint"
 if (-not $cert.HasPrivateKey -or $cert.NotAfter -le (Get-Date) -or $cert.NotBefore -gt (Get-Date)) { throw 'Signing certificate is expired, not yet valid, or has no private key.' }
 if ($cert.Subject -eq $cert.Issuer -or $cert.Issuer -match 'Local Test|Development|Test Root') { throw 'A development/test certificate cannot sign a public OpenClaude release.' }
 if (-not ($cert.EnhancedKeyUsageList.ObjectId -contains '1.3.6.1.5.5.7.3.3')) { throw 'Certificate is not authorized for code signing.' }
 $chain = New-Object System.Security.Cryptography.X509Certificates.X509Chain
 $chain.ChainPolicy.RevocationMode = 'Online'
 try { if (-not $chain.Build($cert)) { throw 'Signing certificate trust/revocation validation failed.' } } finally { $chain.Dispose() }
 $signArgs += @('/s','My','/sha1',$thumbprint)
} elseif ($dlib -and $metadata) {
 foreach ($item in @($dlib,$metadata)) { if (-not (Test-Path -LiteralPath $item -PathType Leaf)) { throw 'Artifact Signing library/metadata file missing.' } }
 $signArgs += @('/dlib',$dlib,'/dmdf',$metadata)
} else { throw 'Public code-signing certificate or Artifact Signing configuration is required.' }
if ($CheckOnly) { Write-Output 'Signing prerequisites verified.'; exit 0 }
if (-not $Path -or -not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw 'Signing target does not exist.' }
& $tool @signArgs $Path
if ($LASTEXITCODE -ne 0) { throw 'Authenticode signing failed.' }
& $tool verify /pa /all /v $Path
if ($LASTEXITCODE -ne 0) { throw 'Authenticode verification failed.' }
$signature = Get-AuthenticodeSignature -LiteralPath $Path
if ($signature.Status -ne 'Valid' -or -not $signature.TimeStamperCertificate) { throw 'A valid timestamped signature is required.' }
if ($thumbprint -and $signature.SignerCertificate.Thumbprint -ne $thumbprint) { throw 'Unexpected signing identity.' }
Write-Output ('Verified timestamped signature: ' + $signature.SignerCertificate.Subject)
