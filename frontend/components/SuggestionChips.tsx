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
          className="cursor-pointer whitespace-normal rounded-[10px] border border-white/8 bg-pill px-2.5 py-1 text-left text-xs text-foreground transition-colors hover:bg-muted"
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}
