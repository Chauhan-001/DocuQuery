import os
import tempfile
import unittest
from unittest.mock import patch

from qdrant_client import models


_temp_storage = None


def setUpModule():
    global _temp_storage
    _temp_storage = tempfile.TemporaryDirectory(prefix="docuquery-qdrant-test-")
    os.environ["QDRANT_STORAGE_PATH"] = _temp_storage.name


def tearDownModule():
    try:
        import qdrant_db

        qdrant_db.client.close()
    except Exception:
        pass
    finally:
        os.environ.pop("QDRANT_STORAGE_PATH", None)
        if _temp_storage is not None:
            _temp_storage.cleanup()


class QdrantConfigTests(unittest.TestCase):
    def setUp(self):
        import qdrant_db

        self.qdrant_db = qdrant_db

    def test_remote_config_uses_url_and_api_key(self):
        config = self.qdrant_db.resolve_qdrant_config({
            "QDRANT_URL": " https://example.cloud.qdrant.io:6333 ",
            "QDRANT_API_KEY": " test-api-key ",
            "QDRANT_STORAGE_PATH": "./ignored",
        })

        self.assertEqual(config.mode, "remote")
        self.assertEqual(config.url, "https://example.cloud.qdrant.io:6333")
        self.assertEqual(config.api_key, "test-api-key")
        self.assertIsNone(config.storage_path)

    def test_local_config_uses_storage_path_when_url_is_absent(self):
        config = self.qdrant_db.resolve_qdrant_config({
            "QDRANT_STORAGE_PATH": "./custom-storage",
        })

        self.assertEqual(config.mode, "local")
        self.assertEqual(str(config.storage_path), "custom-storage")

    def test_local_config_uses_default_storage_path(self):
        config = self.qdrant_db.resolve_qdrant_config({})

        self.assertEqual(config.mode, "local")
        self.assertEqual(config.storage_path, self.qdrant_db.DEFAULT_STORAGE_PATH)

    def test_build_remote_client_does_not_pass_local_path(self):
        config = self.qdrant_db.QdrantConfig(
            mode="remote",
            url="https://example.cloud.qdrant.io:6333",
            api_key="test-api-key",
        )

        with patch.object(self.qdrant_db, "QdrantClient") as client_class:
            self.qdrant_db.build_qdrant_client(config)

        client_class.assert_called_once_with(
            url="https://example.cloud.qdrant.io:6333",
            api_key="test-api-key",
        )

    def test_build_local_client_uses_storage_path(self):
        config = self.qdrant_db.QdrantConfig(
            mode="local",
            storage_path=self.qdrant_db.DEFAULT_STORAGE_PATH,
        )

        with patch.object(self.qdrant_db, "QdrantClient") as client_class:
            self.qdrant_db.build_qdrant_client(config)

        client_class.assert_called_once_with(
            path=str(self.qdrant_db.DEFAULT_STORAGE_PATH),
        )


class FakeCollectionClient:
    def __init__(self, fail_create=False):
        self.exists = False
        self.create_calls = 0
        self.fail_create = fail_create
        self.create_kwargs = None

    def collection_exists(self, collection_name):
        self.collection_name = collection_name
        return self.exists

    def create_collection(self, **kwargs):
        self.create_calls += 1
        self.create_kwargs = kwargs
        self.exists = True
        if self.fail_create:
            raise RuntimeError("collection was created by another instance")

    def get_collection(self, collection_name):
        return {"name": collection_name}


class CollectionInitializationTests(unittest.TestCase):
    def setUp(self):
        import qdrant_db

        self.qdrant_db = qdrant_db

    def test_initialization_is_idempotent(self):
        fake = FakeCollectionClient()

        with patch.object(self.qdrant_db, "client", fake):
            first = self.qdrant_db.initialize_collection()
            second = self.qdrant_db.initialize_collection()

        self.assertEqual(first, {"name": self.qdrant_db.COLLECTION_NAME})
        self.assertEqual(second, {"name": self.qdrant_db.COLLECTION_NAME})
        self.assertEqual(fake.create_calls, 1)
        self.assertEqual(
            fake.create_kwargs["collection_name"],
            self.qdrant_db.COLLECTION_NAME,
        )
        self.assertEqual(fake.create_kwargs["vectors_config"].size, 384)
        self.assertEqual(
            fake.create_kwargs["vectors_config"].distance,
            models.Distance.COSINE,
        )

    def test_concurrent_create_is_tolerated_if_collection_now_exists(self):
        fake = FakeCollectionClient(fail_create=True)

        with patch.object(self.qdrant_db, "client", fake):
            result = self.qdrant_db.initialize_collection()

        self.assertEqual(result, {"name": self.qdrant_db.COLLECTION_NAME})
        self.assertEqual(fake.create_calls, 1)


if __name__ == "__main__":
    unittest.main()
