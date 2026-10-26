
import unittest
from unittest.mock import patch

from context_compressor import compress_context


class TestContextCompressor(unittest.TestCase):

    def setUp(self):
        self.question = "What is a JavaScript closure?"
        self.context = (
            "[Source: javascript.pdf, Chunk: 2]\n"
            "A closure lets a function access variables from its "
            "outer lexical scope. JavaScript arrays support map and filter."
        )

    @patch("context_compressor.generate_answer")
    def test_compresses_context(self, mock_generate):
        mock_generate.return_value = (
            "[Source: javascript.pdf, Chunk: 2]\n"
            "A closure lets a function access variables from its outer lexical scope."
        )
        trace = {}

        result = compress_context(self.question, self.context, trace=trace)

        self.assertIn("closure", result)
        self.assertIn("[Source: javascript.pdf, Chunk: 2]", result)
        self.assertNotIn("arrays support map and filter", result)
        self.assertEqual(trace["status"], "compressed")
        self.assertEqual(trace["input_characters"], len(self.context))
        self.assertEqual(trace["output_characters"], len(result))
        self.assertIn("closure", trace["preview"])
        mock_generate.assert_called_once()

    @patch("context_compressor.generate_answer")
    def test_empty_llm_response_falls_back_to_original(self, mock_generate):
        mock_generate.return_value = ""

        result = compress_context(self.question, self.context)

        self.assertEqual(result, self.context)

    @patch("context_compressor.generate_answer")
    def test_whitespace_llm_response_falls_back(self, mock_generate):
        mock_generate.return_value = "   \n  "

        result = compress_context(self.question, self.context)

        self.assertEqual(result, self.context)

    @patch("context_compressor.generate_answer")
    def test_api_failure_falls_back_to_original(self, mock_generate):
        mock_generate.side_effect = RuntimeError("API unavailable")
        trace = {}

        result = compress_context(self.question, self.context, trace=trace)

        self.assertEqual(result, self.context)
        self.assertEqual(trace["status"], "fallback")
        self.assertEqual(trace["input_characters"], trace["output_characters"])

    @patch("context_compressor.generate_answer")
    def test_empty_question_skips_llm(self, mock_generate):
        result = compress_context("", self.context)

        self.assertEqual(result, self.context)
        mock_generate.assert_not_called()

    @patch("context_compressor.generate_answer")
    def test_empty_context_skips_llm(self, mock_generate):
        result = compress_context(self.question, "")

        self.assertEqual(result, "")
        mock_generate.assert_not_called()


if __name__ == "__main__":
    unittest.main()
