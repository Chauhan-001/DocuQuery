import subprocess
import sys
import unittest
from pathlib import Path


SERVICE_ROOT = Path(__file__).resolve().parents[1]


class StartupTests(unittest.TestCase):
    def test_health_does_not_load_sentence_transformers(self):
        script = """
import os
import tempfile

os.environ["GROQ_API_KEY"] = "test-key"

with tempfile.TemporaryDirectory() as storage:
    os.environ["QDRANT_STORAGE_PATH"] = storage
    from fastapi.testclient import TestClient
    import main

    with TestClient(main.app) as client:
        response = client.get("/health")

print(response.status_code)
print("sentence_transformers" in __import__("sys").modules)
"""

        result = subprocess.run(
            [sys.executable, "-c", script],
            cwd=SERVICE_ROOT,
            capture_output=True,
            text=True,
            timeout=60,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        lines = result.stdout.strip().splitlines()
        self.assertEqual(lines[-2], "200")
        self.assertEqual(lines[-1], "False")


if __name__ == "__main__":
    unittest.main()
