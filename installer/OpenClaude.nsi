Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"
!ifndef STAGE
!error "STAGE must point to the prepared portable folder"
!endif
Name "OpenClaude"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\OpenClaude"
RequestExecutionLevel user
SetCompressor /SOLID lzma
BrandingText "OpenClaude · Independent open-source AI workspace"
VIProductVersion "0.1.0.0"
VIAddVersionKey "ProductName" "OpenClaude"
VIAddVersionKey "FileDescription" "OpenClaude Windows Installer"
VIAddVersionKey "FileVersion" "0.1.0"
VIAddVersionKey "LegalCopyright" "OpenClaude contributors"
!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "${STAGE}\LICENSE"
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\OpenClaude.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch OpenClaude"
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
Section "OpenClaude desktop and bundled runtimes (required)" Core
 SectionIn RO
 SetOutPath "$INSTDIR"
 File "${STAGE}\OpenClaude.exe"
 File "${STAGE}\WebView2Loader.dll"
 File "${STAGE}\LICENSE"
 File "${STAGE}\THIRD_PARTY_NOTICES.md"
 File "${STAGE}\Setup-Dependencies.ps1"
 File "${STAGE}\Setup-Dependencies.cmd"
 File /r "${STAGE}\backend"
 nsExec::ExecToLog 'powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\Setup-Dependencies.ps1" -BrowserRuntime'
 Pop $0
 ${If} $0 != 0
  MessageBox MB_OK|MB_ICONEXCLAMATION "WebView2 setup needs attention. See the installation log, or run Setup-Dependencies.ps1 -BrowserRuntime before launching."
 ${EndIf}
 WriteUninstaller "$INSTDIR\Uninstall.exe"
 CreateDirectory "$SMPROGRAMS\OpenClaude"
 CreateShortcut "$SMPROGRAMS\OpenClaude\OpenClaude.lnk" "$INSTDIR\OpenClaude.exe"
 CreateShortcut "$DESKTOP\OpenClaude.lnk" "$INSTDIR\OpenClaude.exe"
 CreateShortcut "$SMPROGRAMS\OpenClaude\Optional dependency setup.lnk" "$INSTDIR\Setup-Dependencies.cmd"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OpenClaude" "DisplayName" "OpenClaude"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OpenClaude" "DisplayVersion" "0.1.0"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OpenClaude" "UninstallString" '"$INSTDIR\Uninstall.exe"'
SectionEnd
Section "Local model engine (online CPU/CUDA dependency setup)" Inference
 nsExec::ExecToLog 'powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\Setup-Dependencies.ps1" -Inference'
 Pop $0
 ${If} $0 != 0
  MessageBox MB_OK|MB_ICONEXCLAMATION "Inference setup needs attention. The app is installed; retry the runtime installation in Settings."
 ${EndIf}
SectionEnd
Section /o "Docker Desktop and document/search containers (optional)" Docker
 nsExec::ExecToLog 'powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\Setup-Dependencies.ps1" -Docker -Worker'
 Pop $0
 ${If} $0 != 0
  MessageBox MB_OK|MB_ICONEXCLAMATION "Optional Docker setup needs attention. Finish any Windows/WSL requirements and rerun dependency setup."
 ${EndIf}
SectionEnd
Section "Uninstall"
 Delete "$DESKTOP\OpenClaude.lnk"
 Delete "$SMPROGRAMS\OpenClaude\OpenClaude.lnk"
 Delete "$SMPROGRAMS\OpenClaude\Optional dependency setup.lnk"
 RMDir "$SMPROGRAMS\OpenClaude"
 Delete "$INSTDIR\OpenClaude.exe"
 Delete "$INSTDIR\WebView2Loader.dll"
 Delete "$INSTDIR\LICENSE"
 Delete "$INSTDIR\THIRD_PARTY_NOTICES.md"
 Delete "$INSTDIR\Setup-Dependencies.ps1"
 Delete "$INSTDIR\Setup-Dependencies.cmd"
 Delete "$INSTDIR\Uninstall.exe"
 RMDir /r "$INSTDIR\backend"
 RMDir "$INSTDIR"
 DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OpenClaude"
SectionEnd
