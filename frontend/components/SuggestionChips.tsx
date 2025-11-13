"use client";

interface SuggestionChipsProps {
  suggestions: string[];
  onSuggestionClick: (suggestion: string) => void;
}

export default function SuggestionChips({
  suggestions,
  onSuggestionClick,
}: SuggestionChipsProps) {
  if (!suggestions || suggestions.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {suggestions.map((suggestion, index) => (
        <button
          key={index}
          onClick={() => onSuggestionClick(suggestion)}
          className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/25 hover:border-white/35
                     text-white text-sm rounded-full transition-all duration-200
                     hover:scale-[0.98] active:scale-95 cursor-pointer
                     whitespace-normal text-left"
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}
