/**
 * Telegram alerts — FREE, no provider account, 2-minute setup:
 *   1. In Telegram, message @BotFather → /newbot → copy the bot token.
 *   2. Open your new bot, press Start, send any message.
 *   3. Visit https://api.telegram.org/bot<TOKEN>/getUpdates in a browser
 *      → copy "chat":{"id": ... } into TELEGRAM_CHAT_ID.
 *   4. Fill both values in backend/.env, restart, use "Send test alert".
 */
const axios = require("axios");
function configured() {
  return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

async function send(text) {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return false;
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID, text,
    });
    return true;
  } catch (e) {
    require("../utils/logger").error(`[telegram] Send failed: ${e.response?.data?.description || e.message}`);
    return false;
  }
}
module.exports = { send, configured };
