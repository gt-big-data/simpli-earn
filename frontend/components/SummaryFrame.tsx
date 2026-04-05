"use client";

import Image from "next/image";
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
}

export default function SummaryFrame({
  setActiveDisplay,
  halfHeight = false,
  summary,
  summarySections = [],
  onTimestampClick,
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
        <>
          <div
            className="absolute -right-[1px] -bottom-[1px] z-40 flex items-end"
            style={{ shapeOutside: "inset(calc(100% - 110px) 0 0)" }}
          >
            <Image src="/inset-corner.svg" alt="" width={144} height={144} />
          </div>
          <div className="absolute bottom-0 right-0">
            <button onClick={() => setActiveDisplay("half")}>
              <ChatIcon />
            </button>
          </div>
        </>
      )}
      <div
        className="relative mt-[40px] max-h-[84vmax] w-full overflow-auto rounded-[30px] border border-white/25 bg-white/4 font-montserrat text-white"
        style={{ scrollbarColor: "#ffffff9f #ffffff0f" }}
      >
        <h1 className="flex justify-center items-start pt-8 font-bold text-lg font-montserrat">
          Summary
        </h1>
        <div className="w-full px-8 pt-4 pb-8">
          {summarySections.length > 0 ? (
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
                              onClick={() => onTimestampClick(section.timestamp)}
                              className="ml-2 inline-flex h-[40px] min-w-[78px] items-center justify-center rounded-full border border-white/20 bg-[#232323] px-4 align-middle text-[18px] font-medium leading-none text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:bg-[#2d2d2d]"
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
