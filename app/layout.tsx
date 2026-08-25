import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/app/_components/theme-provider";
import { resolveViewer } from "@/lib/clerk-owner";
import { ensureUserRow } from "@/lib/users";
import { CLERK_SERVER_ENABLED } from "@/lib/owner";
import { isPublicHost } from "@/lib/public-site";
import { cn } from "@/lib/utils";
import "./globals.css";

const sans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
});

const mono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cael",
  description: "Your personal guide — boundless perspective, clarity on what matters, and a clear path toward your dreams.",
  icons: {
    icon: "/icon.svg",
    // Safari ignores SVG for apple-touch-icon, so the home-screen icon is a real
    // 180px PNG rendered from the same source.
    apple: "/apple-icon.png",
  },
};

// viewport-fit=cover is what makes env(safe-area-inset-*) report real numbers on
// an iPhone — without it the bottom nav sits under the home indicator. The page
// itself never zooms or scrolls as a whole (the shell is h-dvh), so pinch-zoom is
// left enabled deliberately: it's the only way to zoom a sketch on a phone.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { readonly children: ReactNode }) {
  // Clerk is mounted on the private host only. bertomill.com is anonymous by
  // design — no accounts, no session, and no reason to ship Clerk's JS to a
  // marketing page. Its "Sign in" link points at cael.bertomill.com, which keeps
  // Clerk on a single origin and avoids satellite-domain setup entirely.
  const host = (await headers()).get("host");
  const withClerk = CLERK_SERVER_ENABLED && !isPublicHost(host);

  if (withClerk) {
    // Record the account on the way past. Middleware already decided whether they
    // get in; this is only the ledger, and it must never block the render.
    try {
      const { userId } = await auth();
      if (userId) await ensureUserRow(await resolveViewer(userId));
    } catch {
      // No session, or the DB is unreachable. Neither is worth a blank page.
    }
  }

  const tree = (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider>{children}</TooltipProvider>
      <Toaster />
    </ThemeProvider>
  );

  return (
    <html className={cn(sans.variable, mono.variable)} lang="en" suppressHydrationWarning>
      <body>{withClerk ? <ClerkProvider>{tree}</ClerkProvider> : tree}</body>
    </html>
  );
}
