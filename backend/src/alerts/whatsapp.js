/**
 * WhatsApp alerts via Twilio.
 *
 * WhatsApp does NOT allow apps to message a number directly — a provider
 * is required. Setup (one-time, ~10 min):
 *   1. Create a free account at twilio.com → Console → copy Account SID
 *      and Auth Token into backend/.env
 *   2. Console → Messaging → Try it out → WhatsApp sandbox. From YOUR
 *      phone (e.g. +91 77606 05782) send the shown join code
 *      ("join <two-words>") to +1 415 523 8886 on WhatsApp.
 *   3. .env:  TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
 *             WHATSAPP_TO=whatsapp:+917760605782
 *   4. Restart backend → Alerts page → "Send test alert".
 *
 * NOTE: Telegram (alerts/telegram.js) is FREE and takes 2 minutes —
 * strongly recommended if you don't already use Twilio.
 */
const axios = require("axios");
const logger = require("../utils/logger");

function configured() {
  const { TWILIO_SID, TWILIO_AUTH_TOKEN, WHATSAPP_TO } = process.env;
  return !!(TWILIO_SID && TWILIO_AUTH_TOKEN && WHATSAPP_TO);
}

async function send(text) {
  if (!configured()) return false;
  const { TWILIO_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, WHATSAPP_TO } = process.env;
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
    const params = new URLSearchParams({ From: TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886", To: WHATSAPP_TO, Body: text });
    await axios.post(url, params, { auth: { username: TWILIO_SID, password: TWILIO_AUTH_TOKEN } });
    return true;
  } catch (e) {
    // Surface the REAL reason (auth failure, sandbox not joined, bad number format…)
    const detail = e.response?.data?.message || e.message;
    logger.error(`[whatsapp] Send failed: ${detail}. Common causes: sandbox not joined from your phone, wrong SID/token, or WHATSAPP_TO missing the "whatsapp:+91" prefix.`);
    return false;
  }
}
module.exports = { send, configured };
