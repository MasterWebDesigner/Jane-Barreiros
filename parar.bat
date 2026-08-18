@echo off
title Studio Jane Barreiros - Parar servidores
chcp 65001 >nul

echo ==========================================================
echo   Studio Jane Barreiros - Encerrar servidores locais
echo ==========================================================
echo.

set "ACHOU="

for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:"TCP" ^| findstr /R ":8082 " ^| findstr /I "LISTENING"') do (
  if not "%%a"=="0" taskkill /PID %%a /F >nul 2>&1 && set "ACHOU=1"
)

for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:"TCP" ^| findstr /R ":8001 " ^| findstr /I "LISTENING"') do (
  if not "%%a"=="0" taskkill /PID %%a /F >nul 2>&1 && set "ACHOU=1"
)

echo.
if defined ACHOU (
  echo   Servidores encerrados.
) else (
  echo   Nenhum servidor rodando nas portas 8082/8001.
)
echo.
pause