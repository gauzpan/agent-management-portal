"""Fallback extractor: EasyOCR over rasterized pages.

Only used when a page's text layer is insufficient (scanned/image PDFs). Deps
(easyocr, pymupdf) are heavy and OPTIONAL — imported lazily. If they're absent,
`extract_page` raises EngineUnavailable and the pipeline degrades gracefully.
"""
from __future__ import annotations

from extract.base import EngineUnavailable, PageText, text_quality

_reader = None


def _get_reader():
    """Lazy-init the EasyOCR reader; raise EngineUnavailable if deps missing."""
    global _reader
    if _reader is not None:
        return _reader
    try:
        import easyocr  # noqa: F401
    except Exception as err:  # pragma: no cover - exercised only w/o deps
        raise EngineUnavailable(f"easyocr not installed: {err}")
    _reader = easyocr.Reader(["en"], gpu=False)
    return _reader


def _render_page(pdf_path: str, page_index: int):
    """Rasterize one page to a numpy array via PyMuPDF."""
    try:
        import fitz  # PyMuPDF
        import numpy as np
    except Exception as err:  # pragma: no cover
        raise EngineUnavailable(f"pymupdf/numpy not installed: {err}")
    doc = fitz.open(pdf_path)
    pix = doc[page_index].get_pixmap(dpi=200)
    arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, pix.n)
    return arr


class EasyOcrExtractor:
    name = "easyocr"

    def extract_page(self, pdf_path: str, page_index: int) -> PageText:
        reader = _get_reader()
        arr = _render_page(pdf_path, page_index)
        lines = reader.readtext(arr, detail=0, paragraph=True)
        txt = "\n".join(lines)
        return PageText(page=page_index + 1, text=txt,
                        quality=text_quality(txt), engine=self.name)
