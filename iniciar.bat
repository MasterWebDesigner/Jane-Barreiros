@echo off
setlocal EnableDelayedExpansion
title Studio Jane Barreiros - Iniciar servidores
chcp 65001 >nul

cd /d "%~dp0"

rem ---------- 1) PROXY DECAP (Admin) - porta 8082 ----------
call :porta_em_uso 8082
if "!LIVRE!"=="nao" (
  echo   [OK] Proxy Decap ja esta rodando na porta 8082.
) else (
  echo   [..] Subindo Proxy Decap na porta 8082...
  start "Decap Proxy 8082" cmd /k "title Decap Proxy 8082 & set PORT=8082 & node node_modules\decap-server\dist\index.js"
  timeout /t 3 /nobreak >nul
)

rem ---------- 2) SITE ESTATICO - porta 8001 ----------
call :porta_em_uso 8001
if "!LIVRE!"=="nao" (
  echo   [OK] Site estatico ja esta rodando na porta 8001.
) else (
  echo   [..] Subindo site estatico na porta 8001...
  start "Site Jane Barreiros - 8001" cmd /k "title Site Jane Barreiros - 8001 & node static-server.js ""%~dp0"" 8001"
  timeout /t 2 /nobreak >nul
)

rem ---------- 3) Abre o navegador automaticamente ----------
echo   Abrindo o navegador em http://localhost:8001 ...
start "" "http://localhost:8001"

exit /b

:porta_em_uso
set "LIVRE=sim"
netstat -ano | findstr /R /C:"TCP" | findstr /R /C:":%1 " | findstr /I "LISTENING" >nul 2>&1
if not errorlevel 1 set "LIVRE=nao"
exit /b