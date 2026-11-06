import type { Metadata } from "next";
import { formatDate } from "@/lib/content";
import { listLessons } from "@/lib/learning";
import { SiteLink } from "../_components/site-link";
import { ConcreteWall } from "../_components/concrete-wall/concrete-wall";

export const metadata: Metadata = {
  title: "Learning",
  description:
    "Short lessons on things I just picked up while building, each with a quiz so you can check you got it too.",
};

export default function LearningIndexPage() {
  const lessons = listLessons();
  return (
    <div className="mx-auto max-w-3xl px-6">
      <div className="relative isolate -mt-[4.5rem] pt-[4.5rem]">
        <ConcreteWall />
        <section className="py-16 sm:py-24">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Learning</h1>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
            Every time I pick up something new while building, I write a short overview and a
            quiz to prove to myself I understood it. Take the quiz too, then post your score.
          </p>
        </section>
      </div>

      <section className="py-8">
        <ul className="divide-y divide-border/60">
          {lessons.map((lesson) => (
            <li key={lesson.slug}>
              <SiteLink href={`/learning/${lesson.slug}`} className="group block py-6">
                <div className="flex items-baseline gap-4">
                  <h2 className="text-lg font-medium tracking-tight transition-colors group-hover:text-primary">
                    {lesson.title}
                  </h2>
                  <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
                    {formatDate(lesson.date)}
                  </span>
                </div>
                <p className="mt-2 leading-relaxed text-muted-foreground">{lesson.summary}</p>
                <p className="mt-3 font-mono text-xs text-muted-foreground">
                  {lesson.quiz.length} question quiz
                </p>
              </SiteLink>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
