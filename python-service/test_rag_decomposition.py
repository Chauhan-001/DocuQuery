
import unittest
from unittest.mock import patch, MagicMock

from rag import retrieve_decomposed_results


def make_point(point_id, text):
    point = MagicMock()
    point.id = point_id
    point.payload = {"text": text}
    return point


class TestRetrieveDecomposedResults(unittest.TestCase):

    
    @patch("rag.generate_embedding")
    @patch("rag.generate_hypothetical_document")
    @patch("rag.search_hybrid")
    @patch("rag.decompose_query")
    def test_falls_back_when_hyde_returns_empty(
        self,
        mock_decompose,
        mock_search,
        mock_hyde,
        mock_embedding,
    ):
        mock_decompose.return_value = ["How does vector search work?"]
        mock_hyde.return_value = ""
        point = make_point("fallback-1", "Vector similarity retrieves relevant chunks.")
        mock_search.return_value = [(point, 0.85)]

        results = retrieve_decomposed_results(
            question="How does vector search work?",
            document_id="sample",
            limit=3,
        )

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0][0].id, "fallback-1")
        self.assertEqual(results[0][1], 0.85)

        mock_embedding.assert_not_called()
        mock_search.assert_called_once()

        # None means Dense Search will create the normal query embedding.
        self.assertIsNone(
            mock_search.call_args.kwargs["query_vector"]
        )

    @patch("rag.generate_embedding")
    @patch("rag.generate_hypothetical_document")
    @patch("rag.search_hybrid")
    @patch("rag.decompose_query")
    def test_uses_hyde_embedding_for_dense_retrieval(
        self,
        mock_decompose,
        mock_search,
        mock_hyde,
        mock_embedding,
    ):
        mock_decompose.return_value = ["What does the report conclude?"]
        mock_hyde.return_value = "The report concludes that costs declined."
        mock_embedding.return_value = [0.25] * 384
        mock_search.return_value = []
        trace = {}

        retrieve_decomposed_results(
            question="What does the report conclude?",
            document_id="sample",
            use_hyde=True,
            trace=trace,
        )

        mock_embedding.assert_called_once_with(
            "The report concludes that costs declined."
        )
        self.assertEqual(
            mock_search.call_args.kwargs["query_vector"],
            [0.25] * 384,
        )
        self.assertTrue(trace["retrieval_queries"][0]["hyde"]["embedding_used"])
        self.assertIn("costs declined", trace["retrieval_queries"][0]["hyde"]["preview"])

    @patch("rag.generate_embedding")
    @patch("rag.generate_hypothetical_document")
    @patch("rag.search_hybrid")
    @patch("rag.decompose_query")
    def test_disabling_hyde_skips_generation_and_embedding(
        self,
        mock_decompose,
        mock_search,
        mock_hyde,
        mock_embedding,
    ):
        mock_decompose.return_value = ["How are vectors searched?"]
        mock_search.return_value = []
        trace = {}

        retrieve_decomposed_results(
            question="How are vectors searched?",
            document_id="sample",
            use_hyde=False,
            trace=trace,
        )

        mock_hyde.assert_not_called()
        mock_embedding.assert_not_called()
        self.assertIsNone(mock_search.call_args.kwargs["query_vector"])
        self.assertFalse(trace["retrieval_queries"][0]["hyde"]["enabled"])



if __name__ == "__main__":
    unittest.main()
