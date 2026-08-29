/** Fired by any "new chat" control; the Workspace listens and opens the full chat page. */
export const NEW_CHAT_EVENT = "cael:new-chat";

export function requestNewChat() {
  window.dispatchEvent(new Event(NEW_CHAT_EVENT));
}
