"use client";

import ChatIcon from "./ChatIcon";
import { Dispatch, SetStateAction } from "react";

interface SummarySection {
  heading?: string | null;
  text: string;
  bullet?: boolean;
  timestamp: number | null;
}

interface SummaryFrameProps {
  setActiveDisplay: Dispatch<SetStateAction<string>>;
  halfHeight?: boolean;
  summary: string;
  summarySections?: SummarySection[];
  onTimestampClick?: (timestamp: number) => void;
  /** When set, show a loading skeleton with this message instead of the summary */
  placeholder?: string | null;
}

export default function SummaryFrame({
  setActiveDisplay,
  halfHeight = false,
  summary,
  summarySections = [],
  onTimestampClick,
  placeholder = null,
}: SummaryFrameProps) {
  const parseToJSX = (htmlString: string, inline = false) => {
    const parts = htmlString.split(/(<b>.*?<\/b>)/g);
    const Wrapper = inline ? "span" : "div";

    return (
      <Wrapper className={inline ? "" : "w-full min-w-0"}>
        {parts.map((part, index) => {
          if (part.startsWith("<b>") && part.endsWith("</b>")) {
            return <b key={index}>{part.replace(/<b>|<\/b>/g, "")}</b>;
          }
          return <span key={index}>{part}</span>;
        })}
      </Wrapper>
    );
  };

  const formatTimestamp = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  return (
    <div className="relative flex h-full w-full">
      {!halfHeight && (
        <div className="absolute right-3 bottom-3 z-40">
          <button onClick={() => setActiveDisplay("half")} aria-label="Open chat">
            <ChatIcon />
          </button>
        </div>
      )}
      <div
        className="surface relative mt-10 w-full max-h-[84vmax] overflow-auto rounded-2xl text-foreground"
        style={{ scrollbarColor: "#ffffff9f #ffffff0f" }}
      >
        <h1 className="flex items-start justify-center pt-8 text-lg font-medium">
          Summary
        </h1>
        <div className="w-full px-8 pt-4 pb-8">
          {placeholder ? (
            <div className="flex w-full flex-col gap-4" aria-busy="true">
              <p className="text-center text-[16px] text-white/70">{placeholder}</p>
              {[92, 78, 85, 60, 88, 70, 80, 55].map((width, i) => (
                <div
                  key={i}
                  className="h-4 animate-pulse rounded-full bg-white/10"
                  style={{ width: `${width}%` }}
                />
              ))}
            </div>
          ) : summarySections.length > 0 ? (
            <div className="flex w-full min-w-0 flex-col gap-7">
              {summarySections.map((section, index) => (
                <div key={`${section.timestamp ?? "none"}-${index}`} className="w-full min-w-0">
                  {section.heading && (
                    <div className="mb-3 w-full min-w-0 text-[18px] font-semibold leading-8">
                      {parseToJSX(section.heading)}
                    </div>
                  )}
                  <div className="w-full min-w-0 text-[18px] leading-[1.8]">
                    {section.bullet ? (
                      <div className="w-full min-w-0">
                        <span className="align-top text-white/95">- </span>
                        <span className="min-w-0 align-top">
                          {parseToJSX(section.text, true)}
                          {typeof section.timestamp === "number" && onTimestampClick && (
                            <button
                              type="button"
                              onClick={() => {
                                const t = section.timestamp;
                                if (typeof t === "number") onTimestampClick(t);
                              }}
                              className="ml-2 inline-flex h-8 min-w-[4.5rem] items-center justify-center rounded-[10px] border border-white/8 bg-pill px-2.5 align-middle text-sm font-medium leading-none text-foreground transition-colors hover:bg-muted"
                            >
                              {formatTimestamp(section.timestamp)}
                            </button>
                          )}
                        </span>
                      </div>
                    ) : (
                      parseToJSX(section.text)
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="w-full min-w-0 whitespace-pre-wrap text-[18px] leading-[1.8]">
              {parseToJSX(summary)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
