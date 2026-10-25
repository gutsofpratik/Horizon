Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"
!include "FileFunc.nsh"
Var UpdateMode
Function .onInit
 ${GetParameters} $0
 ClearErrors
 ${GetOptions} $0 "/UPDATE" $UpdateMode
 ${IfNot} ${Errors}
  StrCpy $UpdateMode "yes"
 ${EndIf}
FunctionEnd
!ifndef STAGE
!error "STAGE must point to the prepared portable folder"
!endif
!ifndef VERSION
!define VERSION "0.2.0"
!endif
Name "Horizon"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\Horizon"
RequestExecutionLevel user
SetCompressor /SOLID lzma
!ifdef SIGN_SCRIPT
!uninstfinalize 'powershell.exe -NoLogo -NoProfile -NonInteractive -File "${SIGN_SCRIPT}" -Path "%1"' = 0
!endif
BrandingText "Horizon · Independent open-source AI workspace"
VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "Horizon"
VIAddVersionKey "FileDescription" "Horizon Windows Installer"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "Horizon contributors"
!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "${STAGE}\LICENSE"
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\Horizon.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch Horizon"
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
Section "Horizon desktop and bundled runtimes (required)" Core
 SectionIn RO
 SetOutPath "$INSTDIR"
 File "${STAGE}\Horizon.exe"
 File "${STAGE}\WebView2Loader.dll"
 File "${STAGE}\README.md"
 File "${STAGE}\LICENSE"
 File "${STAGE}\THIRD_PARTY_NOTICES.md"
 File "${STAGE}\Setup-Dependencies.ps1"
 File "${STAGE}\Setup-Dependencies.cmd"
 File /r "${STAGE}\backend"
 ${If} $UpdateMode != "yes"
 nsExec::ExecToLog 'powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\Setup-Dependencies.ps1" -BrowserRuntime'
 Pop $0
 ${If} $0 != 0
  MessageBox MB_OK|MB_ICONEXCLAMATION "WebView2 setup needs attention. See the installation log, or run Setup-Dependencies.ps1 -BrowserRuntime before launching." /SD IDOK
 ${EndIf}
 ${EndIf}
 WriteUninstaller "$INSTDIR\Uninstall.exe"
 CreateDirectory "$SMPROGRAMS\Horizon"
 CreateShortcut "$SMPROGRAMS\Horizon\Horizon.lnk" "$INSTDIR\Horizon.exe"
 CreateShortcut "$DESKTOP\Horizon.lnk" "$INSTDIR\Horizon.exe"
 CreateShortcut "$SMPROGRAMS\Horizon\Optional dependency setup.lnk" "$INSTDIR\Setup-Dependencies.cmd"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Horizon" "DisplayName" "Horizon"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Horizon" "DisplayVersion" "${VERSION}"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Horizon" "UninstallString" '"$INSTDIR\Uninstall.exe"'
SectionEnd
Section "Native OfficeCLI and PDF tools (online dependency setup)" Documents
 ${If} $UpdateMode == "yes"
  Goto documents_done
 ${EndIf}
 nsExec::ExecToLog 'powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\Setup-Dependencies.ps1" -Documents'
 Pop $0
 ${If} $0 != 0
  MessageBox MB_OK|MB_ICONEXCLAMATION "Local document setup needs attention. The app is installed; retry document setup in Settings."
 ${EndIf}
 documents_done:
SectionEnd
Section /o "Local model engine (online CPU/CUDA dependency setup, optional)" Inference
 ${If} $UpdateMode == "yes"
  Goto inference_done
 ${EndIf}
 nsExec::ExecToLog 'powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\Setup-Dependencies.ps1" -Inference'
 Pop $0
 ${If} $0 != 0
  MessageBox MB_OK|MB_ICONEXCLAMATION "Inference setup needs attention. The app is installed; retry the runtime installation in Settings."
 ${EndIf}
 inference_done:
SectionEnd
Section "Uninstall"
 Delete "$DESKTOP\Horizon.lnk"
 Delete "$SMPROGRAMS\Horizon\Horizon.lnk"
 Delete "$SMPROGRAMS\Horizon\Optional dependency setup.lnk"
 RMDir "$SMPROGRAMS\Horizon"
 Delete "$INSTDIR\Horizon.exe"
 Delete "$INSTDIR\WebView2Loader.dll"
 Delete "$INSTDIR\README.md"
 Delete "$INSTDIR\LICENSE"
 Delete "$INSTDIR\THIRD_PARTY_NOTICES.md"
 Delete "$INSTDIR\Setup-Dependencies.ps1"
 Delete "$INSTDIR\Setup-Dependencies.cmd"
 Delete "$INSTDIR\Uninstall.exe"
 RMDir /r "$INSTDIR\backend"
 RMDir "$INSTDIR"
 DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Horizon"
SectionEnd
