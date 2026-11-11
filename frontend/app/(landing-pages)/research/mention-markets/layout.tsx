import "katex/dist/katex.min.css";
import MentionLabNav from "@/components/mention-lab/MentionLabNav";
import { findings } from "@/lib/mention-lab/data";
import { formatInsightDate, insights } from "@/lib/insights";

export default function MentionMarketsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const post = insights.find((item) => item.slug === "mention-markets");
  const markets = findings.kalshi;

  return (
    <div className="pt-32">
      {post && (
        <header className="mx-auto max-w-6xl px-5">
          <div className="max-w-3xl">
          <h1 className="mb-4 text-5xl leading-[1.05] font-light tracking-tight">{post.title}</h1>
          <div className="mb-5">
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
          <p className="text-lg leading-relaxed text-muted-foreground">
            Across {markets.markets.toLocaleString()} Kalshi markets on {markets.events} earnings calls, YES settles about 4 points less often
            than it is priced. Taking the other side doesn&rsquo;t pay after fees. Quoting it does. Three pieces of mathematics explain why.
          </p>
          </div>
        </header>
      )}
      <MentionLabNav />
      {children}
    </div>
  );
}
