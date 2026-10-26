# Deploy to Render

Three services, defined in `render.yaml`:

| Service | Type | Purpose |
|---|---|---|
| `algotrade-backend` | Web service (Node, Starter plan) | Market feed, scanner, alerts, API |
| `algotrade-frontend` | Static site | The dashboard |
| `algotrade-db` | PostgreSQL (free) | Durable state: signals, positions, settings |

The backend must stay on a paid plan. The free tier sleeps after inactivity, which stops the live feed and scanner.

Before deploying, create your Angel One SmartAPI app and get the four credentials. Follow **SETUP_ANGEL_ONE.md**.

## 1. Put the code on GitHub

```bash
cd algotrade
git init && git add . && git commit -m "AlgoTrade: initial deploy"
git branch -M main
git remote add origin https://github.com/<you>/algotrade.git
git push -u origin main
```

`.gitignore` keeps `.env`, `token.json`, `node_modules` and local data out of the repo. Do not force-add them.

## 2. Create the Blueprint on Render

1. Render dashboard → **New → Blueprint** → connect the GitHub repo.
2. Render reads `render.yaml` and shows the three services. Click **Apply**.
3. It asks for the secret values marked below. Fill them in now or after the first deploy.

| Variable | Service | Value |
|---|---|---|
| `ANGEL_API_KEY` | backend | SmartAPI app key |
| `ANGEL_CLIENT_CODE` | backend | your Angel One client ID |
| `ANGEL_PIN` | backend | your login PIN (MPIN) |
| `ANGEL_TOTP_SECRET` | backend | the base32 key from your TOTP setup |
| `FRONTEND_ORIGIN` | backend | `https://algotrade-frontend.onrender.com` |
| `VITE_API_URL` | frontend | `https://algotrade-backend.onrender.com/api` |
| `VITE_SOCKET_URL` | frontend | `https://algotrade-backend.onrender.com` |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | backend | optional, for phone alerts |
| `TWILIO_*`, `WHATSAPP_TO` | backend | optional, for WhatsApp alerts |

Replace `algotrade-backend` and `algotrade-frontend` with your actual Render service names if Render gave them different ones (for example, a suffix when the name is taken).

## 3. Link the services

The frontend's API URL is baked in at build time, so the order matters:

1. Deploy the backend first and note its URL.
2. Set `FRONTEND_ORIGIN` on the backend to the real frontend URL.
3. Set `VITE_API_URL` and `VITE_SOCKET_URL` on the frontend, then trigger a **manual deploy** (a rebuild is required).

## 4. Login

The backend logs in to Angel One by itself, using the four `ANGEL_*` values. No browser step is needed. It logs in at startup, and again when each new trading day starts. To force a login, open:

```
https://algotrade-backend.onrender.com/api/auth/login
```

## 5. Verify

- `https://algotrade-backend.onrender.com/` responds (the health check).
- `https://algotrade-backend.onrender.com/api/auth/status` shows `"authenticated": true`.
- The frontend loads and the Scanner page shows live rows during market hours (09:15–15:30 IST).
- Backend logs (Render → service → Logs) show `Angel One session ready` and `Storage mode: postgres`.
- Settings changes persist after a backend restart (this confirms the database is connected).

## Safety settings for production

- The app is signal-only. It never places orders on Angel One, so there is no order switch to turn on.
- Keep the Render service URLs private. Do not share them publicly.

## Known limits

- **Free Postgres expires after 30 days.** Upgrade the database plan before then, or the app falls back to the JSON file, which is lost when the service redeploys.
- **The session file is not persistent** on Render. The backend logs in again on each start, so this is expected.
- **Render logs are in the dashboard**, not in files. Watch them on the first trading day.

## Local test before deploying

```bash
cd backend && npm ci && cp .env.example .env   # then fill in the ANGEL_* values
npm start                                       # should log in and print the backend URL
cd ../frontend && npm ci && npm run build      # should produce dist/
```
