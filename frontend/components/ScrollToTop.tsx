"use client";

import { useEffect, useState } from "react";
import { ChevronUp } from "lucide-react";

export default function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setVisible(window.scrollY > 400);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <button
      onClick={scrollToTop}
      aria-label="Scroll to top"
      className={`fixed bottom-5 left-1/2 z-50 flex size-8 -translate-x-1/2 items-center justify-center rounded-lg border border-white/8 bg-[rgba(17,20,19,0.72)] text-brand backdrop-blur-xl transition-opacity ${
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <ChevronUp className="size-4" />
    </button>
  );
}
