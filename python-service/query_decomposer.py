from llm import generate_answer


def decompose_query(question: str) -> list[str]:
    question = question.strip()

    if not question:
        return []

    prompt = f"""
You are a query decomposition component for a document-based RAG system.

Break the user's question into 2 to 4 focused search questions
only when the question requires multiple pieces of information.

Rules:
- Preserve the original intent.
- Do not answer the questions.
- Do not invent facts.
- Each question must be independently searchable.
- If the question is simple, return it as one question.
- Return only a numbered list of questions.
- Do not include explanations.

User question:
{question}
"""

    try:
        response = generate_answer(prompt)

        if not response or not response.strip():
            return [question]

        sub_questions = []

        for line in response.splitlines():
            line = line.strip()

            if not line:
                continue

            # Remove numbering such as "1." or "2)"
            cleaned = line.lstrip("0123456789").lstrip(".)- ").strip()

            if cleaned:
                sub_questions.append(cleaned)

        # Reject malformed or excessively large responses.
        if not sub_questions or len(sub_questions) > 4:
            return [question]

        if any(len(item) > 500 for item in sub_questions):
            return [question]

        # Remove exact duplicates while preserving order.
        unique_questions = list(dict.fromkeys(sub_questions))
                # Fall back if the model returns duplicate-only or invalid output.
        if not unique_questions:
            return [question]

        if len(unique_questions) > 4:
            return [question]

        return unique_questions
        return unique_questions or [question]

    except Exception:
        return [question]