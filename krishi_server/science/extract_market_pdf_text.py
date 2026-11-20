"""Extract selectable text from an administrator-uploaded official PDF."""
from __future__ import annotations

import json
import sys
from io import BytesIO

from pypdf import PdfReader

MAX_PDF_BYTES = 12 * 1024 * 1024

raw = sys.stdin.buffer.read(MAX_PDF_BYTES + 1)
if len(raw) > MAX_PDF_BYTES:
    raise SystemExit("PDF exceeds the 12 MiB upload limit.")
reader = PdfReader(BytesIO(raw), strict=False)
if reader.is_encrypted:
    raise SystemExit("Encrypted PDFs are not supported; export an unlocked report first.")
pages = [page.extract_text(extraction_mode="layout") or "" for page in reader.pages]
text = "\n\n".join(pages).strip()
print(json.dumps({"pageCount": len(reader.pages), "text": text}, ensure_ascii=False))
