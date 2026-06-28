import { telegramChannel } from "eve/channels/telegram";

// Telegram surface for Cael — a richer personal-agent channel than SMS
// (inline-keyboard approvals, attachments, no per-message cost).
//
// Setup:
//   1. Create a bot with @BotFather, note its username and token.
//   2. Set env vars:
//        TELEGRAM_BOT_TOKEN=123456:...
//        TELEGRAM_WEBHOOK_SECRET_TOKEN=<a secret you choose>
//        TELEGRAM_BOT_USERNAME=my_bot   (optional; enables @mention dispatch in groups)
//   3. After deploy, register the webhook (eve does not call setWebhook):
//        curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
//          -H "Content-Type: application/json" \
//          -d '{"url":"https://<your-app>/eve/v1/telegram",
//               "secret_token":"'"$TELEGRAM_WEBHOOK_SECRET_TOKEN"'",
//               "allowed_updates":["message","callback_query"]}'
export default telegramChannel({
  botUsername: process.env.TELEGRAM_BOT_USERNAME ?? "cael_bot",
  uploadPolicy: {
    allowedMediaTypes: ["image/*", "application/pdf"],
    maxBytes: 10 * 1024 * 1024,
  },
});
