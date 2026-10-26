from qdrant_client import models

from qdrant_db import client, COLLECTION_NAME
from embedder import generate_embedding
from reranker import rerank_results


RETRIEVAL_CANDIDATES = 10



def retrieve_candidates(
    question: str,
    document_id: str,
    limit: int = 3,
    score_threshold: float | None = None,
    query_vector: list[float] | None = None,
):
    # Use a supplied vector (HyDE) or embed the question normally.
    if query_vector is None:
        query_vector = generate_embedding(question)

    return client.query_points(
        collection_name=COLLECTION_NAME,
        query=query_vector,
        query_filter=models.Filter(
            must=[
                models.FieldCondition(
                    key="document_id",
                    match=models.MatchValue(value=document_id),
                )
            ]
        ),
        limit=max(limit, RETRIEVAL_CANDIDATES),
        score_threshold=score_threshold,
        with_payload=True,
    ).points



def search_document(
    question: str,
    document_id: str,
    limit: int = 3,
    score_threshold: float | None = None,
):
    candidates = retrieve_candidates(
        question=question,
        document_id=document_id,
        limit=limit,
        score_threshold=score_threshold,
    )

    ranked_results = rerank_results(question, candidates)

    return [
        result
        for result, rerank_score in ranked_results[:limit]
    ]


if __name__ == "__main__":
    try:
        question = "Which database stores vectors for similarity search?"
        document_id = "sample"
        limit = 3
        score_threshold = 0.4

        # Step 1: Retrieve candidates using Qdrant.
        candidates = retrieve_candidates(
            question=question,
            document_id=document_id,
            limit=limit,
            score_threshold=score_threshold,
        )

        print("\n========== BEFORE RERANKING (QDRANT) ==========")
        for rank, result in enumerate(candidates, start=1):
            print(
                f"\nRank: {rank}"
                f"\nQdrant score: {result.score:.4f}"
                f"\nChunk: {result.payload.get('chunk_index')}"
                f"\nText: {result.payload.get('text', '')}"
            )

        # Step 2: Rerank the same candidates.
        ranked_results = rerank_results(question, candidates)

        print("\n========== AFTER RERANKING (CROSS-ENCODER) ==========")
        for rank, (result, rerank_score) in enumerate(
            ranked_results, start=1
        ):
            print(
                f"\nRank: {rank}"
                f"\nCross-Encoder score: {float(rerank_score):.4f}"
                f"\nOriginal Qdrant score: {result.score:.4f}"
                f"\nChunk: {result.payload.get('chunk_index')}"
                f"\nText: {result.payload.get('text', '')}"
            )

        # Step 3: Show final results returned by the public function.
        final_results = [
            result
            for result, rerank_score in ranked_results[:limit]
        ]

        print("\n========== FINAL RESULTS ==========")
        print("Question:", question)
        print("Final results:", len(final_results))

        for result in final_results:
            print(
                f"\nSource: {result.payload.get('source')}"
                f"\nChunk: {result.payload.get('chunk_index')}"
                f"\nQdrant score: {result.score:.4f}"
                f"\nText: {result.payload.get('text', '')}"
            )

    finally:
        client.close()