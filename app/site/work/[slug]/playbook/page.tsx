import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { PostFooterCta } from "../../../_components/post-footer-cta";
import { SiteLink } from "../../../_components/site-link";
import { TINTS } from "../../../_components/tints";
import { cn } from "@/lib/utils";

/*
 * bertomill.com/work/makerslounge/playbook: the MakersLounge event playbook,
 * free to copy. Only MakersLounge has one, so every other slug 404s.
 * Every number here is from the Luma funnel on the case study (approved vs
 * checked in, through Oct 2026). Never the Luma guest total: that's invites.
 */

const SLUG = "makerslounge";

export function generateStaticParams() {
  return [{ slug: SLUG }];
}

const TITLE = "The MakersLounge event playbook";
const DESCRIPTION =
  "How I run builder events in Toronto, free to copy: four formats and when to use each, a run-of-show, the approval rule, the 48-hour follow-up, and what to fund or cut.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `/work/${SLUG}/playbook` },
  openGraph: { title: TITLE, description: DESCRIPTION, type: "article" },
};

/** Show-up on approved guests, by format. The rest of the page is derived from these. */
const SHOW_UP = { workshop: 0.8, meetup: 0.35, hackathon: 0.21 } as const;

const FACTS = [
  { value: "20+", label: "events" },
  { value: "263", label: "different people in the room" },
  { value: "47", label: "came to two or more" },
  { value: "~16", label: "check-ins per event" },
];

const SECTIONS = [
  { id: "formats", label: "Four formats" },
  { id: "run-of-show", label: "Run-of-show" },
  { id: "approval-rule", label: "Approval rule" },
  { id: "follow-up", label: "48-hour follow-up" },
  { id: "fund-or-cut", label: "Fund or cut" },
];

const FORMATS = [
  {
    name: "Workshops",
    showUp: SHOW_UP.workshop,
    job: "Everyone leaves with something running.",
    when: "You have a concrete outcome to promise (\"you'll leave with an agent running\") and a room small enough for hosts to help each person.",
    note: "The best show-up of any format. Fund these first.",
  },
  {
    name: "Meetups",
    showUp: SHOW_UP.meetup,
    job: "The front door. Show what you're building, meet one new person.",
    when: "Monthly, on a fixed night, so new people have an easy first step and regulars have a habit.",
    note: "Cheap to run. New people find you here, then come back for workshops.",
  },
  {
    name: "Hackathons",
    showUp: SHOW_UP.hackathon,
    job: "Teams form on the night and demo at the end.",
    when: "A partner wants to meet builders and helps cover the night. An AI intake form groups people by interest so teams start building in minutes.",
    note: "Approval costs nothing, so the list leaks. Only with a partner.",
  },
  {
    name: "Maker Mondays",
    showUp: null,
    job: "Short online demo nights between in-person events.",
    when: "The weeks with no in-person night, so the community doesn't go quiet for a month.",
    note: "Online, so there's no check-in number. Judge it by who shows up in person next.",
  },
];

/** A meetup night, start to finish, plus the work either side of it. */
const RUN_OF_SHOW = [
  { at: "1 week before", what: "Post the event. Approve registrations by hand as they come in." },
  { at: "Day before", what: "Reminder to approved guests. Cael gives me one line on each: who they are, what they're building, who they should meet." },
  { at: "0:00", what: "Doors and check-in. Hosts greet first-timers by name and point them at one person to talk to." },
  { at: "0:20", what: "Welcome, five minutes: what MakersLounge is and how the night runs." },
  { at: "0:30", what: "Demos. A few builders, five minutes each, one question from the room each." },
  { at: "1:10", what: "Open floor. Hosts make introductions from the who-should-meet list." },
  { at: "2:15", what: "Last call. Everyone names one person they'll follow up with." },
  { at: "2:30", what: "Close." },
  { at: "Within 48 hours", what: "A personal follow-up to everyone who came. Template below." },
];

const SEATS = 30;

const FOLLOW_UP_TEMPLATE = `Subject: Good to meet you at {event}

Hi {first name},

Thanks for coming to {event} on {day}. You said you're building {what they told us at registration}.

{One specific thing from the night, or one person to meet: "You should talk to {name}, who's working on {their project}."}

The next one is {next event} on {date}: {link}

Robert`;

