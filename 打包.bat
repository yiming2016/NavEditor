@echo off
chcp 936 >nul
cd /d "%~dp0"

set "DEST=%~dp0..\软件"
if not exist "%DEST%" mkdir "%DEST%"

echo ============================================
echo   NavEditor 一键打包：源码到软件
echo ============================================
echo.
echo [1/3] 生成 NavEditor.exe 到 ..\软件 ...
python -m PyInstaller NavEditor.spec --noconfirm --distpath "%DEST%"
if errorlevel 1 (
    echo.
    echo 打包失败，请检查上面的错误信息。
    pause
    exit /b 1
)

echo.
echo [2/3] 同步网页文件到 ..\软件 ...
for %%F in (editor.html app.js template.js styles.css app_icon.ico .about_template .assetsignore) do (
    if exist "%%F" copy /Y "%%F" "%DEST%\" >nul
)
for %%D in (assets lib template) do (
    if exist "%%D" robocopy "%%D" "%DEST%\%%D" /MIR /NFL /NDL /NJH /NJS /NP >nul
)

echo.
echo [3/3] 完成
echo   可执行文件: %DEST%\NavEditor.exe
echo   站点数据:   %DEST%\web  (不会被覆盖)
echo.
pause