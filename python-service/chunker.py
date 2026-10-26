
import re


def chunk_text(
    text: str,
    chunk_size: int = 500,
    overlap: int = 100,
) -> list[str]:
    if chunk_size <= 0:
        raise ValueError("chunk_size must be positive")

    if overlap < 0 or overlap >= chunk_size:
        raise ValueError(
            "overlap must be non-negative and smaller than chunk_size"
        )

    text = text.strip()

    if not text:
        return []

    sentences = re.split(
        r"(?<=[.!?])\s+|\n+",
        text,
    )

    sentences = [
        sentence.strip()
        for sentence in sentences
        if sentence.strip()
    ]

    chunks = []
    current_sentences = []
    current_length = 0

    for sentence in sentences:
        extra_length = len(sentence) + (
            1 if current_sentences else 0
        )

        if (
            current_sentences
            and current_length + extra_length > chunk_size
        ):
            chunks.append(" ".join(current_sentences))

            # Keep trailing sentences as approximate overlap.
            overlap_sentences = []
            overlap_length = 0

            for previous in reversed(current_sentences):
                added_length = len(previous) + (
                    1 if overlap_sentences else 0
                )

                if (
                    overlap_sentences
                    and overlap_length + added_length > overlap
                ):
                    break

                overlap_sentences.insert(0, previous)
                overlap_length += added_length

                if overlap_length >= overlap:
                    break

            current_sentences = overlap_sentences
            current_length = len(" ".join(current_sentences))

        if current_sentences:
            current_length += 1

        current_sentences.append(sentence)
        current_length += len(sentence)

    if current_sentences:
        chunks.append(" ".join(current_sentences))

    return chunks


if __name__ == "__main__":
    text = (
        "RAG retrieves relevant evidence. "
        "FastAPI validates request data. "
        "Qdrant stores vector embeddings. "
        "Semantic search finds relevant content."
    )

    chunks = chunk_text(
        text,
        chunk_size=65,
        overlap=30,
    )

    for index, chunk in enumerate(chunks):
        print(f"\nChunk {index}:")
        print(chunk)
        print("Characters:", len(chunk))

