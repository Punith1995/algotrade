#!/bin/bash
# One-time setup for Mac/Linux. Run:  bash setup.sh
set -e
echo "── Installing backend dependencies ──"
cd backend
[ -f .env ] || cp .env.example .env
npm install
cd ../frontend
echo "── Installing frontend dependencies ──"
[ -f .env ] || cp .env.example .env
npm install
cd ..
echo ""
echo "✅ Setup complete. Next steps:"
echo "  1. Edit backend/.env  → add KITE_API_KEY and KITE_API_SECRET"
echo "  2. Terminal 1:  cd backend  && npm start"
echo "  3. Terminal 2:  cd frontend && npm run dev"
echo "  4. Open http://localhost:5173 and click 'Login with Zerodha'"
