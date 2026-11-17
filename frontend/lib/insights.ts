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

export const mentionMarketsInsight: Insight = {
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
};

export const colaAiRmrInsight: Insight = {
  slug: "cola-ai-rmr",
  title: "Three Signals Before Switching Between Coca-Cola and AI Stocks",
  description: "We traced 28 stocks through the Coca-Cola and NVIDIA networks. Could three rebound signals tell us when to switch between them?",
  image: "/images/insights/cola-ai-rmr.webp",
  href: "/research/cola-ai-rmr",
  date: "2026-11-15",
  authors: [
    {
      name: "Yuyang (Michael) Lin",
      linkedin: "https://www.linkedin.com/in/yuyang-lin3",
    },
  ],
};

export const insights: Insight[] = [colaAiRmrInsight, mentionMarketsInsight];

export function formatInsightDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
