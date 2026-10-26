
from qdrant_client import models

from qdrant_db import client, COLLECTION_NAME, initialize_collection
from embedder import generate_embedding

documents = [
    {
        "id": 201,
        "text": "FastAPI uses Python type hints to validate request data.",
        "source": "fastapi-intro.txt",
        "document_id": "fastapi-intro",
        "chunk_index": 0,
    },
    {
        "id": 202,
        "text": "React components help developers build interactive user interfaces.",
        "source": "react-intro.txt",
        "document_id": "react-intro",
        "chunk_index": 0,
    },
]

try:
    initialize_collection()

    points = []

    for document in documents:
        vector = generate_embedding(document["text"])

        points.append(
            models.PointStruct(
                id=document["id"],
                vector=vector,
                payload={
                    "text": document["text"],
                    "source": document["source"],
                    "document_id": document["document_id"],
                    "chunk_index": document["chunk_index"],
                },
            )
        )

    client.upsert(
        collection_name=COLLECTION_NAME,
        points=points,
    )

    question = "How does FastAPI validate incoming data?"
    query_vector = generate_embedding(question)

    
    results = client.query_points(
        collection_name=COLLECTION_NAME,
        query=query_vector,
        query_filter=models.Filter(
            must=[
                models.FieldCondition(
                    key="document_id",
                    match=models.MatchValue(value="fastapi-intro"),
                    )
                    ]
                    ),
                    limit=2,
                    with_payload=True,
                    ).points


    print("\nQuestion:", question)

    for point in results:
        print("\nScore:", round(point.score, 4))
        print("Source:", point.payload["source"])
        print("Text:", point.payload["text"])

finally:
    client.close()
