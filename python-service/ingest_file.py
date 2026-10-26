
from pathlib import Path

from qdrant_db import client
from ingest import ingest_document


def ingest_text_file(file_path: str) -> list[str]:
    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError(
            f"File not found: {path}"
        )

    if not path.is_file():
        raise ValueError(
            f"Path is not a file: {path}"
        )

    text = path.read_text(encoding="utf-8")

    return ingest_document(
        text=text,
        source=path.name,
        document_id=path.stem,
        chunk_size=200,
        overlap=40,
    )


if __name__ == "__main__":
    try:
        point_ids = ingest_text_file("sample.txt")

        print("File ingested successfully!")
        print("Chunks stored:", len(point_ids))
        print("Unique chunk IDs:", len(set(point_ids)))

    finally:
        client.close()
