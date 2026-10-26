import io
import unittest
from unittest.mock import patch

from pypdf import PdfWriter

import document_parser


def build_pdf(page_count: int) -> bytes:
    writer = PdfWriter()
    for _ in range(page_count):
        writer.add_blank_page(width=72, height=72)
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


class DocumentLimitTests(unittest.TestCase):
    def test_rejects_pdfs_above_the_page_limit(self):
        with self.assertRaisesRegex(ValueError, "page limit"):
            document_parser.extract_text_from_pdf(build_pdf(document_parser.MAX_PAGES + 1))

    def test_enforces_the_parse_time_budget(self):
        with patch.object(document_parser, "MAX_PARSE_SECONDS", 0):
            with self.assertRaisesRegex(ValueError, "second limit"):
                document_parser.extract_text_from_pdf(build_pdf(1))


if __name__ == "__main__":
    unittest.main()
