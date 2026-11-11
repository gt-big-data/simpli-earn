import type { Metadata } from "next";
import Link from "next/link";
import { formatInsightDate, insights } from "@/lib/insights";

export const metadata: Metadata = {
  title: "Research | SimpliEarn",
  description: "Our insights on the markets, models, and the future.",
};

export default function ResearchPage() {
  return (
    <div className="mx-auto min-h-screen max-w-6xl px-5 pt-32 pb-20">
      <header className="mb-10 max-w-3xl">
        <h1 className="mb-4 text-5xl font-light tracking-tight">Research</h1>
        <p className="text-lg leading-relaxed text-muted-foreground">Our insights on the markets, models, and the future.</p>
      </header>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {insights.map((post) => (
          <article
            key={post.slug}
            className="surface group relative flex min-h-80 flex-col justify-end overflow-hidden rounded-2xl bg-cover bg-center"
            style={{ backgroundImage: `url(${post.image})` }}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/20 transition-colors group-hover:from-black/90" />
            <Link href={post.href} className="absolute inset-0 z-10" aria-label={post.title} />
            <div className="pointer-events-none relative z-20 flex flex-col gap-2 p-5">
              <h2 className="text-2xl leading-tight font-light tracking-tight text-foreground">{post.title}</h2>
              <div className="pointer-events-auto">
                <p className="text-sm">
                  {post.authors.map((author, index) => (
                    <span key={author.linkedin}>
                      {index > 0 && ", "}
                      <a
                        href={author.linkedin}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand no-underline hover:text-foreground"
                      >
                        {author.name}
                      </a>
                    </span>
                  ))}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{formatInsightDate(post.date)}</p>
              </div>
              <p className="text-sm leading-relaxed text-foreground/85">{post.description}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
