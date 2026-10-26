import unittest

from fastapi import Depends, FastAPI, HTTPException
from fastapi.testclient import TestClient

import internal_auth


class InternalAuthTests(unittest.TestCase):
    def test_development_uses_explicit_or_default_token(self):
        self.assertEqual(
            internal_auth.resolve_internal_token(None, "development"),
            internal_auth.DEV_INTERNAL_TOKEN,
        )
        self.assertEqual(
            internal_auth.resolve_internal_token("explicit-dev-token", "development"),
            "explicit-dev-token",
        )

    def test_production_rejects_missing_or_short_token(self):
        with self.assertRaises(RuntimeError):
            internal_auth.resolve_internal_token(None, "production")
        with self.assertRaises(RuntimeError):
            internal_auth.resolve_internal_token("too-short", "production")
        with self.assertRaises(RuntimeError):
            internal_auth.resolve_internal_token("", "production")

    def test_production_accepts_strong_token(self):
        token = "a" * 16
        self.assertEqual(
            internal_auth.resolve_internal_token(token, "production"),
            token,
        )

    def test_require_internal_token_rejects_missing_and_wrong_values(self):
        original = internal_auth.INTERNAL_TOKEN
        internal_auth.INTERNAL_TOKEN = "expected-token-value"
        try:
            with self.assertRaises(HTTPException) as missing:
                internal_auth.require_internal_token(None)
            self.assertEqual(missing.exception.status_code, 401)

            with self.assertRaises(HTTPException) as wrong:
                internal_auth.require_internal_token("not-the-token")
            self.assertEqual(wrong.exception.status_code, 401)

            with self.assertRaises(HTTPException):
                internal_auth.require_internal_token("")
        finally:
            internal_auth.INTERNAL_TOKEN = original

    def test_require_internal_token_accepts_exact_match(self):
        original = internal_auth.INTERNAL_TOKEN
        internal_auth.INTERNAL_TOKEN = "expected-token-value"
        try:
            self.assertIsNone(
                internal_auth.require_internal_token("expected-token-value")
            )
        finally:
            internal_auth.INTERNAL_TOKEN = original


def create_protected_app():
    app = FastAPI()

    @app.get("/protected", dependencies=[Depends(internal_auth.require_internal_token)])
    def protected():
        return {"ok": True}

    return app


class InternalAuthHttpTests(unittest.TestCase):
    def setUp(self):
        self.original = internal_auth.INTERNAL_TOKEN
        internal_auth.INTERNAL_TOKEN = "expected-token-value"
        self.client = TestClient(create_protected_app())

    def tearDown(self):
        internal_auth.INTERNAL_TOKEN = self.original

    def test_missing_header_is_rejected(self):
        response = self.client.get("/protected")
        self.assertEqual(response.status_code, 401)

    def test_wrong_header_is_rejected(self):
        response = self.client.get(
            "/protected",
            headers={"X-Internal-Token": "wrong-token"},
        )
        self.assertEqual(response.status_code, 401)

    def test_correct_header_is_accepted(self):
        response = self.client.get(
            "/protected",
            headers={"X-Internal-Token": "expected-token-value"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"ok": True})


if __name__ == "__main__":
    unittest.main()
