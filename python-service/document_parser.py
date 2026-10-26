
import time
from io import BytesIO

import pymupdf
from pypdf import PdfReader


MIN_TEXT_LENGTH = 20
OCR_LANGUAGE = "eng"
OCR_DPI = 200
MAX_PAGES = 100
MAX_PARSE_SECONDS = 60


def extract_text_from_pdf(content: bytes) -> str:
    """Extract PDF text normally, using OCR for pages with little text."""

    try:
        reader = PdfReader(BytesIO(content), strict=False)

        if reader.is_encrypted:
            raise ValueError("Encrypted PDFs are not supported.")

        page_count = len(reader.pages)

        if page_count == 0:
            raise ValueError("The PDF contains no pages.")

        if page_count > MAX_PAGES:
            raise ValueError(f"PDF exceeds the {MAX_PAGES} page limit.")

        deadline = time.monotonic() + MAX_PARSE_SECONDS

        # First try regular PDF text extraction.
        regular_pages = []

        for page_number, page in enumerate(reader.pages, start=1):
            if time.monotonic() >= deadline:
                raise ValueError(
                    f"PDF parsing exceeded the {MAX_PARSE_SECONDS} second limit."
                )
            text = page.extract_text() or ""
            regular_pages.append((page_number, text.strip()))

        # OCR only pages where regular extraction found little text.
        with pymupdf.open(stream=content, filetype="pdf") as document:
            pages = []

            for page_number, regular_text in regular_pages:
                if time.monotonic() >= deadline:
                    raise ValueError(
                        f"PDF parsing exceeded the {MAX_PARSE_SECONDS} second limit."
                    )
                if len(regular_text) >= MIN_TEXT_LENGTH:
                    text = regular_text
                else:
                    page = document[page_number - 1]

                    try:
                        text_page = page.get_textpage_ocr(
                            language=OCR_LANGUAGE,
                            dpi=OCR_DPI,
                            full=True,
                        )
                        text = page.get_text(textpage=text_page).strip()

                    except Exception as exc:
                        raise ValueError(
                            f"OCR failed on PDF page {page_number}. "
                            "Check Tesseract and its English language data."
                        ) from exc

                if text:
                    pages.append(f"[Page {page_number}]\n{text}")

        extracted_text = "\n\n".join(pages)

        if not extracted_text.strip():
            raise ValueError(
                "No extractable text found. The PDF may be blank or unreadable."
            )

        return extracted_text

    except ValueError:
        raise

    except Exception as exc:
        raise ValueError(
            "Could not read this PDF. Check that it is valid and not corrupted."
        ) from exc
