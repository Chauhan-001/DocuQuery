
from time import perf_counter

from qdrant_db import client, COLLECTION_NAME
from search_document import retrieve_candidates
from search_bm25 import search_bm25
from fusion import reciprocal_rank_fusion
from reranker import rerank_results
from scope import filter_points_for_document


RETRIEVAL_LIMIT = 10
FINAL_LIMIT = 3
RRF_K = 60


def search_hybrid(
    question: str,
    document_id: str,
    limit: int = 3,
    score_threshold: float | None = 0.4,
    trace: dict | None = None,
    query_vector: list[float] | None = None,
):
    # 1. Dense retrieval: use HyDE vector if supplied.
    started_at = perf_counter()

    dense_results = retrieve_candidates(
        question=question,
        document_id=document_id,
        limit=max(limit, RETRIEVAL_LIMIT),
        score_threshold=score_threshold,
        query_vector=query_vector,
    )

    dense_duration_ms = (perf_counter() - started_at) * 1000

    # 2. BM25 keyword retrieval always uses the text query.
    started_at = perf_counter()

    bm25_results = search_bm25(
        question=question,
        document_id=document_id,
        limit=max(limit, RETRIEVAL_LIMIT),
    )

    bm25_duration_ms = (perf_counter() - started_at) * 1000

    dense_ids = [str(point.id) for point in dense_results]
    bm25_ids = [str(result["id"]) for result in bm25_results]

    # 3. Reciprocal Rank Fusion combines both rankings.
    started_at = perf_counter()

    fused_results = reciprocal_rank_fusion(
        [dense_ids, bm25_ids],
        k=RRF_K,
    )

    rrf_duration_ms = (perf_counter() - started_at) * 1000

    if not fused_results:
        if trace is not None:
            trace.update({
                "query": question,
                "dense": {
                    "duration_ms": round(dense_duration_ms, 2),
                    "results": [
                        _point_trace(point, float(point.score))
                        for point in dense_results
                    ],
                },
                "bm25": {
                    "duration_ms": round(bm25_duration_ms, 2),
                    "results": [
                        _bm25_trace(result)
                        for result in bm25_results
                    ],
                },
                "rrf": {
                    "duration_ms": round(rrf_duration_ms, 2),
                    "candidate_count": 0,
                    "results": [],
                },
                "rerank": {
                    "duration_ms": 0,
                    "results": [],
                },
            })

        return []

    # 4. Fetch original Qdrant points using fused IDs.
    fused_ids = [point_id for point_id, _score in fused_results]

    started_at = perf_counter()

    points = client.retrieve(
        collection_name=COLLECTION_NAME,
        ids=fused_ids,
        with_payload=True,
        with_vectors=False,
    )

    # Defense-in-depth: hydration must only ever return chunks that belong to
    # the requested document, even if a point ID somehow came from elsewhere.
    points = filter_points_for_document(points, document_id)

    hydrate_duration_ms = (perf_counter() - started_at) * 1000

    points_by_id = {
        str(point.id): point
        for point in points
    }

    fused_points = [
        points_by_id[point_id]
        for point_id in fused_ids
        if point_id in points_by_id
    ]

    # 5. Cross-Encoder reranks using the text question.
    started_at = perf_counter()

    reranked_results = rerank_results(
        question,
        fused_points,
    )

    rerank_duration_ms = (perf_counter() - started_at) * 1000

    # 6. Optional retrieval trace for debugging and evaluation.
    if trace is not None:
        trace.update({
            "query": question,
            "dense": {
                "duration_ms": round(dense_duration_ms, 2),
                "results": [
                    _point_trace(point, float(point.score))
                    for point in dense_results
                ],
            },
            "bm25": {
                "duration_ms": round(bm25_duration_ms, 2),
                "results": [
                    _bm25_trace(result)
                    for result in bm25_results
                ],
            },
            "rrf": {
                "duration_ms": round(rrf_duration_ms, 2),
                "candidate_count": len(fused_results),
                "results": [
                    {
                        "id": point_id,
                        "score": round(float(score), 6),
                        "source": (
                            points_by_id[point_id].payload or {}
                        ).get("source", "Unknown"),
                        "chunk_index": (
                            points_by_id[point_id].payload or {}
                        ).get("chunk_index", -1),
                    }
                    for point_id, score in fused_results
                    if point_id in points_by_id
                ],
            },
            "hydrate": {
                "duration_ms": round(hydrate_duration_ms, 2),
                "candidate_count": len(fused_points),
            },
            "rerank": {
                "duration_ms": round(rerank_duration_ms, 2),
                "results": [
                    _point_trace(point, float(score))
                    for point, score in reranked_results
                ],
            },
        })

    return reranked_results[:limit]


def _point_trace(point, score: float) -> dict:
    payload = point.payload or {}

    return {
        "id": str(point.id),
        "source": payload.get("source", "Unknown"),
        "chunk_index": payload.get("chunk_index", -1),
        "score": round(float(score), 6),
        "preview": " ".join(
            payload.get("text", "").split()
        )[:220],
    }


def _bm25_trace(result: dict) -> dict:
    return {
        "id": str(result["id"]),
        "source": result.get("source") or "Unknown",
        "chunk_index": result.get("chunk_index", -1),
        "score": round(float(result["bm25_score"]), 6),
        "preview": " ".join(
            result.get("text", "").split()
        )[:220],
    }


if __name__ == "__main__":
    try:
        question = "Which database stores vectors for similarity search?"
        document_id = "sample"

        trace = {}

        results = search_hybrid(
            question=question,
            document_id=document_id,
            limit=FINAL_LIMIT,
            score_threshold=0.4,
            trace=trace,
        )

        print("\n========== HYBRID SEARCH ==========")
        print("Question:", question)
        print("Final results:", len(results))

        for rank, (point, score) in enumerate(results, start=1):
            payload = point.payload or {}

            print(
                f"\nRank: {rank}"
                f"\nID: {point.id}"
                f"\nSource: {payload.get('source', 'Unknown')}"
                f"\nChunk: {payload.get('chunk_index', -1)}"
                f"\nCross-Encoder score: {float(score):.4f}"
                f"\nText: {payload.get('text', '')}"
            )

        print("\n========== RETRIEVAL TIMINGS ==========")

        for stage, details in trace.items():
            if isinstance(details, dict) and "duration_ms" in details:
                print(f"{stage}: {details['duration_ms']} ms")

    finally:
        client.close()
