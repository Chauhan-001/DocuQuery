
from llm import generate_answer


def rewrite_query(question: str) -> str:
    question = question.strip()

    if not question:
        return question

    prompt = f"""
You are a query rewriting component for a document-based RAG system.

Rewrite the user's question into one clear, standalone search query.

Rules:
- Preserve the original meaning and intent.
- Do not answer the question.
- Do not add facts that the user did not provide.
- Resolve vague wording only when the meaning is clear.
- Keep important technical terms and named entities.
- Return only the rewritten query, with no explanation or quotation marks.

Original question:
{question}
"""

    try:
        rewritten = generate_answer(prompt).strip()

        if not rewritten:
            return question

        # Avoid using an excessively long or multi-paragraph output.
        rewritten = " ".join(rewritten.split())

        if len(rewritten) > 500:
            return question

        return rewritten

    except Exception:
        # Retrieval should still work if query rewriting fails.
        return question
