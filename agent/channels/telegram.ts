import { defaultTelegramAuth, telegramChannel } from "eve/channels/telegram";

// Telegram surface for Cael — a richer personal-agent channel than SMS
// (inline-keyboard approvals, attachments, no per-message cost).
//
// Setup:
//   1. Create a bot with @BotFather, note its username and token.
//   2. Set env vars:
//        TELEGRAM_BOT_TOKEN=123456:...
//        TELEGRAM_WEBHOOK_SECRET_TOKEN=<a secret you choose>
//        TELEGRAM_BOT_USERNAME=my_bot   (optional; enables @mention dispatch in groups)
//        TELEGRAM_OWNER_ID=123456789    (required; your numeric Telegram user id,
//                                        from @userinfobot. Everyone else is ignored.)
//   3. After deploy, register the webhook (eve does not call setWebhook):
//        curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
//          -H "Content-Type: application/json" \
//          -d '{"url":"https://<your-app>/eve/v1/telegram",
//               "secret_token":"'"$TELEGRAM_WEBHOOK_SECRET_TOKEN"'",
//               "allowed_updates":["message","callback_query"]}'
// The agent has every tool over Berto's data, so only he may reach it. With
// TELEGRAM_OWNER_ID unset, nobody can: the channel fails closed.
const OWNER_ID = process.env.TELEGRAM_OWNER_ID?.trim() ?? "";

export default telegramChannel({
  botUsername: process.env.TELEGRAM_BOT_USERNAME ?? "cael_bot",
  onMessage: (_ctx, message) => {
    if (!OWNER_ID || message.from?.id !== OWNER_ID || message.chat.type !== "private") return null;
    return { auth: defaultTelegramAuth(message) };
  },
  uploadPolicy: {
    allowedMediaTypes: ["image/*", "application/pdf"],
    maxBytes: 10 * 1024 * 1024,
  },
});
