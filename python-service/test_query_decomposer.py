import unittest
from unittest.mock import patch

from query_decomposer import decompose_query


class TestQueryDecomposer(unittest.TestCase):

    @patch("query_decomposer.generate_answer")
    def test_decomposes_complex_question(self, mock_generate):
        mock_generate.return_value = (
            "1. How are document chunks retrieved?\n"
            "2. How are results ranked?\n"
            "3. How is the final answer generated?"
        )

        result = decompose_query(
            "How does retrieval and answer generation work?"
        )

        self.assertEqual(len(result), 3)
        self.assertEqual(
            result[0],
            "How are document chunks retrieved?"
        )

    @patch("query_decomposer.generate_answer")
    def test_empty_response_falls_back(self, mock_generate):
        mock_generate.return_value = ""

        result = decompose_query("How does FastAPI validate data?")

        self.assertEqual(
            result,
            ["How does FastAPI validate data?"]
        )

    @patch("query_decomposer.generate_answer")
    def test_api_failure_falls_back(self, mock_generate):
        mock_generate.side_effect = RuntimeError("API failed")

        result = decompose_query("Explain RAG")

        self.assertEqual(result, ["Explain RAG"])

    @patch("query_decomposer.generate_answer")
    def test_duplicate_questions_are_removed(self, mock_generate):
        mock_generate.return_value = (
            "1. How does RAG retrieve evidence?\n"
            "2. How does RAG retrieve evidence?"
        )

        result = decompose_query("Explain RAG retrieval")

        self.assertEqual(
            result,
            ["How does RAG retrieve evidence?"]
        )


if __name__ == "__main__":
    unittest.main()