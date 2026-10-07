import { Metadata } from "next";

const faqs = [
  {
    question: "How do I get started?",
    answer: "Press Try Now! Or go to Home and paste in a YouTube link of an earnings call.",
  },
  {
    question: "What are the key features?",
    answer: "SimpliEarn offers a range of features including a clear, beginner-friendly summary of each earnings call with hoverable definitions for financial terms. A time-linked transcript allows users to jump to specific moments in the video. The platform includes a sentiment visualization chart showing emotion changes over time, based on both voice and text analysis. Users can also view a 48-hour stock price chart following the call and interact with a RAG-powered chatbot that answers personalized questions using the content of the call. Users can input a YouTube link of an earnings call or choose from a list of past calls for on-demand analysis.",
  },
  {
    question: "What makes SimpliEarn unique?",
    answer: "SimpliEarn is built specifically for novice investors who may feel overwhelmed by traditional financial reports. Unlike existing tools, it simplifies complex terminology, provides sentiment analysis across both audio and text, and integrates educational elements into a single dashboard. Its interactive chatbot makes learning more engaging, and there are no current products that offer this type of user-friendly earnings call analysis.",
  },
  {
    question: "Who is SimpliEarn for?",
    answer: "SimpliEarn is for retail investors, new traders, and anyone looking to build business and financial literacy. It's ideal for those who want to understand a company's performance without needing a background in finance.",
  },
];

export const metadata: Metadata = {
  title: "FAQ | SimpliEarn",
};

export default function FAQ() {
  return (
    <div className="min-h-screen text-foreground">
      <div className="mx-auto max-w-3xl px-5 pt-32 pb-16">
        <h1 className="mb-10 text-center text-5xl font-light tracking-tight">FAQ</h1>
        <div>
          {faqs.map((faq) => (
            <div key={faq.question} className="mb-5 border-b border-white/8 pb-5">
              <h3 className="mb-2 text-lg font-medium text-brand">{faq.question}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{faq.answer}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
