
from llm import generate_answer


def generate_hypothetical_document(question: str) -> str:
    question = question.strip()

    if not question:
        return ""

    prompt = f"""
You are generating a hypothetical document for a document-search system.

Write a short, informative passage that could plausibly answer
the user's question.

Rules:
- Focus on the concepts and terminology likely to appear in relevant documents.
- Do not mention that this is a hypothetical document.
- Do not include a list of search keywords.
- Do not claim that the passage is verified or sourced.
- Return only the passage.

User question:
{question}

Hypothetical document:
"""

    try:
        document = generate_answer(prompt)

        if not document or not document.strip():
            return ""

        document = " ".join(document.split())

        if len(document) > 3000:
            return ""

        return document

    except Exception:
        return ""
