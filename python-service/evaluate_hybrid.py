
from qdrant_db import client
from search_document import retrieve_candidates
from hybrid_search import search_hybrid

DOCUMENT_ID = "sample"
LIMIT = 3
SCORE_THRESHOLD = 0.4

QUESTIONS = [
    "Which database stores vectors for similarity search?",
    "Which Python framework is used to build APIs?",
    "What does semantic search retrieve?",
    "What does RAG do with retrieved information?",
    "What is the capital of France?",
]


def show_results(label, results):
    print(f"\n--- {label} ---")

    if not results:
        print("No results")
        return

    for rank, item in enumerate(results[:LIMIT], start=1):
        point = item[0] if isinstance(item, tuple) else item
        score = item[1] if isinstance(item, tuple) else point.score

        print(
            f"Rank: {rank} | "
            f"Chunk: {point.payload.get('chunk_index')} | "
            f"Score: {float(score):.4f}"
        )
        print(point.payload.get("text", ""))


try:
    for question in QUESTIONS:
        print("\n" + "=" * 65)
        print("QUESTION:", question)

        dense_results = retrieve_candidates(
            question=question,
            document_id=DOCUMENT_ID,
            limit=LIMIT,
            score_threshold=SCORE_THRESHOLD,
        )

        hybrid_results = search_hybrid(
            question=question,
            document_id=DOCUMENT_ID,
            limit=LIMIT,
            score_threshold=SCORE_THRESHOLD,
        )

        show_results("DENSE ONLY", dense_results)
        show_results("HYBRID + RERANKING", hybrid_results)

finally:
    client.close()
