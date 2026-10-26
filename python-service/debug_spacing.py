from qdrant_db import client, COLLECTION_NAME
from rag import answer_question
from search_document import retrieve_candidates
from llm import generate_answer


question = "Which database stores vectors for similarity search?"
document_id = "sample"

try:
    results = retrieve_candidates(
        question=question,
        document_id=document_id,
        limit=3,
        score_threshold=0.4,
    )

    print("\n--- STORED CHUNK TEXT ---")
    for result in results:
        print(repr(result.payload.get("text", "")))

    print("\n--- FINAL RAG ANSWER ---")
    print(repr(answer_question(question, document_id)["answer"]))

finally:
    client.close()