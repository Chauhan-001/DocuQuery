
from io import BytesIO

import pymupdf

from document_parser import extract_text_from_pdf


def make_text_pdf(text: str) -> bytes:
    document = pymupdf.open()
    page = document.new_page()
    page.insert_text((72, 72), text)
    content = document.tobytes()
    document.close()
    return content


def make_scanned_pdf(text: str) -> bytes:
    # Render text into an image, so the PDF has no selectable text.
    original = pymupdf.open()
    page = original.new_page()
    page.insert_text((72, 72), text, fontsize=20)

    pixmap = page.get_pixmap(dpi=200)
    image_bytes = pixmap.tobytes("png")
    original.close()

    scanned = pymupdf.open()
    page = scanned.new_page()
    page.insert_image(page.rect, stream=image_bytes)
    content = scanned.tobytes()
    scanned.close()
    return content


normal_text = extract_text_from_pdf(
    make_text_pdf("Normal PDF extraction works.")
)
assert "Normal PDF extraction works." in normal_text
print("PASS: normal PDF")

scanned_text = extract_text_from_pdf(
    make_scanned_pdf("Scanned PDF OCR works.")
)
assert "Scanned PDF OCR works." in scanned_text
print("PASS: scanned PDF OCR")

print("ALL TESTS PASSED")
