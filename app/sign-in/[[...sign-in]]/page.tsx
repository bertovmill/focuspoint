import Link from "next/link";
import { SignIn } from "@clerk/nextjs";

import { CLERK_ENABLED, PASSWORD_SIGN_IN_PATH } from "@/lib/owner";
import { AuthShell } from "@/app/_components/auth-shell";

export const metadata = { title: "Sign in · Cael" };

/**
 * The front door. Anyone may sign in — holding an account is not the same as
 * getting into Cael, which is gated by email in middleware.
 */
export default function SignInPage() {
  if (!CLERK_ENABLED) {
    return (
      <AuthShell
        title="Sign-in isn't set up yet"
        subtitle="Clerk hasn't been given its keys, so the password login is still the way in."
      >
        <Link
          href={PASSWORD_SIGN_IN_PATH}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Use the password login
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your account.">
      <SignIn />
      <Link
        href={PASSWORD_SIGN_IN_PATH}
        className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
      >
        Use the password instead
      </Link>
    </AuthShell>
  );
}
