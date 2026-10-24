"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  AtSignIcon,
  BriefcaseIcon,
  CalendarIcon,
  CodeIcon,
  DumbbellIcon,
  HomeIcon,
  MailIcon,
  MessageCircleIcon,
  MicIcon,
  MoonIcon,
  PenLineIcon,
  SparklesIcon,
  SunIcon,
  UserIcon,
  WrenchIcon,
} from "lucide-react";
import { CommandPalette, type PaletteGroup, type PaletteItem } from "@/app/_components/command-palette";
import { usePaletteHotkey } from "@/app/_components/use-palette-hotkey";
import { BOOKING_URL, CHANNELS } from "@/lib/public-site";
import { useSiteHref } from "./site-link";

type Icon = typeof HomeIcon;

// The header links plus the pages that only the footer reaches.
const PAGES: { href: string; label: string; icon: Icon; keywords?: string[] }[] = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/about", label: "About", icon: UserIcon, keywords: ["bio", "berto", "story"] },
  { href: "/work", label: "Work", icon: BriefcaseIcon, keywords: ["case studies", "projects", "clients"] },
  { href: "/capabilities", label: "Capabilities", icon: SparklesIcon, keywords: ["skills", "services", "what i do"] },
  { href: "/writing", label: "Writing", icon: PenLineIcon, keywords: ["blog", "posts", "articles", "essays"] },
  { href: "/podcast", label: "Podcast", icon: MicIcon, keywords: ["episodes", "youtube", "spotify"] },
  { href: "/fitness", label: "Fitness", icon: DumbbellIcon, keywords: ["training", "hyrox", "running"] },
  { href: "/chat", label: "Ask Cael", icon: MessageCircleIcon, keywords: ["agent", "ai", "question"] },
  { href: "/building", label: "Building", icon: WrenchIcon, keywords: ["projects", "makerslounge", "side"] },
  { href: "/newsletter", label: "Newsletter", icon: MailIcon, keywords: ["subscribe", "email"] },
];

/** What /api/site/search returns: everything on the site with its own page. */
interface SiteIndex {
  posts: { title: string; href: string; date: string; external: boolean }[];
  episodes: { title: string; href: string; date: string }[];
  work: { title: string; href: string; org?: string; year?: string }[];
}

const EMPTY: SiteIndex = { posts: [], episodes: [], work: [] };

function year(iso: string | undefined): string | undefined {
  return iso && /^\d{4}/.test(iso) ? iso.slice(0, 4) : undefined;
}

/**
 * `/` or ⌘K anywhere on bertomill.com: the pages, every post, episode and piece
 * of work by title, and the ways to reach Berto. The content index is one fetch
 * the first time it opens, cached by the CDN (see app/api/site/search).
 */
export function SiteCommandPalette() {
  const router = useRouter();
  const siteHref = useSiteHref();
  const { resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  usePaletteHotkey(setOpen);

  const [index, setIndex] = useState<SiteIndex | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open || index) return;
    let cancelled = false;
    setLoading(true);
    fetch("/api/site/search")
      .then((res) => (res.ok ? (res.json() as Promise<SiteIndex>) : EMPTY))
      .catch(() => EMPTY)
      .then((next) => {
        if (cancelled) return;
        setIndex(next);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, index]);

  const groups = useMemo<PaletteGroup[]>(() => {
    const go = (href: string) => () => router.push(siteHref(href));
    const away = (href: string) => () => {
      if (href.startsWith("mailto:")) window.location.href = href;
      else window.open(href, "_blank", "noopener,noreferrer");
    };
    const dark = resolvedTheme === "dark";

    const pages: PaletteItem[] = PAGES.map((p) => ({
      id: `page:${p.href}`,
      label: p.label,
      icon: <p.icon />,
      keywords: p.keywords,
      onSelect: go(p.href),
    }));

    const reach: PaletteItem[] = [
      { id: "reach:book", label: "Book a meeting", icon: <CalendarIcon />, keywords: ["call", "calendar", "talk"], external: true, onSelect: away(BOOKING_URL) },
      { id: "reach:email", label: "Email Berto", icon: <MailIcon />, keywords: ["contact", "mail"], onSelect: away("mailto:berto@bertomill.com") },
      { id: "reach:github", label: "GitHub", icon: <CodeIcon />, keywords: ["code", "repos"], external: true, onSelect: away("https://github.com/bertovmill") },
      ...CHANNELS.map((c) => ({
        id: `reach:${c.href}`,
        label: c.label,
        icon: <AtSignIcon />,
        keywords: ["follow", "social"],
        external: true,
        onSelect: away(c.href),
      })),
      {
        id: "action:theme",
        label: dark ? "Switch to light mode" : "Switch to dark mode",
        icon: dark ? <SunIcon /> : <MoonIcon />,
        keywords: ["theme", "appearance", "dark", "light"],
        onSelect: () => setTheme(dark ? "light" : "dark"),
      },
    ];

    const posts: PaletteItem[] = (index?.posts ?? []).map((p) => ({
      id: `post:${p.href}`,
      label: p.title,
      hint: p.external ? "Substack" : year(p.date),
      icon: <PenLineIcon />,
      external: p.external,
      onSelect: p.external ? away(p.href) : go(p.href),
    }));

    const episodes: PaletteItem[] = (index?.episodes ?? []).map((e) => ({
      id: `episode:${e.href}`,
      label: e.title,
      hint: year(e.date),
      icon: <MicIcon />,
      onSelect: go(e.href),
    }));

    const work: PaletteItem[] = (index?.work ?? []).map((w) => ({
      id: `work:${w.href}`,
      label: w.title,
      hint: w.year,
      icon: <BriefcaseIcon />,
      keywords: w.org ? [w.org] : undefined,
      onSelect: go(w.href),
    }));

    return [
      { heading: "Pages", items: pages },
      { heading: "Writing", items: posts, whenTyping: true },
      { heading: "Podcast", items: episodes, whenTyping: true },
      { heading: "Work", items: work, whenTyping: true },
      { heading: "Reach Berto", items: reach },
    ];
  }, [index, router, siteHref, resolvedTheme, setTheme]);

  return (
    <CommandPalette
      open={open}
      onOpenChange={setOpen}
      groups={groups}
      placeholder="Search the site…"
      loading={loading && !index}
      title="Search the site"
    />
  );
}
