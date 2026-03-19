#!/usr/bin/env python3
"""
Generate and save static summaries for the 6 preloaded dashboards.
Run from project root: python scripts/populate_preloaded_summaries.py

Requires: OPENAI_API_KEY or GEMINI_API_KEY in RAG/.env
"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / "RAG" / ".env")

from langchain.prompts import PromptTemplate
from langchain.chains import LLMChain

PRELOADED = {
    "1": {"transcript_file": "apple_seeking_alpha.txt", "title": "Apple Q1 FY25"},
    "2": {"transcript_file": "cvs_seeking_alpha.txt", "title": "CVS Health Q3 2024"},
    "3": {"transcript_file": "alphabet_seeking_alpha.txt", "title": "Alphabet Q4 2024"},
    "4": {"transcript_file": "shell_seeking_alpha.txt", "title": "Shell Q4 2024"},
    "5": {"transcript_file": "tesla_seeking_alpha.txt", "title": "Tesla Q4 2024"},
    "6": {"transcript_file": "walmart_seeking_alpha.txt", "title": "Walmart Q4 FY25"},
}

SUMMARY_PROMPT = """
You are a financial analyst assistant. Read the following earnings call transcript and generate a detailed yet concise summary highlighting the key financial results, executive commentary, and any forward-looking statements. Bold any key terms in the summary using **term**. Start the summary with a very brief (max one paragraph) overall summary of the call, then go into a more detailed summary.

Transcript:
{transcript}

Summary:
"""


def main():
    from RAG.llm_provider import get_llm, run_with_fallback

    base = Path(__file__).parent.parent
    transcripts_dir = base / "RAG" / "transcripts"
    output_file = base / "RAG" / "static_summaries.py"

    prompt = PromptTemplate(input_variables=["transcript"], template=SUMMARY_PROMPT)
    chain = LLMChain(llm=get_llm(), prompt=prompt)

    summaries = {}
    for dash_id, config in PRELOADED.items():
        transcript_path = transcripts_dir / config["transcript_file"]
        if not transcript_path.exists():
            print(f"⚠️  Skipping {dash_id}: {transcript_path} not found")
            continue

        print(f"📝 Generating summary for dashboard {dash_id} ({config['title']})...")
        with open(transcript_path, "r", encoding="utf-8") as f:
            transcript_text = f.read()

        try:
            result = run_with_fallback(lambda: chain.run(transcript=transcript_text))
            summaries[dash_id] = result
            print(f"   ✅ Done ({len(result)} chars)")
        except Exception as e:
            print(f"   ❌ Failed: {e}")
            sys.exit(1)

    lines = [
        '"""',
        "Static summaries for the 6 preloaded dashboards (IDs 1-6).",
        "Served directly without DB or OpenAI calls for fast response.",
        "",
        "To regenerate: python scripts/populate_preloaded_summaries.py",
        '"""',
        "",
        "STATIC_SUMMARIES = {",
    ]
    for dash_id, summary in summaries.items():
        lines.append(f'    "{dash_id}": {repr(summary)},')
    lines.append("}")

    with open(output_file, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"\n✅ Wrote {len(summaries)} summaries to {output_file}")


if __name__ == "__main__":
    main()
