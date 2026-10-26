
import re
import requests

API_URL = "http://127.0.0.1:3000/answer"
DOCUMENT_ID = "doc_d36c6c5f-3eae-4c84-a4c8-c01f6d36c545"

TEST_CASES = [
    {
        "name": "Supported question",
        "question": "What does semantic search do?",
        "expect_evidence": True,
    },
    {
        "name": "Unsupported question",
        "question": "What distance metric does Qdrant use?",
        "expect_evidence": False,
    },
    {
        "name": "Partially supported question",
        "question": (
            "What does semantic search do, and "
            "what distance metric does Qdrant use?"
        ),
        "expect_evidence": True,
    },
]


def extract_citations(answer):
    pattern = r"\[Source:\s*([^,\]]+),\s*Chunk:\s*(\d+)\]"

    return [
        {
            "source": match[0].strip(),
            "chunk_index": int(match[1]),
        }
        for match in re.findall(pattern, answer)
    ]


def main():
    passed = 0
    total = 0

    for case in TEST_CASES:
        response = requests.post(
            API_URL,
            json={
                "question": case["question"],
                "document_id": DOCUMENT_ID,
            },
            timeout=60,
        )
        response.raise_for_status()
        data = response.json()

        answer = data.get("answer", "")
        sources = data.get("sources", [])
        retrieved_chunks = data.get("retrieved_chunks", 0)

        print(f"\n{case['name']}: {case['question']}")

        if case["expect_evidence"]:
            citations = extract_citations(answer)

            source_pairs = {
                (item["source"], item["chunk_index"])
                for item in sources
            }
            citation_pairs = {
                (item["source"], item["chunk_index"])
                for item in citations
            }

            checks = {
                "Evidence retrieved": (
                    retrieved_chunks > 0 and bool(sources)
                ),
                "Citation present": bool(citations),
                "Citations match retrieved sources": (
                    bool(citations)
                    and citation_pairs.issubset(source_pairs)
                ),
            }

            if case["name"] == "Partially supported question":
                answer_lower = answer.lower()

                checks["Supported part answered"] = (
                    "semantic search" in answer_lower
                    and (
                        "semantically similar" in answer_lower
                        or "embeddings" in answer_lower
                    )
                )

                checks["Missing information acknowledged"] = any(
                    phrase in answer_lower
                    for phrase in [
                        "does not specify",
                        "doesn't specify",
                        "not specified",
                        "does not state",
                        "no detail about the distance metric",
                    ]
                )

        else:
            refusal = (
                "could not find sufficient evidence" in answer.lower()
            )

            checks = {
                "Insufficient-evidence response": refusal,
                "No chunks retrieved": retrieved_chunks == 0,
                "No sources returned": len(sources) == 0,
                "No citations invented": not extract_citations(answer),
            }

        for name, success in checks.items():
            print(f"  {name}: {'PASS' if success else 'FAIL'}")
            total += 1
            passed += int(success)

        if case["name"] == "Partially supported question":
            print("  Actual answer:", repr(answer))
            print("  Sources:", sources)
            print("  Retrieved chunks:", retrieved_chunks)

    print(f"\nAnswer evaluation: {passed}/{total} checks passed")


if __name__ == "__main__":
    main()
