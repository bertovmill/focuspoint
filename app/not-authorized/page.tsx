import { auth } from "@clerk/nextjs/server";
import { SignOutButton } from "@clerk/nextjs";

import { AuthShell } from "@/app/_components/auth-shell";
import { resolveViewer } from "@/lib/clerk-owner";
import { ensureUserRow } from "@/lib/users";
import { CLERK_SERVER_ENABLED, PUBLIC_SITE_URL } from "@/lib/owner";

export const metadata = { title: "Cael is private" };

/**
 * Where a signed-in person who isn't the owner lands.
 *
 * Middleware *rewrites* here rather than redirecting, so whatever URL they tried
 * stays in the address bar. Their account is real and kept — this is the one
 * place that records it, so a subscriber area can be built on top later.
 */
export default async function NotAuthorizedPage() {
  if (!CLERK_SERVER_ENABLED) {
    return (
      <AuthShell title="Cael is private" subtitle="This part of the site isn't shared." >
        <a
          href={PUBLIC_SITE_URL}
          className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          Go to bertomill.com
        </a>
      </AuthShell>
    );
  }

  const { userId } = await auth();
  const viewer = await resolveViewer(userId);
  // Best-effort: a failed write shouldn't turn "you can't come in" into a crash.
  await ensureUserRow(viewer).catch(() => {});

  return (
    <AuthShell
      title="Cael is private"
      subtitle={
        viewer.email
          ? `You're signed in as ${viewer.email}, but Cael itself is Berto's.`
          : "You're signed in, but Cael itself is Berto's."
      }
    >
      <p className="text-sm leading-relaxed text-muted-foreground">
        The tasks, notes, journal and the agent behind them aren&apos;t shared. Your account is
        saved — if there&apos;s something here for you later, this is where it&apos;ll show up.
      </p>
      <div className="flex items-center gap-3">
        <a
          href={PUBLIC_SITE_URL}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Go to bertomill.com
        </a>
        <SignOutButton>
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Sign out
          </button>
        </SignOutButton>
      </div>
    </AuthShell>
  );
}
