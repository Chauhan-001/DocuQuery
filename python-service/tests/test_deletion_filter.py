import os
import tempfile
import unittest
from pathlib import Path

from qdrant_client import models


class DeletionFilterIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.TemporaryDirectory()
        os.environ["QDRANT_STORAGE_PATH"] = cls.temp_dir.name

        # Import after pointing Qdrant at the temporary directory so the real
        # repository storage is never touched by the test.
        import qdrant_db
        import delete_document

        cls.qdrant_db = qdrant_db
        cls.delete_document = delete_document
        qdrant_db.initialize_collection()

    @classmethod
    def tearDownClass(cls):
        try:
            cls.qdrant_db.client.close()
        finally:
            cls.temp_dir.cleanup()
            os.environ.pop("QDRANT_STORAGE_PATH", None)

    def _upsert(self, rows):
        payloads = [
            models.PointStruct(
                id=point_id,
                vector=[0.1] * self.qdrant_db.VECTOR_SIZE,
                payload={
                    "document_id": document_id,
                    "source": f"{document_id}.pdf",
                    "text": f"text for {document_id}",
                    "chunk_index": chunk_index,
                    "chunk_length": 10,
                },
            )
            for point_id, document_id, chunk_index in rows
        ]
        self.qdrant_db.client.upsert(
            collection_name=self.qdrant_db.COLLECTION_NAME,
            points=payloads,
        )

    def _count(self, document_id: str) -> int:
        result = self.qdrant_db.client.count(
            collection_name=self.qdrant_db.COLLECTION_NAME,
            count_filter=models.Filter(
                must=[
                    models.FieldCondition(
                        key="document_id",
                        match=models.MatchValue(value=document_id),
                    )
                ]
            ),
            exact=True,
        )
        return result.count

    def test_delete_filter_removes_only_the_intended_document(self):
        self._upsert([
            (1001, "delete-a-1", 0),
            (1002, "delete-a-1", 1),
            (1003, "delete-b-1", 0),
        ])

        self.assertEqual(self._count("delete-a-1"), 2)
        self.assertEqual(self._count("delete-b-1"), 1)

        self.delete_document.delete_document("delete-a-1")

        self.assertEqual(self._count("delete-a-1"), 0)
        self.assertEqual(self._count("delete-b-1"), 1)

    def test_deletion_is_idempotent_and_retry_safe(self):
        self._upsert([
            (2001, "delete-a-2", 0),
            (2002, "delete-b-2", 0),
        ])

        self.delete_document.delete_document("delete-a-2")
        # Retrying an already-deleted document must not raise or touch others.
        self.delete_document.delete_document("delete-a-2")

        self.assertEqual(self._count("delete-a-2"), 0)
        self.assertEqual(self._count("delete-b-2"), 1)


if __name__ == "__main__":
    unittest.main()
