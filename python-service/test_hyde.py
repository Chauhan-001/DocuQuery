
import unittest
from unittest.mock import patch

from hyde import generate_hypothetical_document


class TestHyDE(unittest.TestCase):

    @patch("hyde.generate_answer")
    def test_generates_hypothetical_document(self, mock_generate):
        mock_generate.return_value = (
            "FastAPI validates request data using Python type hints."
        )

        result = generate_hypothetical_document(
            "How does FastAPI validate request data?"
        )

        self.assertIn("FastAPI", result)
        mock_generate.assert_called_once()

    @patch("hyde.generate_answer")
    def test_empty_response(self, mock_generate):
        mock_generate.return_value = "   "

        result = generate_hypothetical_document("What is RAG?")

        self.assertEqual(result, "")

    @patch("hyde.generate_answer")
    def test_api_failure(self, mock_generate):
        mock_generate.side_effect = RuntimeError("API failed")

        result = generate_hypothetical_document("What is RAG?")

        self.assertEqual(result, "")

    @patch("hyde.generate_answer")
    def test_rejects_oversized_response(self, mock_generate):
        mock_generate.return_value = "A" * 3001

        result = generate_hypothetical_document("What is RAG?")

        self.assertEqual(result, "")

    def test_empty_question(self):
        result = generate_hypothetical_document("   ")

        self.assertEqual(result, "")


if __name__ == "__main__":
    unittest.main()
