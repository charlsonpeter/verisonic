# Build the Windows installer (PyInstaller exe + Inno Setup).
# Output: broadcaster/dist/VeriSonic_Broadcaster_Setup.exe
#
# Usage:
#   broadcaster/installer/windows/build_windows_setup.ps1
# Requires Inno Setup 6 (ISCC.exe).
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = (Resolve-Path (Join-Path $ScriptDir "../../..")).Path
$BroadcasterDir = Join-Path $RootDir "broadcaster"
$DistDir = Join-Path $BroadcasterDir "dist"
$SetupOutput = Join-Path $DistDir "VeriSonic_Broadcaster_Setup.exe"

Write-Host "==> Building VeriSonic Broadcaster.exe (PyInstaller)..."
& (Join-Path $ScriptDir "build_app.ps1")

$IsccCandidates = @(
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
)
$Iscc = $IsccCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $Iscc) {
    throw "Inno Setup 6 not found. Install from https://jrsoftware.org/isinfo.php or run: choco install innosetup -y"
}

Write-Host "==> Building VeriSonic_Broadcaster_Setup.exe..."
& $Iscc (Join-Path $ScriptDir "setup.iss")

if (-not (Test-Path $SetupOutput)) {
    throw "Installer build failed: missing $SetupOutput"
}

Write-Host ""
Write-Host "Done. Windows installer:"
Write-Host "  $SetupOutput"
Get-Item $SetupOutput | Format-List Name, Length, LastWriteTime
