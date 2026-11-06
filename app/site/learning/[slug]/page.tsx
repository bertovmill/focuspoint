import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, ArrowUpRightIcon } from "lucide-react";
import { formatDate } from "@/lib/content";
import { getLesson, listLessons } from "@/lib/learning";
import { PUBLIC_SITE_URL } from "@/lib/posts";
import { Prose } from "../../_components/prose";
import { SiteLink } from "../../_components/site-link";
import { LessonQuiz } from "../_components/lesson-quiz";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return listLessons().map((l) => ({ slug: l.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const lesson = getLesson(slug);
  if (!lesson) return { title: "Not found" };
  return {
    title: `${lesson.title} · Learning`,
    description: lesson.summary,
    alternates: { canonical: `/learning/${lesson.slug}` },
    openGraph: { title: lesson.title, description: lesson.summary, type: "article", url: `/learning/${lesson.slug}` },
    twitter: { card: "summary", creator: "@robrt_mill" },
  };
}

export default async function LessonPage({ params }: Props) {
  const { slug } = await params;
  const lesson = getLesson(slug);
  if (!lesson) notFound();
  const shareUrl = `${PUBLIC_SITE_URL}/learning/${lesson.slug}`;

  return (
    <article className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
      <SiteLink
        href="/learning"
        className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeftIcon className="size-3.5" /> Learning
      </SiteLink>

      <header className="mt-8">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{lesson.title}</h1>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{lesson.summary}</p>
        <p className="mt-4 font-mono text-xs text-muted-foreground">
          Learned {formatDate(lesson.date)}
          {lesson.source && (
            <>
              {" · "}
              <a
                href={lesson.source.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 underline underline-offset-4 hover:text-primary"
              >
                {lesson.source.label} <ArrowUpRightIcon className="size-3" />
              </a>
            </>
          )}
        </p>
      </header>

      <section id="overview" className="mt-10">
        <Prose>{lesson.overview}</Prose>
      </section>

      <section id="quiz" className="mt-14 scroll-mt-24">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Quiz</p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight">Did you get it?</h2>
        <p className="mt-2 text-muted-foreground">
          {lesson.quiz.length} questions, instant feedback. Get them all and post your score.
        </p>
        <LessonQuiz title={lesson.title} questions={lesson.quiz} shareUrl={shareUrl} />
      </section>
    </article>
  );
}
