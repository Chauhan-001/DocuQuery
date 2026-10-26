
from rag import answer_question

result = answer_question(
    question="What does Qdrant store?",
    document_id="api-test",
    score_threshold=0.0,
)

print("Answer:")
print(result["answer"])

print("\nSources:")
for source in result["sources"]:
    print(source)

print("\nRetrieved chunks:", result["retrieved_chunks"])
