import Link from "next/link";
import { SignUp } from "@clerk/nextjs";

import { CLERK_ENABLED, SIGN_IN_PATH } from "@/lib/owner";
import { AuthShell } from "@/app/_components/auth-shell";

export const metadata = { title: "Create an account · Cael" };

/**
 * Sign-up is open — anyone can hold an account. What an account gets you today
 * is the account itself; Cael stays closed to everyone but the owner.
 */
export default function SignUpPage() {
  if (!CLERK_ENABLED) {
    return (
      <AuthShell
        title="Accounts aren't open yet"
        subtitle="Clerk hasn't been given its keys, so there's nothing to sign up to."
      >
        <Link
          href={SIGN_IN_PATH}
          className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          Back to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Create an account" subtitle="Follow along with what Berto is building.">
      <SignUp />
    </AuthShell>
  );
}
