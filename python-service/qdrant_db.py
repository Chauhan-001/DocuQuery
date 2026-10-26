
import os
from pathlib import Path

from qdrant_client import QdrantClient, models

COLLECTION_NAME = "document_chunks"
VECTOR_SIZE = 384

STORAGE_PATH = Path(
    os.getenv("QDRANT_STORAGE_PATH", str(Path(__file__).parent / "qdrant_storage"))
)

client = QdrantClient(path=str(STORAGE_PATH))


def initialize_collection():
    existing_collections = client.get_collections().collections

    collection_exists = any(
        collection.name == COLLECTION_NAME
        for collection in existing_collections
    )

    if not collection_exists:
        client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=models.VectorParams(
                size=VECTOR_SIZE,
                distance=models.Distance.COSINE,
            ),
        )

    return client.get_collection(COLLECTION_NAME)



if __name__ == "__main__":
    try:
        collection = initialize_collection()

        print("Collection:", COLLECTION_NAME)
        print("Vector size:", collection.config.params.vectors.size)
        print("Distance:", collection.config.params.vectors.distance)
        print("Status:", collection.status)
    finally:
        client.close()

