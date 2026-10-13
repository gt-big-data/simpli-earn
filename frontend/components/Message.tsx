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
                <div className="surface max-w-[80%] whitespace-pre-line rounded-2xl rounded-br-md px-3 py-2 text-sm text-foreground">{text}</div>
            </div>
        );
    }
    return (
        <div className="mt-5">
            <p className="whitespace-pre-line text-sm text-foreground">{text}</p>
            {suggestions && suggestions.length > 0 && onSuggestionClick && (
                <SuggestionChips
                    suggestions={suggestions}
                    onSuggestionClick={onSuggestionClick}
                />
            )}
        </div>
    );

}
