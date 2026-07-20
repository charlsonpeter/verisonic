; VeriSonic Broadcaster — Windows installer (admin + login auto-start + audio input permissions)
; Compile from repo root: iscc broadcaster/installer/windows/setup.iss

#define MyAppName "VeriSonic Broadcaster"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "VeriSonic"
#define MyAppExeName "VeriSonic Broadcaster.exe"
#define MyAppSourceDir "..\..\dist"
#define MyAppId "{{A7B3C9D1-4E2F-5A6B-8C9D-0E1F2A3B4C5D}"

[Setup]
AppId={#MyAppId}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog
OutputDir={#MyAppSourceDir}
OutputBaseFilename=VeriSonic_Broadcaster_Setup
SetupIconFile=..\..\assets\icon.ico
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\{#MyAppExeName}
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "autostart"; Description: "Start {#MyAppName} automatically when you sign in to Windows (background tray service)"; GroupDescription: "Background service:"
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: unchecked
Name: "openaudioprivacy"; Description: "Open Windows audio input privacy settings after installation (recommended)"; GroupDescription: "Audio capture permissions:"

[Files]
Source: "{#MyAppSourceDir}\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\assets\audio-permissions.txt"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: files; Name: "{userappdata}\..\Local\VeriSonic Broadcaster"

[Code]
const
  TaskName = 'VeriSonic Broadcaster';

var
  AudioPermissionsPage: TWizardPage;

procedure ConfigureAutoStart(const Enable: Boolean);
var
  ResultCode: Integer;
  ExePath: String;
begin
  ExePath := ExpandConstant('{app}\{#MyAppExeName}');
  if Enable then
    Exec('schtasks.exe',
      '/Create /TN "' + TaskName + '" /TR "' + ExePath + '" /SC ONLOGON /RL LIMITED /F',
      '', SW_HIDE, ewWaitUntilTerminated, ResultCode)
  else
    Exec('schtasks.exe',
      '/Delete /TN "' + TaskName + '" /F',
      '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

procedure OpenAudioPrivacySettings();
var
  ResultCode: Integer;
begin
  Exec('explorer.exe', 'ms-settings:privacy-microphone', '', SW_SHOW, ewNoWait, ResultCode);
  Exec('explorer.exe', 'ms-settings:sound', '', SW_SHOW, ewNoWait, ResultCode);
end;

procedure InitializeWizard();
begin
  AudioPermissionsPage := CreateOutputMsgPage(wpSelectTasks,
    'Audio Input & Recording Permissions',
    'Allow capture from all selected audio input sources',
    'VeriSonic Broadcaster records live audio from the input device you choose in the app, including:' + #13#10 + #13#10 +
    '  • Microphones' + #13#10 +
    '  • Line-in and USB audio interfaces' + #13#10 +
    '  • Loopback / system audio devices (Stereo Mix, VB-Audio Cable, etc.)' + #13#10 + #13#10 +
    'After installation, enable access in Windows Settings:' + #13#10 +
    '  Privacy & security → Microphone → allow desktop apps' + #13#10 +
    '  System → Sound → Input → verify your capture device is enabled' + #13#10 + #13#10 +
    'The installer can open these settings pages automatically when setup completes.');
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    ConfigureAutoStart(WizardIsTaskSelected('autostart'));
    if WizardIsTaskSelected('openaudioprivacy') then
      OpenAudioPrivacySettings();
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
    ConfigureAutoStart(False);
end;

function InitializeSetup(): Boolean;
begin
  Result := True;
  if not FileExists(ExpandConstant('{#MyAppSourceDir}\{#MyAppExeName}')) then
  begin
    MsgBox('Build the application first (PyInstaller output missing).' + #13#10 +
      'Expected: broadcaster\\dist\\{#MyAppExeName}', mbError, MB_OK);
    Result := False;
  end;
end;
