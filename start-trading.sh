#!/bin/bash
# Trading-day launcher (Mac/Linux). Prevents sleep while running.
cd "$(dirname "$0")"
echo "Starting backend + frontend (sleep disabled while this runs)…"
( cd backend && npm start ) &
BACK=$!
sleep 4
( cd frontend && npm run dev ) &
FRONT=$!
IP=$(hostname -I 2>/dev/null | awk '{print $1}')
[ -z "$IP" ] && IP=$(ipconfig getifaddr en0 2>/dev/null)
echo "============================================================"
echo " Laptop:  http://localhost:5173"
echo " Phone :  http://$IP:5173   (same Wi-Fi or Tailscale)"
echo "============================================================"
# caffeinate keeps a Mac awake for as long as the processes live
if command -v caffeinate >/dev/null; then caffeinate -i -w $BACK & fi
wait $BACK $FRONT
