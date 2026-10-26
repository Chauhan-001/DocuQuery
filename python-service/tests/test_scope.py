import unittest
from types import SimpleNamespace

from scope import (
    filter_points_for_document,
    filter_scored_results_for_document,
)


def point(document_id: str, point_id: str):
    return SimpleNamespace(
        id=point_id,
        payload={"document_id": document_id, "text": f"{document_id}-{point_id}"},
    )


class DocumentScopeTests(unittest.TestCase):
    def test_filters_foreign_points(self):
        points = [
            point("doc-a", "1"),
            point("doc-b", "2"),
            point("doc-a", "3"),
        ]
        result = filter_points_for_document(points, "doc-a")
        self.assertEqual([p.id for p in result], ["1", "3"])

    def test_missing_payload_is_treated_as_foreign(self):
        points = [
            SimpleNamespace(id="1", payload=None),
            SimpleNamespace(id="2", payload={}),
            point("doc-a", "3"),
        ]
        result = filter_points_for_document(points, "doc-a")
        self.assertEqual([p.id for p in result], ["3"])

    def test_scored_results_are_scoped_before_context_building(self):
        results = [
            (point("doc-a", "1"), 0.9),
            (point("doc-b", "2"), 0.95),
            (point("doc-a", "3"), 0.5),
        ]
        scoped = filter_scored_results_for_document(results, "doc-a")
        self.assertEqual([(p.id, score) for p, score in scoped], [("1", 0.9), ("3", 0.5)])

    def test_empty_and_no_match_return_empty(self):
        self.assertEqual(filter_points_for_document([], "doc-a"), [])
        self.assertEqual(
            filter_points_for_document([point("doc-b", "2")], "doc-a"),
            [],
        )
        self.assertEqual(
            filter_scored_results_for_document([(point("doc-b", "2"), 0.9)], "doc-a"),
            [],
        )


if __name__ == "__main__":
    unittest.main()
