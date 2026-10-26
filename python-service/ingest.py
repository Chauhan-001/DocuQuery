
from uuid import uuid5, NAMESPACE_URL

from chunker import chunk_text
from delete_document import delete_document
from embedder import generate_embedding
from qdrant_client import models
from qdrant_db import client, COLLECTION_NAME, initialize_collection
from text_cleaner import normalize_text


def make_chunk_id(document_id: str, chunk_index: int) -> str:
    unique_name = f"docuquery:{document_id}:chunk:{chunk_index}"
    return str(uuid5(NAMESPACE_URL, unique_name))


def ingest_chunk(
    text: str,
    source: str,
    document_id: str,
    chunk_index: int,
) -> str:
    initialize_collection()

    vector = generate_embedding(text)

    point = models.PointStruct(
        id=make_chunk_id(document_id, chunk_index),
        vector=vector,
        payload={
            "text": text,
            "source": source,
            "document_id": document_id,
            "chunk_index": chunk_index,
            "chunk_length": len(text),
        },
    )

    client.upsert(
        collection_name=COLLECTION_NAME,
        points=[point],
    )

    return str(point.id)


def ingest_chunks(chunks: list[dict]) -> list[str]:
    if not chunks:
        return []

    initialize_collection()

    points = []

    for chunk in chunks:
        chunk_text_value = chunk["text"]
        vector = generate_embedding(chunk_text_value)

        point = models.PointStruct(
            id=make_chunk_id(
                chunk["document_id"],
                chunk["chunk_index"],
            ),
            vector=vector,
            payload={
                "text": chunk_text_value,
                "source": chunk["source"],
                "document_id": chunk["document_id"],
                "chunk_index": chunk["chunk_index"],
                "chunk_length": len(chunk_text_value),
            },
        )

        points.append(point)

    client.upsert(
        collection_name=COLLECTION_NAME,
        points=points,
    )

    return [str(point.id) for point in points]


def ingest_document(
    text: str,
    source: str,
    document_id: str,
    chunk_size: int = 500,
    overlap: int = 100,
) -> list[str]:
    # Step 1: Normalize whitespace before chunking.
    text = normalize_text(text)

    # Step 2: Split the normalized text into chunks.
    text_chunks = chunk_text(
        text,
        chunk_size=chunk_size,
        overlap=overlap,
    )

    # Step 3: Replace any previously stored version.
    delete_document(document_id)

    # Step 4: Attach metadata to every chunk.
    chunks = [
        {
            "text": chunk,
            "source": source,
            "document_id": document_id,
            "chunk_index": index,
        }
        for index, chunk in enumerate(text_chunks)
    ]

    # Step 5: Generate embeddings and store chunks in Qdrant.
    return ingest_chunks(chunks)


if __name__ == "__main__":
    try:
        document_id = "replacement-test"

        original_text = (
            "FastAPI validates request data. "
            "Qdrant stores vector embeddings. "
        ) * 100

        updated_text = (
            "FastAPI validates request data. "
        ) * 20

        first_ids = ingest_document(
            text=original_text,
            source="guide.txt",
            document_id=document_id,
            chunk_size=200,
            overlap=40,
        )

        print("Original chunks:", len(first_ids))

        updated_ids = ingest_document(
            text=updated_text,
            source="guide.txt",
            document_id=document_id,
            chunk_size=200,
            overlap=40,
        )

        result = client.count(
            collection_name=COLLECTION_NAME,
            count_filter=models.Filter(
                must=[
                    models.FieldCondition(
                        key="document_id",
                        match=models.MatchValue(
                            value=document_id,
                        ),
                    )
                ]
            ),
            exact=True,
        )

        print("Updated chunks:", len(updated_ids))
        print("Stored chunks:", result.count)
        print(
            "Replacement successful:",
            result.count == len(updated_ids),
        )

    finally:
        client.close()
