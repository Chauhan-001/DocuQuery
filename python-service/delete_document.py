
from qdrant_client import models

from qdrant_db import client, COLLECTION_NAME


def delete_document(document_id: str) -> None:
    client.delete(
        collection_name=COLLECTION_NAME,
        points_selector=models.FilterSelector(
            filter=models.Filter(
                must=[
                    models.FieldCondition(
                        key="document_id",
                        match=models.MatchValue(
                            value=document_id
                        ),
                    )
                ]
            )
        ),
        wait=True,
    )


if __name__ == "__main__":
    try:
        document_id = "idempotency-test"

        before = client.count(
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

        print("Points before deletion:", before.count)

        delete_document(document_id)

        after = client.count(
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

        print("Points after deletion:", after.count)

    finally:
        client.close()
