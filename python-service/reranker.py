from sentence_transformers import CrossEncoder

MODEL_NAME = "cross-encoder/ms-marco-MiniLM-L6-v2"

reranker = CrossEncoder(MODEL_NAME)


def rerank_results(question: str, results: list):
    if not results:
        return []

    pairs = [
        (question, result.payload["text"])
        for result in results
    ]

    scores = reranker.predict(pairs)

    ranked_results = sorted(
        zip(results, scores.tolist()),
        key=lambda item: item[1],
        reverse=True,
    )

    return ranked_results