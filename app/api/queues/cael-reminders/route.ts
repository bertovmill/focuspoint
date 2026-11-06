import { handleCallback } from "@vercel/queue";
import type { ScheduleQueueMessage } from "@vercel/schedules";
import { sendPush } from "@/lib/push";
import { REMINDER_TOPIC, type ReminderPayload } from "@/lib/reminders";

// Consumer for the `cael-reminders` Vercel Queue topic. Every firing of a
// reminder schedule (lib/reminders.ts) lands here as a ScheduleQueueMessage and
// becomes a push notification on Berto's devices. The queue trigger is declared
// in vercel.json under functions.experimentalTriggers; without that entry
// nothing is ever delivered to this route. The queue retries if the handler
// throws, so sendPush (which never throws) keeps a bad device from re-firing.
export const POST = handleCallback<ScheduleQueueMessage<ReminderPayload>>(
  async (message, metadata) => {
    const payload = message.payload;
    if (!payload?.message) {
      console.warn(`[${REMINDER_TOPIC}] ${message.name} fired with no message`, metadata.messageId);
      return;
    }
    await sendPush({
      title: "Cael reminder",
      body: payload.message,
      url: payload.url ?? (payload.todo_id ? "/tasks" : "/"),
      // One tag per occurrence: a recurring reminder must not replace itself
      // across days, but a retried delivery must not stack twice.
      tag: `reminder-${message.executionId}`,
    });
    console.log(`[${REMINDER_TOPIC}] pushed "${payload.message}" (${message.name}, ${message.source}, due ${message.scheduledAt})`);
  },
  {
    retry: (_error, metadata) => (metadata.deliveryCount >= 3 ? { acknowledge: true } : { afterSeconds: 60 }),
  },
);
