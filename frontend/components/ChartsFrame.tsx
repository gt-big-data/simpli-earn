"use client";

import { useState } from "react";
import SentimentGraph from "./SentimentGraph";
import StockChart from "./StockChart";
import { useSearchParams } from "next/navigation";
import { teslaData } from "../app/sentiment-data/tesla";
import { appleData } from "../app/sentiment-data/apple";
import { googleData } from "../app/sentiment-data/google";
import { shellData } from "../app/sentiment-data/shell";
import { cvsData } from "../app/sentiment-data/cvs";
import { walmartData } from "../app/sentiment-data/walmart";

// Dashboard configurations
const dashboardConfigs: Record<string, { ticker: string; date: string; sentimentData: Record<string, number> }> = {
  "1": { ticker: "AAPL", date: "2/2/25", sentimentData: appleData },
  "2": { ticker: "CVS", date: "11/6/24", sentimentData: cvsData },
  "3": { ticker: "GOOGL", date: "2/4/25", sentimentData: googleData },
  "4": { ticker: "SHEL", date: "1/30/25", sentimentData: shellData },
  "5": { ticker: "TSLA", date: "1/29/25", sentimentData: teslaData },
  "6": { ticker: "WMT", date: "2/20/25", sentimentData: walmartData }
};

interface ChartsFrameSentimentGraphProps {
  onTimestampClick: (timestamp: number) => void; // Callback to update video timestamp
}

export default function ChartsFrame({ onTimestampClick }: ChartsFrameSentimentGraphProps) {
  const [activeTab, setActiveTab] = useState("stock");
  const searchParams = useSearchParams();
  const dashboardId = searchParams.get("id");
  const config = dashboardId ? dashboardConfigs[dashboardId] : null;

  const renderTabs = () => {
    const isStock = activeTab === "stock";
    const isSentiment = activeTab === "sentiment";

    return (
      <div className="flex flex-row relative w-full">
        {/* Stock/Indicators Tab */}
        <button
          className={`flex justify-center items-center rounded-tl-[30px] ${
            isStock ? "rounded-tr-[23px]" : "rounded-br-[23px]"
          } w-1/2 h-[40px] ${
            isStock ? "border-t-[1px]" : "border-b-[1px]"
          } border-white/25 cursor-pointer relative`}
          onClick={() => setActiveTab("stock")}
        >
          <h1 className={`flex justify-center items-center font-bold text-xs font-montserrat w-full h-full ${
            isStock ? "" : "opacity-50"
          }`}>
            Indicators
          </h1>
        </button>

        {/* Sentiment Tab */}
        <button
          className={`flex justify-center items-center rounded-tr-[30px] ${
            isSentiment ? "rounded-tl-[23px]" : "rounded-tl-[23px]"
          } ${
            isSentiment ? "border-t-[1px]" : "border-b-[1px]"
          } border-white/25 cursor-pointer relative w-1/2 h-[40px]`}
          onClick={() => setActiveTab("sentiment")}
        >
          <h1 className={`flex justify-center items-center font-bold text-xs font-montserrat w-full h-full ${
            isSentiment ? "" : "opacity-50"
          }`}>
            Sentiment
          </h1>
        </button>

        {/* Divider */}
        <div className="absolute top-1/2 left-1/2 w-[0.5px] h-[18px] bg-white/12 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none transform rotate-20"></div>
      </div>
    );
  };

  return (
    <div className="flex flex-col text-white w-full h-full max-h-120">
      <div className="bg-white/4 text-white rounded-[30px] w-full h-full border border-white/25 overflow-hidden">
        {renderTabs()}
        
        <div className="flex justify-center items-center w-full h-full overflow-hidden">
          {activeTab === "stock" && (
            <>
              {config ? (
                <StockChart ticker={config.ticker} date={config.date} />
              ) : (
                <div className="text-center text-white/70">
                  <p className="text-lg font-medium">Unable to display stock chart</p>
                  <p className="text-sm mt-2">Please select a valid dashboard</p>
                </div>
              )}
            </>
          )}
          
          {activeTab === "sentiment" && (
            <>
              {config ? (
                <SentimentGraph sentimentData={config.sentimentData} onTimestampClick={onTimestampClick} />
              ) : (
                <div className="text-center text-white/70">
                  <p className="text-lg font-medium">Unable to display sentiment data</p>
                  <p className="text-sm mt-2">Please select a valid dashboard</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}