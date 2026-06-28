import { slackChannel } from "eve/channels/slack";
import { connectSlackCredentials } from "@vercel/connect/eve";

// Slack surface for Cael — answers @mentions and DMs in your workspace, replies
// in-thread, shows typing indicators, and renders HITL prompts as buttons.
//
// Credentials run through Vercel Connect (connector "slack/cael"), so there is
// NO SLACK_BOT_TOKEN / SLACK_SIGNING_SECRET to manage — Connect handles the
// outbound bot token and inbound webhook verification.
//
// One-time setup (the `create` step opens a browser to install the Slack app):
//   export FF_CONNECT_ENABLED=1
//   vercel connect create slack --triggers
//   vercel connect detach <uid> --yes
//   vercel connect attach <uid> --triggers --trigger-path /eve/v1/slack --yes
// Then deploy:
//   VERCEL_USE_EXPERIMENTAL_FRAMEWORKS=1 vercel deploy --prod
export default slackChannel({
  credentials: connectSlackCredentials("slack/cael"),
  // Inject earlier thread replies (since Cael last spoke) so it follows the
  // conversation, not just the triggering mention. Requires the matching Slack
  // history scope.
  threadContext: { since: "last-agent-reply" },
});
