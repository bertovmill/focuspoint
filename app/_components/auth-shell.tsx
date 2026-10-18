import type { ReactNode } from "react";

/**
 * The frame around every auth screen — sign-in, sign-up, and the "this is
 * private" page. Centred, quiet, and themed with the app's own tokens so the
 * Clerk card doesn't land on a bare white page in dark mode.
 */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-background px-6 py-16">
      {/* The same colour wash the app uses elsewhere, kept faint. */}
      <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-amber-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -left-16 size-72 rounded-full bg-emerald-500/10 blur-3xl" />

      <div className="relative flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <div className="space-y-1.5">
          <h1 className="text-xl font-medium tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
