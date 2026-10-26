
import requests

API_URL = "http://127.0.0.1:8000/search"
DOCUMENT_ID = "doc_d36c6c5f-3eae-4c84-a4c8-c01f6d36c545"
SCORE_THRESHOLD = 0.4
TOP_K = 3

EVALUATION_CASES = [
    {
        "question": "What does semantic search do?",
        "expected_keywords": ["semantically similar", "document chunks"],
        "should_retrieve": True,
    },
    {
        "question": "What does Qdrant store?",
        "expected_keywords": ["vector embeddings"],
        "should_retrieve": True,
    },
    {
        "question": "What distance metric does Qdrant use?",
        "expected_keywords": [],
        "should_retrieve": False,
    },
]


def main():
    hit_at_1 = 0
    hit_at_3 = 0
    supported_total = 0
    unsupported_passed = 0
    unsupported_total = 0

    for case in EVALUATION_CASES:
        response = requests.post(
            API_URL,
            json={
                "question": case["question"],
                "document_id": DOCUMENT_ID,
                "limit": TOP_K,
                "score_threshold": SCORE_THRESHOLD,
            },
            timeout=30,
        )
        response.raise_for_status()
        results = response.json()["results"]

        print(f"\nQuestion: {case['question']}")
        print(f"Retrieved chunks: {len(results)}")

        for rank, result in enumerate(results, start=1):
            print(
                f"  Rank {rank} | Chunk: {result['chunk_index']} "
                f"| Score: {result['score']:.4f}"
            )
            print("    Text:", result["text"][:250])

        if case["should_retrieve"]:
            supported_total += 1
            expected_keywords = [
                keyword.lower()
                for keyword in case["expected_keywords"]
            ]

            # A result is relevant if it contains every expected keyword.
            matching_ranks = [
                rank
                for rank, result in enumerate(results, start=1)
                if expected_keywords
                and all(
                    keyword in result["text"].lower()
                    for keyword in expected_keywords
                )
            ]

            hit_at_1 += int(1 in matching_ranks)
            hit_at_3 += int(any(rank <= TOP_K for rank in matching_ranks))

            print(
                "Hit@1:",
                "PASS" if 1 in matching_ranks else "FAIL",
            )
            print(
                "Hit@3:",
                "PASS" if any(rank <= TOP_K for rank in matching_ranks)
                else "FAIL",
            )

        else:
            unsupported_total += 1
            passed = len(results) == 0
            unsupported_passed += int(passed)

            print(
                "No-results check:",
                "PASS" if passed else "FAIL",
            )

    print("\n========== EVALUATION SUMMARY ==========")

    if supported_total:
        print(f"Hit@1: {hit_at_1}/{supported_total}")
        print(f"Hit@3: {hit_at_3}/{supported_total}")

    if unsupported_total:
        print(
            "Unsupported no-results check: "
            f"{unsupported_passed}/{unsupported_total}"
        )


if __name__ == "__main__":
    main()
