"""Primary extractor: pypdf text layer (fast, no heavy deps)."""
from __future__ import annotations

from pypdf import PdfReader

from extract.base import PageText, RawExtraction, text_quality


class PypdfExtractor:
    name = "pypdf"

    def extract(self, pdf_path: str) -> RawExtraction:
        reader = PdfReader(pdf_path)
        pages: list[PageText] = []
        for i, page in enumerate(reader.pages):
            try:
                txt = page.extract_text() or ""
            except Exception:
                txt = ""
            pages.append(PageText(page=i + 1, text=txt,
                                  quality=text_quality(txt), engine=self.name))
        return RawExtraction(pages=pages)
