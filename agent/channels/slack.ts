import { defaultSlackAuth, slackChannel } from "eve/channels/slack";
import { connectSlackCredentials } from "@vercel/connect/eve";

const OWNER_ID = "U0AP776N28L";

export default slackChannel({
  credentials: connectSlackCredentials("slack/cael-51b8"),
  threadContext: { since: "last-agent-reply" },
  onAppMention: (ctx, message) => {
    if (message.author?.userId !== OWNER_ID) return null;
    return { auth: defaultSlackAuth(message, ctx) };
  },
  onDirectMessage: (ctx, message) => {
    if (message.author?.userId !== OWNER_ID) return null;
    return { auth: defaultSlackAuth(message, ctx) };
  },
});
