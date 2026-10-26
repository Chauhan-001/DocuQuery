
from qdrant_client import models

from qdrant_db import (
    client,
    COLLECTION_NAME,
    initialize_collection,
)

try:
    initialize_collection()

    client.upsert(
        collection_name=COLLECTION_NAME,
        points=[
            models.PointStruct(
                id=101,
                vector=[0.1] * 384,
                payload={
                    "text": "FastAPI uses Python type hints to define request data.",
                    "source": "fastapi-intro.txt",
                    "document_id": "fastapi-intro",
                    "chunk_index": 0,
                },
            )
        ],
    )

    results = client.query_points(
        collection_name=COLLECTION_NAME,
        query=[0.1] * 384,
        limit=1,
        with_payload=True,
    ).points

    for point in results:
        print("Point ID:", point.id)
        print("Payload:", point.payload)
        print("Score:", point.score)

finally:
    client.close()
