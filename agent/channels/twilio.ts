import { twilioChannel } from "eve/channels/twilio";

export default twilioChannel({
  // Gate inbound messages to your number(s). Replace with your number or use "*" only for testing.
  allowFrom: process.env.TWILIO_ALLOW_FROM ?? "*",
  messaging: {
    // The Twilio number that sends outbound SMS replies.
    from: process.env.TWILIO_FROM_NUMBER ?? "",
  },
});
