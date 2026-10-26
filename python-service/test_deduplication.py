
from hybrid_search import search_hybrid
from qdrant_db import client


question = "Which database stores vectors for similarity search?"
document_id = "sample"

try:
    results = search_hybrid(
        question=question,
        document_id=document_id,
        limit=10,
        score_threshold=0.4,
    )

    print(f"\nTotal results: {len(results)}")

    for rank, (point, score) in enumerate(results, start=1):
        payload = point.payload or {}

        print(f"\nRank: {rank}")
        print(f"ID: {point.id}")
        print(f"Source: {payload.get('source')}")
        print(f"Chunk: {payload.get('chunk_index')}")
        print(f"Score: {float(score):.4f}")
        print(f"Text: {payload.get('text', '')}")

finally:
    client.close()
