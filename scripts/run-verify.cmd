@echo off
set ELECTRON_RUN_AS_NODE=1
"%~dp0..\apps\desktop
ode_modules\electron\dist\electron.exe" "%~dp0migration-verify.cjs" > "%~dp0verify.log" 2>&1