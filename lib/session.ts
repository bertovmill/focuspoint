export const SESSION_COOKIE = "cael_session";

export function isValidSession(cookieValue: string | undefined): boolean {
  const password = process.env.BASIC_AUTH_PASSWORD;
  if (!password || !cookieValue) return false;
  return cookieValue === password;
}
