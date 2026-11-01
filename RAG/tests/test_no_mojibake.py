"""Source files must not contain UTF-8 text that was decoded as cp1252 ("\u00e2\u0152" where "❌" was meant)."""

import re

import pytest

from conftest import RAG_DIR

ROOT = RAG_DIR.parent
SOURCES = sorted(
    path
    for folder in ("RAG", "sentiment", "scripts", "frontend/app", "frontend/components", "frontend/lib")
    for pattern in ("*.py", "*.ts", "*.tsx")
    for path in (ROOT / folder).rglob(pattern)
    if not {"node_modules", "venv", ".venv", ".next", "__pycache__"} & set(path.parts)
)
# Lead bytes of emoji/punctuation (â, ð, Ã) followed by what a UTF-8 continuation byte becomes in cp1252
MOJIBAKE = re.compile("[\u00e2\u00f0\u00c3][\u0080-\u00bf\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u2013-\u203a\u20ac\u2122]")


def test_sources_were_found():
    assert len(SOURCES) > 20


@pytest.mark.parametrize("path", SOURCES, ids=lambda p: str(p.relative_to(ROOT)))
def test_no_mojibake(path):
    bad = [f"{n}: {line.strip()[:80]}" for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1)
           if MOJIBAKE.search(line)]
    assert not bad, "\n".join(bad)
