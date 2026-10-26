
from qdrant_client import models

from qdrant_db import client, COLLECTION_NAME


try:
    document_id = "idempotency-test"

    result = client.count(
        collection_name=COLLECTION_NAME,
        count_filter=models.Filter(
            must=[
                models.FieldCondition(
                    key="document_id",
                    match=models.MatchValue(
                        value=document_id
                    ),
                )
            ]
        ),
        exact=True,
    )

    print("Stored points for test document:", result.count)

finally:
    client.close()
