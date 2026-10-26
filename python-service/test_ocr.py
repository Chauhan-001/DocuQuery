
import pymupdf

TESSDATA = r"C:\Program Files\Tesseract-OCR\tessdata"

pdf = pymupdf.open()
page = pdf.new_page()
page.insert_text(
    (72, 72),
    "DocuQuery OCR test. This text should be recognized.",
)

pdf_bytes = pdf.tobytes()
pdf.close()

with pymupdf.open(stream=pdf_bytes, filetype="pdf") as document:
    page = document[0]

    text_page = page.get_textpage_ocr(
        language="eng",
        dpi=200,
        full=True,
        tessdata=TESSDATA,
    )

    extracted = page.get_text(textpage=text_page)
    print(extracted)

    assert "DocuQuery OCR test" in extracted
    print("OCR TEST PASSED")
