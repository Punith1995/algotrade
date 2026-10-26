# Setting up Angel One SmartAPI

This app reads live prices and candles from Angel One SmartAPI. It logs in with your client ID, PIN and a TOTP code generated from a secret key, so no browser redirect or daily token copy is needed. Orders are never placed.

Menu names on Angel One's website and app change from time to time. If a name below does not match what you see, look for the nearest equivalent and check the official SmartAPI docs.

## What you need

| Item | Where it comes from |
|---|---|
| Client ID (e.g. `A123456`) | Your Angel One trading account |
| Login PIN (4-digit MPIN) | The PIN you use to log in to the Angel One app |
| SmartAPI app key | Created at smartapi.angelone.in (step 2) |
| TOTP secret (base32 text) | Shown when you enable TOTP (step 3) |

## Step 1 — Have an Angel One account

Open an Angel One trading account if you do not already have one. Your client ID and PIN come from that account. Complete KYC and make sure you can log in to the Angel One app.

## Step 2 — Create a SmartAPI app (gets the API key)

1. Go to **smartapi.angelone.in** and sign in with your Angel One client ID and password.
2. Open **My Apps** and choose **Create App**.
3. Give it any name (for example `algotrade`). Choose the option for a personal, self-use app.
4. Enter a redirect URL if asked. This app does not use it, so `http://localhost:5000` is fine.
5. Save. The app now shows an **API key**. Copy it. This is `ANGEL_API_KEY`.

Keep the key private. Anyone with it, plus your client ID, PIN and TOTP secret, can log in to your account.

## Step 3 — Enable TOTP and save the secret

TOTP is the 6-digit code that changes every 30 seconds. The app generates it itself, so it needs the secret key behind the QR code.

1. In the Angel One app or web profile, open the security or 2FA settings and choose to enable **TOTP** (Google Authenticator style).
2. When the QR code appears, **also** look for the text key shown under it (sometimes labelled "Can't scan? Enter this key"). Copy that text. It is a base32 string made of letters A–Z and digits 2–7, for example `JBSWY3DPEHPK3PXP`.
3. Save it somewhere safe, such as a password manager. This is `ANGEL_TOTP_SECRET`.
4. Enter the 6-digit code from your phone's authenticator app once, to confirm TOTP is working.

If you have already set up TOTP and lost the text key, you must disable TOTP and set it up again to see a new key.

## Step 4 — Put the four values in the app

Locally, copy the template and fill it in:

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`:

```
ANGEL_API_KEY=your_smartapi_key
ANGEL_CLIENT_CODE=A123456
ANGEL_PIN=1234
ANGEL_TOTP_SECRET=JBSWY3DPEHPK3PXP
```

Do not commit `.env` to git. It is already in `.gitignore`.

On Render, set the same four values on the `algotrade-backend` service under **Environment**. See DEPLOY.md.

## Step 5 — Start and verify

```bash
cd backend && npm install && npm start
```

You should see the backend start, then a line saying the Angel One session is ready. Then check:

1. Open `http://localhost:5000/api/auth/status`. It should show `"authenticated": true`.
2. Start the frontend (`cd frontend && npm install && npm run dev`) and open `http://localhost:5173`. The top bar should show **Angel One connected**.
3. During market hours (09:15–15:30 IST), the Scanner and the ticker bar should show live prices.

If login fails, the backend prints the reason. Common causes:

| Symptom | Likely cause |
|---|---|
| Login rejected, invalid credentials | Wrong client ID or PIN |
| Login rejected, invalid TOTP | The secret is wrong, or the phone clock is not synced. Re-copy the text key. |
| 401 errors after it worked | The session expired. The app logs in again automatically; wait a minute or call `/api/auth/login`. |
| Prices show but history is empty | Historical data is unavailable on your SmartAPI plan, or the day limit was hit. Set `HAS_HISTORICAL_SUBSCRIPTION=false` to build candles from live ticks only. |

## Notes

- **The app never places orders.** Even with valid credentials, it only reads prices, candles and your holdings. This is enforced in code.
- **Daily login is automatic.** The session is saved per trading day and renewed at startup and when a new day begins. You do not need to copy a token each morning.
- **The secret stays with you.** Only use it in `.env` or the Render dashboard, never in code or in a shared chat.

## Not yet verified

These were written from Angel One's public SmartAPI documentation and memory. The code has not yet been run against live Angel One servers.

- Exact login error codes and their meanings.
- Per-request rate limits (the app waits 500 ms between calls, which is a guess).
- Maximum days of history per candle interval.
- Whether SmartAPI requires a fixed IP for market-data endpoints (orders do, but orders are disabled here).
- The BANKNIFTY index token (`99926009`, used as a fallback if the scrip master does not list it).

Run it once during market hours and check the backend log for errors. Those log lines are the fastest way to find out which of these needs adjusting.
