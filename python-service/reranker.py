from threading import Lock

MODEL_NAME = "cross-encoder/ms-marco-MiniLM-L6-v2"

_reranker = None
_reranker_lock = Lock()


def _get_reranker():
    global _reranker

    if _reranker is None:
        with _reranker_lock:
            if _reranker is None:
                # Import and load lazily so /health and startup do not require
                # loading PyTorch or downloading model weights.
                from sentence_transformers import CrossEncoder

                _reranker = CrossEncoder(MODEL_NAME)

    return _reranker


def rerank_results(question: str, results: list):
    if not results:
        return []

    pairs = [
        (question, result.payload["text"])
        for result in results
    ]

    scores = _get_reranker().predict(pairs)

    ranked_results = sorted(
        zip(results, scores.tolist()),
        key=lambda item: item[1],
        reverse=True,
    )

    return ranked_results
