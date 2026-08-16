import { SubscribeForm } from "./subscribe-form";

/**
 * Signup shown after an article or episode — the highest-intent moment, when
 * someone has just finished reading and knows whether they want more.
 *
 * Server component: it only renders the shared client form, so the page stays
 * static and no extra JavaScript ships for the surrounding copy.
 */
export function PostNewsletterCta() {
  return (
    <aside className="mt-10 rounded-xl border border-border bg-card p-6">
      <h2 className="font-medium tracking-tight">Liked this?</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        I write these as I go. Drop your email and the next one lands in your inbox — no spam, one
        click to leave.
      </p>
      <SubscribeForm className="mt-5 sm:max-w-md" />
    </aside>
  );
}
