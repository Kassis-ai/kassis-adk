<#
.SYNOPSIS
  Check the cosign release key password, then (optionally) store the kit signing
  secrets in Kassis-ai/kassis-adk. Double-click check-signing-key.bat next to this file.

.DESCRIPTION
  Reads %USERPROFILE%\kassis-release-keys\cosign.key. For each password you type
  (hidden), cosign derives the public key; a match with cosign.pub proves the
  password. The key and password never reach the screen or a file.
  With a correct password it offers to set COSIGN_PRIVATE_KEY and COSIGN_PASSWORD
  with the GitHub CLI. Requires cosign and gh (winget install sigstore.cosign GitHub.cli).
#>
$ErrorActionPreference = 'Stop'
$repo = 'Kassis-ai/kassis-adk'
$keys = Join-Path $env:USERPROFILE 'kassis-release-keys'
$private = Join-Path $keys 'cosign.key'
$public = Join-Path $keys 'cosign.pub'
$repoPub = Join-Path (Resolve-Path "$PSScriptRoot\..\..").Path 'deploy\release\cosign.pub'

function Normalize($text) { ($text -replace "`r", '').Trim() }
function Read-Secret($prompt) {
  $secure = Read-Host -AsSecureString $prompt
  [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
}

if (-not (Get-Command cosign -ErrorAction SilentlyContinue)) { throw 'cosign is missing. Install it: winget install sigstore.cosign' }
if (-not (Test-Path $private) -or -not (Test-Path $public)) { throw "cosign.key or cosign.pub is missing in $keys" }
$expected = Normalize (Get-Content $public -Raw)
if ((Test-Path $repoPub) -and ((Normalize (Get-Content $repoPub -Raw)) -ne $expected)) {
  Write-Host 'Warning: deploy\release\cosign.pub in kassis-adk is not the public key in kassis-release-keys.' -ForegroundColor Yellow
}

$password = $null
for ($try = 1; $try -le 5 -and -not $password; $try++) {
  $candidate = Read-Secret "Password for cosign.key (try $try of 5)"
  if (-not $candidate) { Write-Host 'Empty password skipped.'; continue }
  $env:COSIGN_PASSWORD = $candidate
  # Windows PowerShell turns native stderr into errors under Stop; a wrong password writes to stderr.
  $ErrorActionPreference = 'Continue'
  try { $derived = (& cosign public-key --key $private 2>$null) -join "`n"; $code = $LASTEXITCODE }
  finally { Remove-Item Env:COSIGN_PASSWORD -ErrorAction SilentlyContinue; $ErrorActionPreference = 'Stop' }
  if ($code -eq 0 -and (Normalize $derived) -eq $expected) {
    $password = $candidate
    Write-Host 'Correct password: it opens cosign.key and matches cosign.pub.' -ForegroundColor Green
  } else {
    Write-Host 'Not this one.' -ForegroundColor Red
  }
}
if (-not $password) {
  Write-Host 'No password matched. Do not create a new key yet; tell Claude first.' -ForegroundColor Yellow
  exit 1
}

$answer = Read-Host "Store COSIGN_PRIVATE_KEY and COSIGN_PASSWORD in $repo now? (y/n)"
if ($answer -notmatch '^[yY]') { exit 0 }
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'gh is missing. Install it: winget install GitHub.cli' }
$ErrorActionPreference = 'Continue'
gh auth status 2>$null | Out-Null
$loggedIn = $LASTEXITCODE -eq 0
$ErrorActionPreference = 'Stop'
if (-not $loggedIn) { gh auth login }
Get-Content $private -Raw | gh secret set COSIGN_PRIVATE_KEY --repo $repo
if ($LASTEXITCODE -ne 0) { throw 'Could not set COSIGN_PRIVATE_KEY.' }
$password | gh secret set COSIGN_PASSWORD --repo $repo
if ($LASTEXITCODE -ne 0) { throw 'Could not set COSIGN_PASSWORD.' }
$password = $null
Write-Host "Both secrets are set in $repo." -ForegroundColor Green
