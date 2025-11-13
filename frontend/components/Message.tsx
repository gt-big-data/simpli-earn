import SuggestionChips from "./SuggestionChips";

interface MessageProps {
    sender: string;
    text: string;
    suggestions?: string[];
    onSuggestionClick?: (suggestion: string) => void;
}

export default function Message({ sender, text, suggestions, onSuggestionClick }: MessageProps) {
    if (sender === 'user') {
        return (
            <div className="w-full flex justify-end mt-5">
                <div className="whitespace-pre-line max-w-[80%] px-3 py-2 bg-white/4 text-white rounded-t-2xl rounded-bl-2xl border-[0.85px] border-white/25">{text}</div>
            </div>
        );
    }
    return (
        <div className="mt-5">
            <p className="whitespace-pre-line">{text}</p>
            {suggestions && suggestions.length > 0 && onSuggestionClick && (
                <SuggestionChips
                    suggestions={suggestions}
                    onSuggestionClick={onSuggestionClick}
                />
            )}
        </div>
    );

}
