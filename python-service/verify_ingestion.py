from qdrant_client import models
from qdrant_db import client, COLLECTION_NAME
from embedder import generate_embedding
try:
    question = "How does FastAPI validate request data?"
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
                    limit=5,
                    with_payload=True,
                    ).points

    print("Retrieved points:", len(results))

    for point in results:
        print("\nID:", point.id)
        print("Source:", point.payload["source"])
        print("Chunk index:", point.payload["chunk_index"])
        print("Text:", point.payload["text"])
        print("Score:", round(point.score, 4))

finally:
    client.close()