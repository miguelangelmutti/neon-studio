@echo off
rem Inicia Neon Studio: levanta el servidor local y abre el navegador.
title Neon Studio
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo No se encontro Node.js. Instalalo desde https://nodejs.org y volve a intentar.
  pause
  exit /b 1
)

rem Si el servidor ya esta corriendo, solo abre el navegador
netstat -ano | findstr /R /C:":5173 .*LISTENING" >nul
if not errorlevel 1 (
  echo Neon Studio ya esta corriendo. Abriendo el navegador...
  start "" http://localhost:5173
  exit /b 0
)

echo Neon Studio en http://localhost:5173
echo Para detenerlo, cerra esta ventana o apreta Ctrl+C.
echo.
start "" /b powershell -NoProfile -Command "Start-Sleep -Seconds 1; Start-Process 'http://localhost:5173'"
node serve.js
pause
