export type InsightAuthor = {
  name: string;
  linkedin: string;
};

export type Insight = {
  slug: string;
  title: string;
  description: string;
  image: string;
  href: string;
  date: string;
  authors: InsightAuthor[];
};

export const insights: Insight[] = [
  {
    slug: "mention-markets",
    title: "People Overpay for the Chance a CEO Says a Word",
    description: "Why Kalshi mention markets overprice the chance a CEO says a word.",
    image: "/images/insights/mention-markets.svg",
    href: "/research/mention-markets",
    date: "2026-11-11",
    authors: [
      {
        name: "Sanjay Mavalli",
        linkedin: "https://www.linkedin.com/in/sanjay-mavalli-912062322",
      },
    ],
  },
];

export function formatInsightDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
