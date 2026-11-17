import { formatInsightDate, type Insight } from "@/lib/insights";

export default function InsightByline({ authors, date }: Pick<Insight, "authors" | "date">) {
  return (
    <>
      <p className="text-sm">
        {authors.map((author, index) => (
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
      <time dateTime={date} className="mt-1 block text-sm text-muted-foreground">{formatInsightDate(date)}</time>
    </>
  );
}
