/** Fired by any "new chat" control; the Workspace listens and opens the full chat page. */
export const NEW_CHAT_EVENT = "cael:new-chat";

/** `stay`: start the fresh thread without leaving the page (the corner chat). */
export function requestNewChat(options?: { stay?: boolean }) {
  window.dispatchEvent(new CustomEvent(NEW_CHAT_EVENT, { detail: { stay: options?.stay ?? false } }));
}
