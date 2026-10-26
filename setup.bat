@echo off
REM One-time setup for Windows. Double-click or run: setup.bat
echo ── Installing backend dependencies ──
cd backend
if not exist .env copy .env.example .env
call npm install
cd ..\frontend
echo ── Installing frontend dependencies ──
if not exist .env copy .env.example .env
call npm install
cd ..
echo.
echo Setup complete. Next steps:
echo   1. Edit backend\.env  - add KITE_API_KEY and KITE_API_SECRET
echo   2. Terminal 1:  cd backend  ^&^& npm start
echo   3. Terminal 2:  cd frontend ^&^& npm run dev
echo   4. Open http://localhost:5173 and click "Login with Zerodha"
pause
