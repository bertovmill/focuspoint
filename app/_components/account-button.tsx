"use client";

import { Show, UserButton } from "@clerk/nextjs";

/**
 * The account avatar in the sidebar rail — and the only way to sign out of Clerk
 * from inside the app.
 *
 * Renders nothing at all unless Clerk is configured (its components need a
 * provider that isn't mounted otherwise) and nothing unless there's a Clerk
 * session, so a password-cookie session sees the rail exactly as it was.
 * `<Show when="signed-in">` is the Core 3 spelling — `<SignedIn>` was removed,
 * and importing it throws at render rather than failing at build.
 *
 * Reads the publishable key directly rather than importing the flag from
 * `lib/owner`: this is a client component, and that module carries the owner's
 * email address, which has no business in a browser bundle.
 */
export function AccountButton() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return null;
  return (
    <Show when="signed-in">
      {/* Sized to sit with the rail's other icons. `elements` takes a style object
          or class names — a raw CSS string is silently ignored. */}
      <UserButton
        appearance={{ elements: { userButtonAvatarBox: { width: "1.25rem", height: "1.25rem" } } }}
      />
    </Show>
  );
}
