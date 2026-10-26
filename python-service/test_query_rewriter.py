
import unittest
from unittest.mock import patch

from query_rewriter import rewrite_query


class TestQueryRewriter(unittest.TestCase):

    def test_returns_rewritten_query(self):
        with patch(
            "query_rewriter.generate_answer",
            return_value=(
                "How does FastAPI validate incoming request data?"
            ),
        ):
            result = rewrite_query("How does FastAPI check input?")

        self.assertEqual(
            result,
            "How does FastAPI validate incoming request data?",
        )

    def test_empty_question_returns_empty_string(self):
        result = rewrite_query("   ")
        self.assertEqual(result, "")

    def test_falls_back_when_groq_fails(self):
        with patch(
            "query_rewriter.generate_answer",
            side_effect=RuntimeError("API unavailable"),
        ):
            result = rewrite_query("How does Qdrant store vectors?")

        self.assertEqual(
            result,
            "How does Qdrant store vectors?",
        )

    def test_falls_back_for_long_output(self):
        with patch(
            "query_rewriter.generate_answer",
            return_value="x" * 501,
        ):
            result = rewrite_query("Explain Qdrant.")

        self.assertEqual(result, "Explain Qdrant.")


if __name__ == "__main__":
    unittest.main()
