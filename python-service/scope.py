"""Document-scope helpers shared by retrieval and context building.

Every chunk that reaches fusion, reranking, context compression, citations, or
answer generation must belong to the requested document. These helpers are a
defense-in-depth check on top of the Qdrant payload filters.
"""


def point_document_id(point) -> str | None:
    payload = getattr(point, "payload", None) or {}
    return payload.get("document_id")


def filter_points_for_document(points, document_id: str):
    return [
        point
        for point in points
        if point_document_id(point) == document_id
    ]


def filter_scored_results_for_document(results, document_id: str):
    return [
        (point, score)
        for point, score in results
        if point_document_id(point) == document_id
    ]
