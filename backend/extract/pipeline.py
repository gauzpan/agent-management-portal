"""Extraction pipeline: pypdf first, EasyOCR fallback per weak page."""
from __future__ import annotations

from extract.base import EngineUnavailable, RawExtraction
from extract.easyocr_extractor import EasyOcrExtractor
from extract.pypdf_extractor import PypdfExtractor

# Below this text-quality, treat a page as scanned/image and try OCR.
FALLBACK_THRESHOLD = 0.25


def extract_application(pdf_path: str, *, force_ocr: bool = False) -> RawExtraction:
    """Return page texts, falling back to EasyOCR only where the text layer is thin.

    `force_ocr` (tests) makes every page take the fallback path.
    """
    raw = PypdfExtractor().extract(pdf_path)
    ocr = EasyOcrExtractor()
    for idx, page in enumerate(raw.pages):
        if not force_ocr and page.quality >= FALLBACK_THRESHOLD:
            continue
        try:
            raw.pages[idx] = ocr.extract_page(pdf_path, idx)
        except EngineUnavailable:
            # No OCR available — keep the (thin) pypdf text; downstream marks the
            # affected fields low-confidence / manual-entry.
            page.engine = "pypdf(no-ocr-fallback)"
    return raw
