import os
from dataclasses import dataclass
from pathlib import Path

from qdrant_client import QdrantClient, models

COLLECTION_NAME = "document_chunks"
VECTOR_SIZE = 384
DEFAULT_STORAGE_PATH = Path(__file__).parent / "qdrant_storage"


@dataclass(frozen=True)
class QdrantConfig:
    mode: str
    url: str | None = None
    api_key: str | None = None
    storage_path: Path | None = None


def resolve_qdrant_config(env=None) -> QdrantConfig:
    """Select remote Qdrant when QDRANT_URL is set, otherwise use local storage."""
    env = os.environ if env is None else env
    url = (env.get("QDRANT_URL") or "").strip()
    api_key = (env.get("QDRANT_API_KEY") or "").strip() or None

    if url:
        return QdrantConfig(mode="remote", url=url, api_key=api_key)

    storage_path = (env.get("QDRANT_STORAGE_PATH") or "").strip()
    return QdrantConfig(
        mode="local",
        storage_path=Path(storage_path) if storage_path else DEFAULT_STORAGE_PATH,
    )


def build_qdrant_client(config: QdrantConfig | None = None) -> QdrantClient:
    config = config or resolve_qdrant_config()

    if config.mode == "remote":
        return QdrantClient(url=config.url, api_key=config.api_key)

    return QdrantClient(path=str(config.storage_path))


CONFIG = resolve_qdrant_config()
client = build_qdrant_client(CONFIG)


def initialize_collection():
    """Create the collection once, tolerating a concurrent creator."""
    if not client.collection_exists(COLLECTION_NAME):
        try:
            client.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config=models.VectorParams(
                    size=VECTOR_SIZE,
                    distance=models.Distance.COSINE,
                ),
            )
        except Exception:
            # Another instance may have created the collection between the
            # existence check and the create call. Only re-raise if it is
            # still absent after the failed create.
            if not client.collection_exists(COLLECTION_NAME):
                raise

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
