from transformers import pipeline

# Load once globally for efficiency
classifier = pipeline("sentiment-analysis", model="soleimanian/roberta-large")

def analyze_sentiment(matched_sentences):
    """
    Runs sentiment analysis on each sentence and returns augmented data.

    Args:
        matched_sentences (List[dict]): Each sentence with start_time and end_time.

    Returns:
        List[dict]: Original sentence dict + sentiment analysis results.
    """
    results = []

    for item in matched_sentences:
        sentence = item["sentence"]
        try:
            result = classifier(sentence)[0]
            certainty_score = result["score"]

            if result["label"] == "positive":
                sentiment_score = certainty_score
            elif result["label"] == "negative":
                sentiment_score = -certainty_score
            else:
                sentiment_score = 0

            results.append({
                "sentence": sentence,
                "start_time": item["start_time"],
                "end_time": item["end_time"],
                "label": result["label"],
                "certainty_score": certainty_score,
                "sentiment_score": sentiment_score
            })

        except Exception as e:
            # If something goes wrong, default to neutral
            results.append({
                "sentence": sentence,
                "start_time": item["start_time"],
                "end_time": item["end_time"],
                "label": "neutral",
                "certainty_score": 0.0,
                "sentiment_score": 0.0
            })
            print(f"⚠️ Sentiment error on sentence: {sentence[:50]}... → {e}")

    return results
