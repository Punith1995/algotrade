@echo off
REM ============================================================
REM  Trading-day launcher (Windows)
REM  - Prevents sleep while plugged in (screen may still turn off)
REM  - Starts backend + frontend in two windows
REM  - Prints the phone URL
REM  Keep the laptop PLUGGED IN and the lid OPEN (or set
REM  "When I close the lid -> Do nothing" in Power Options).
REM ============================================================
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
echo Sleep disabled while plugged in.

start "AlgoTrade Backend" cmd /k "cd /d %~dp0backend && npm start"
timeout /t 5 /nobreak >nul
start "AlgoTrade Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ============================================================
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do set IP=%%a
echo  Laptop:  http://localhost:5173
echo  Phone :  http://%IP: =%:5173   (same Wi-Fi or Tailscale)
echo  Morning login: click "Login with Zerodha" in the app
echo ============================================================
pause
