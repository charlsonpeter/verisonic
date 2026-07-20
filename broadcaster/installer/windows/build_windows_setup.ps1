# Build the Windows installer (PyInstaller exe in staging + Inno Setup).
# Output: broadcaster/dist/VeriSonic Broadcaster Setup.exe
#
# Usage:
#   broadcaster/installer/windows/build_windows_setup.ps1
# Requires Inno Setup 6 (ISCC.exe).
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = (Resolve-Path (Join-Path $ScriptDir "../../..")).Path
$BroadcasterDir = Join-Path $RootDir "broadcaster"
$DistDir = if ($env:VERISONIC_DIST_DIR) { $env:VERISONIC_DIST_DIR } else { Join-Path $BroadcasterDir "dist" }
$SetupName = "VeriSonic Broadcaster Setup.exe"
$SetupOutput = Join-Path $DistDir $SetupName
$StagingDir = Join-Path ([System.IO.Path]::GetTempPath()) ("verisonic-win-staging-" + [System.Guid]::NewGuid().ToString("N"))

New-Item -ItemType Directory -Force -Path $DistDir, $StagingDir | Out-Null

try {
    Write-Host "==> Building VeriSonic Broadcaster.exe (PyInstaller, staging)..."
    $env:VERISONIC_DIST_DIR = $StagingDir
    & (Join-Path $ScriptDir "build_app.ps1")

    $IsccCandidates = @(
        "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
        "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
    )
    $Iscc = $IsccCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $Iscc) {
        throw "Inno Setup 6 not found. Install from https://jrsoftware.org/isinfo.php or run: choco install innosetup -y"
    }

    Write-Host "==> Building $SetupName..."
    & $Iscc `
        "/DMyAppSourceDir=$StagingDir" `
        "/DMyAppOutputDir=$DistDir" `
        (Join-Path $ScriptDir "setup.iss")

    if (-not (Test-Path $SetupOutput)) {
        throw "Installer build failed: missing $SetupOutput"
    }

    Remove-Item -Force (Join-Path $DistDir "VeriSonic Broadcaster.exe") -ErrorAction SilentlyContinue
    Remove-Item -Force (Join-Path $DistDir "VeriSonic_Broadcaster_Setup.exe") -ErrorAction SilentlyContinue

    Write-Host ""
    Write-Host "Done. Windows installer:"
    Write-Host "  $SetupOutput"
    Get-Item $SetupOutput | Format-List Name, Length, LastWriteTime
}
finally {
    Remove-Item -Recurse -Force $StagingDir -ErrorAction SilentlyContinue
    Remove-Item Env:VERISONIC_DIST_DIR -ErrorAction SilentlyContinue
}
