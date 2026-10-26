from threading import Lock

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

_model = None
_model_lock = Lock()


def _get_model():
    global _model

    if _model is None:
        with _model_lock:
            if _model is None:
                # Import and load lazily so /health and startup do not require
                # loading PyTorch or downloading model weights.
                from sentence_transformers import SentenceTransformer

                _model = SentenceTransformer(MODEL_NAME)

    return _model


def generate_embedding(text: str) -> list[float]:
    embedding = _get_model().encode(text)
    return embedding.tolist()


if __name__ == "__main__":
    sample_text = "FastAPI uses Python type hints to validate request data."

    vector = generate_embedding(sample_text)

    print("Vector dimensions:", len(vector))
    print("First five values:", vector[:5])
