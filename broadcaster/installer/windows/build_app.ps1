# Build Windows executable with PyInstaller (shared hidden imports with macOS build).
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = (Resolve-Path (Join-Path $ScriptDir "../../..")).Path
$BroadcasterDir = Join-Path $RootDir "broadcaster"
$DistDir = if ($env:VERISONIC_DIST_DIR) { $env:VERISONIC_DIST_DIR } else { Join-Path $BroadcasterDir "dist" }
$BuildDir = Join-Path $BroadcasterDir "build"
$AppName = "VeriSonic Broadcaster"
$BuildPy = if ($env:VERISONIC_BUILD_PYTHON) { $env:VERISONIC_BUILD_PYTHON } else { "python" }

Set-Location $RootDir

Write-Host "Using Python: $BuildPy"
& $BuildPy --version

$IconPath = Join-Path $BroadcasterDir "assets/icon.ico"
if (-not (Test-Path $IconPath)) {
    & $BuildPy (Join-Path $BroadcasterDir "generate_icons.py")
}

$PyiWorkpath = Join-Path $BuildDir "pyinstaller"
$SpecFile = Join-Path $BuildDir "$AppName.spec"
$ExePath = Join-Path $DistDir "$AppName.exe"

Remove-Item -Recurse -Force $PyiWorkpath -ErrorAction SilentlyContinue
Remove-Item -Force $SpecFile -ErrorAction SilentlyContinue
Remove-Item -Force $ExePath -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $DistDir, $BuildDir | Out-Null

& $BuildPy -m PyInstaller --noconsole --onefile --windowed `
    --workpath $PyiWorkpath `
    --distpath $DistDir `
    --specpath $BuildDir `
    --icon="$IconPath" `
    --paths $BroadcasterDir `
    --hidden-import=installer.windows.audio_permission `
    --hidden-import=PyQt5.QtNetwork `
    --hidden-import=_sounddevice `
    --hidden-import=sounddevice `
    --hidden-import=lameenc `
    --hidden-import=websockets `
    --hidden-import=websockets.legacy.client `
    --collect-all sounddevice `
    --name="$AppName" `
    (Join-Path $BroadcasterDir "verisonic_broadcaster.py")

Write-Host "Built: $ExePath"
