"""Document text-extraction package (M2.6).

pypdf-first, EasyOCR-fallback text extraction behind a common interface so a real
ZDR OCR provider can drop in at M6 without touching callers.
"""
from extract.pipeline import extract_application  # noqa: F401
