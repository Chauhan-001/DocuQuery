
import re

from rank_bm25 import BM25Okapi
from qdrant_client import models

from qdrant_db import client, COLLECTION_NAME


STOPWORDS = {
    "a", "an", "the", "is", "are", "was", "were",
    "be", "been", "being", "do", "does", "did",
    "what", "which", "who", "where", "when", "why",
    "how", "of", "for", "to", "in", "on", "at",
    "and", "or", "but", "with", "from", "by",
    "it", "this", "that", "these", "those",
}


def tokenize(text: str) -> list[str]:
    """Normalize text into lowercase tokens and remove common stopwords."""
    tokens = re.findall(r"\b\w+\b", text.lower())
    return [token for token in tokens if token not in STOPWORDS]


def search_bm25(
    question: str,
    document_id: str,
    limit: int = 3,
) -> list[dict]:
    # 1. Fetch all chunks belonging to this document.
    records = []
    offset = None

    while True:
        batch, next_offset = client.scroll(
            collection_name=COLLECTION_NAME,
            scroll_filter=models.Filter(
                must=[
                    models.FieldCondition(
                        key="document_id",
                        match=models.MatchValue(value=document_id),
                    )
                ]
            ),
            limit=256,
            offset=offset,
            with_payload=True,
            with_vectors=False,
        )

        records.extend(batch)

        if next_offset is None:
            break

        offset = next_offset

    if not records:
        return []

    # 2. Extract chunk text and tokenize the corpus.
    texts = [
        record.payload.get("text", "")
        for record in records
    ]

    tokenized_corpus = [tokenize(text) for text in texts]

    # Ignore empty chunks when building the BM25 index.
    valid_indices = [
        index
        for index, tokens in enumerate(tokenized_corpus)
        if tokens
    ]

    if not valid_indices:
        return []

    tokenized_corpus = [
        tokenized_corpus[index]
        for index in valid_indices
    ]

    valid_records = [
        records[index]
        for index in valid_indices
    ]

    # 3. Build the BM25 index and score the query.
    bm25 = BM25Okapi(tokenized_corpus)
    tokenized_query = tokenize(question)

    if not tokenized_query:
        return []

    scores = bm25.get_scores(tokenized_query)

    # 4. Sort chunks by BM25 score, highest first.
    ranked_indices = sorted(
        range(len(scores)),
        key=lambda index: float(scores[index]),
        reverse=True,
    )

    return [
        {
            "id": str(valid_records[index].id),
            "source": valid_records[index].payload.get("source"),
            "chunk_index": valid_records[index].payload.get(
                "chunk_index"
            ),
            "text": valid_records[index].payload.get("text", ""),
            "bm25_score": float(scores[index]),
        }
        for index in ranked_indices[:limit]
        if scores[index] > 0
    ]


if __name__ == "__main__":
    try:
        question = (
            "Which database stores vectors for similarity search?"
        )

        results = search_bm25(
            question=question,
            document_id="sample",
            limit=3,
        )

        print("\n========== BM25 SEARCH RESULTS ==========")
        print("Question:", question)
        print("Results:", len(results))

        for rank, result in enumerate(results, start=1):
            print(f"\nRank: {rank}")
            print("BM25 score:", round(result["bm25_score"], 4))
            print("Source:", result["source"])
            print("Chunk:", result["chunk_index"])
            print("Text:", result["text"])

    finally:
        client.close()