export default async function MakersLoungePlaybookPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (slug !== SLUG) notFound();

  return (
    <article className="mx-auto max-w-3xl px-6 py-12">
      <SiteLink
        href={`/work/${SLUG}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeftIcon className="size-3.5" />
        MakersLounge case study
      </SiteLink>

      <header className="mt-10">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Free playbook</p>
        <h1 className="font-display mt-4 text-4xl leading-[1.05] font-medium tracking-tight sm:text-6xl">{TITLE}</h1>
        <p className="mt-5 font-serif text-xl leading-relaxed text-muted-foreground sm:text-2xl">
          How I run builder events in Toronto, written down so you can copy it. Every rule comes from the
          check-in data, not the signup count.
        </p>

        <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {FACTS.map((f, i) => (
            <div key={f.label} className={cn("rounded-2xl px-4 py-4", TINTS[i % TINTS.length])}>
              <dd className="font-display text-3xl font-medium tracking-tight">{f.value}</dd>
              <dt className="mt-1 text-sm leading-snug text-foreground/70">{f.label}</dt>
            </div>
          ))}
        </dl>

        <nav aria-label="On this page" className="mt-8">
          <ul className="flex flex-wrap gap-2">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="inline-block rounded-full bg-muted px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <Section id="formats" kicker="1" title="Four formats, four jobs">
        <p>
          Same community, same city, very different show-up. Pick the format for the job, not the other way
          round. Show-up is the share of approved guests who checked in.
        </p>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {FORMATS.map((f, i) => (
            <li key={f.name} className={cn("flex flex-col rounded-3xl p-6", TINTS[(i + 1) % TINTS.length])}>
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-display text-2xl font-medium tracking-tight">{f.name}</h3>
                <span className="font-mono text-sm tabular-nums text-foreground/70">
                  {f.showUp === null ? "online" : `${Math.round(f.showUp * 100)}% show-up`}
                </span>
              </div>
              <p className="mt-3 font-serif text-lg leading-snug">{f.job}</p>
              <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.16em] text-foreground/60">Use it when</p>
              <p className="mt-1 text-[15px] leading-relaxed">{f.when}</p>
              <p className="mt-4 text-sm leading-relaxed text-foreground/70">{f.note}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="run-of-show" kicker="2" title="Run-of-show for a meetup night">
        <p>
          Two and a half hours in the room, plus the work either side. A first-timer should know what happens
          next; a regular should get something new.
        </p>
        <ol className="mt-6 flex flex-col">
          {RUN_OF_SHOW.map((step) => (
            <li key={step.at} className="grid grid-cols-[7.5rem_1fr] gap-4 border-t border-border/60 py-4 sm:grid-cols-[9rem_1fr]">
              <span className="font-mono text-sm tabular-nums text-primary">{step.at}</span>
              <span className="text-[15px] leading-relaxed">{step.what}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="approval-rule" kicker="3" title="The approval rule">
        <p>
          <strong>Approve every registration by hand.</strong>{" "}The room is the product, so who gets in is a
          host&apos;s call. An agent can rank people. It can&apos;t host.
        </p>
        <p>
          Then approve for the room you want, not the seats you have: <strong>approve about seats ÷ show-up
          rate.</strong>{" "}For a {SEATS}-seat room:
        </p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-3">
          {(
            [
              ["Workshop", SHOW_UP.workshop, "about 1.25×"],
              ["Meetup", SHOW_UP.meetup, "about 3×"],
              ["Hackathon", SHOW_UP.hackathon, "about 5×"],
            ] as const
          ).map(([name, rate, multiple], i) => (
            <li key={name} className={cn("rounded-2xl p-5", TINTS[(i + 3) % TINTS.length])}>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-foreground/60">{name}</p>
              <p className="font-display mt-2 text-3xl font-medium tracking-tight">
                Approve {Math.round(SEATS / rate)}
              </p>
              <p className="mt-1 text-sm text-foreground/70">
                {Math.round(rate * 100)}% show-up, {multiple} the seats
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="follow-up" kicker="4" title="The 48-hour follow-up">
        <p>
          Everyone who checked in gets a personal note within 48 hours, while they still remember the night.
          Cael drafts each one from what the person told us when they registered. I read it, fix it, and send it
          myself: my name, my click. Each follow-up becomes a task tagged with the event, so when a chat turns
          into something real I can trace it back to the night it started.
        </p>
        <figure className="mt-6 rounded-3xl bg-[var(--tint-3)] p-6">
          <figcaption className="font-mono text-[11px] uppercase tracking-[0.16em] text-foreground/60">
            Template
          </figcaption>
          <pre className="mt-3 font-mono text-sm leading-relaxed whitespace-pre-wrap">{FOLLOW_UP_TEMPLATE}</pre>
        </figure>
        <p>
          The one specific thing is the whole point. If you can&apos;t write it, you didn&apos;t talk to them,
          and that&apos;s worth knowing too.
        </p>
      </Section>

      <Section id="fund-or-cut" kicker="5" title="Fund or cut">
        <p>
          <strong>Fund a format by who walks in, not who signs up.</strong>{" "}Signups are free to give, so they
          reward the wrong thing.
        </p>
        <ol className="mt-6 flex flex-col gap-3">
          {[
            ["Fund first", "Workshops. Four in five approved people show up."],
            ["Keep cheap", "Meetups. They're the front door, so keep them running on a small budget."],
            ["Partner only", "Hackathons. Run one when a sponsor wants the builders and helps cover the night."],
            ["Cut", "Any format under 25% show-up two events in a row gets cut or redesigned. Hackathons sit under that line today, which is why they only run with a partner."],
          ].map(([label, text], i) => (
            <li key={label} className={cn("rounded-2xl p-5", TINTS[(i + 4) % TINTS.length])}>
              <p className="font-display text-xl font-medium tracking-tight">{label}</p>
              <p className="mt-1 text-[15px] leading-relaxed">{text}</p>
            </li>
          ))}
        </ol>
      </Section>

      <p className="mt-14 font-serif text-lg leading-relaxed text-muted-foreground">
        The numbers behind every rule, and the story of how the program grew, are in the{" "}
        <SiteLink
          href={`/work/${SLUG}`}
          className="text-foreground underline decoration-primary decoration-2 underline-offset-4"
        >
          MakersLounge case study
        </SiteLink>
        .
      </p>

      <PostFooterCta />
    </article>
  );
}

function Section({
  id,
  kicker,
  title,
  children,
}: {
  id: string;
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-16 scroll-mt-24">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">{kicker}</p>
      <h2 className="font-display mt-2 text-3xl leading-tight font-medium tracking-tight sm:text-4xl">{title}</h2>
      <div className="mt-4 font-serif text-lg leading-relaxed text-foreground/90 [&>p+p]:mt-4 [&>p]:mt-4">
        {children}
      </div>
    </section>
  );
}
