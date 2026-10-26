
from sentence_transformers import SentenceTransformer

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

model = SentenceTransformer(MODEL_NAME)

def generate_embedding(text: str) -> list[float]:
    embedding = model.encode(text)
    return embedding.tolist()


if __name__ == "__main__":
    sample_text = "FastAPI uses Python type hints to validate request data."

    vector = generate_embedding(sample_text)

    print("Vector dimensions:", len(vector))
    print("First five values:", vector[:5])


