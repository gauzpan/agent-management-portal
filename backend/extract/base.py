"""Extraction interface + shared types."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


class EngineUnavailable(Exception):
    """Raised when an extraction engine's dependencies aren't installed."""


@dataclass
class PageText:
    page: int          # 1-indexed
    text: str
    quality: float     # 0..1 — how much usable text this page yielded
    engine: str        # which engine produced this page's text


@dataclass
class RawExtraction:
    pages: list[PageText] = field(default_factory=list)

    @property
    def engine_used(self) -> str:
        engines = {p.engine for p in self.pages}
        return "+".join(sorted(engines)) if engines else "none"

    @property
    def page_count(self) -> int:
        return len(self.pages)

    def lines(self) -> list[tuple[int, str]]:
        """(page_number, line) for every non-blank line, in reading order."""
        out: list[tuple[int, str]] = []
        for p in self.pages:
            for ln in p.text.splitlines():
                if ln.strip():
                    out.append((p.page, ln))
        return out


def text_quality(text: str) -> float:
    """Cheap heuristic: does this page have enough real text to trust the layer?

    ~0 for a blank/scanned page (no text layer), ~1 for a filled text page.
    """
    alnum = sum(c.isalnum() for c in text)
    return min(1.0, alnum / 200.0)


class TextExtractor(Protocol):
    name: str
    def extract(self, pdf_path: str) -> RawExtraction: ...
