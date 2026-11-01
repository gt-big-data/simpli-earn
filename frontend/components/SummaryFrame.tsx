"use client";

import ChatIcon from "./ChatIcon";

interface SummarySection {
  heading?: string | null;
  text: string;
  bullet?: boolean;
  timestamp: number | null;
}

interface SummaryFrameProps {
  onOpenChat: () => void;
  halfHeight?: boolean;
  summary: string;
  summarySections?: SummarySection[];
  onTimestampClick?: (timestamp: number) => void;
  /** When set, show a loading skeleton with this message instead of the summary */
  placeholder?: string | null;
}

export default function SummaryFrame({
  onOpenChat,
  halfHeight = false,
  summary,
  summarySections = [],
  onTimestampClick,
  placeholder = null,
}: SummaryFrameProps) {
  // Renders the model's markdown bold (**text**) as <b>. Applied to headings, bullet text and
  // the plain summary alike; any unpaired ** left over from generation is dropped.
  const parseToJSX = (markdown: string, inline = false) => {
    const parts = markdown.split(/(\*\*.+?\*\*)/g);
    const Wrapper = inline ? "span" : "div";

    return (
      <Wrapper className={inline ? "" : "w-full min-w-0"}>
        {parts.map((part, index) => {
          if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) {
            return <b key={index}>{part.slice(2, -2)}</b>;
          }
          return <span key={index}>{part.replaceAll("**", "")}</span>;
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
          {/* Same pill styling and hover as the timestamp buttons, so it reads as clickable */}
          <button
            type="button"
            onClick={onOpenChat}
            aria-label="Open chat"
            title="Open SimpliChat"
            className="flex size-12 cursor-pointer items-center justify-center rounded-2xl border border-white/8 bg-pill text-brand transition-[background-color,border-color,transform] duration-150 hover:border-brand/50 hover:bg-accent active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none"
          >
            <ChatIcon />
          </button>
        </div>
      )}
      <div className="surface relative flex w-full min-h-0 flex-col overflow-hidden rounded-2xl text-foreground">
        {/* Pinned header, same padding and title style as the SimpliChat panel */}
        <div className="panel-header justify-center">
          <h1 className="text-lg font-medium">Summary</h1>
        </div>
        <div
          className="min-h-0 w-full flex-1 overflow-auto px-8 pb-8"
          style={{ scrollbarColor: "#ffffff9f #ffffff0f" }}
        >
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
                              title="Jump to this moment in the video"
                              aria-label={`Jump to ${formatTimestamp(section.timestamp)} in the video`}
                              className="ml-2 inline-flex h-8 min-w-[4.5rem] cursor-pointer items-center justify-center rounded-[10px] border border-white/8 bg-pill px-2.5 align-middle text-sm font-medium leading-none text-foreground transition-[background-color,border-color,color,transform] duration-150 hover:border-brand/50 hover:bg-accent hover:text-brand active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none"
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
