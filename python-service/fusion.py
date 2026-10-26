
def reciprocal_rank_fusion(
    ranked_lists: list[list[str]],
    k: int = 60,
) -> list[tuple[str, float]]:
    scores = {}

    for ranked_list in ranked_lists:
        for rank, item_id in enumerate(ranked_list, start=1):
            scores[item_id] = scores.get(item_id, 0.0) + (
                1 / (k + rank)
            )

    return sorted(
        scores.items(),
        key=lambda item: item[1],
        reverse=True,
    )


if __name__ == "__main__":
    dense_ranking = ["chunk-1", "chunk-2"]
    bm25_ranking = ["chunk-0", "chunk-1", "chunk-2"]

    fused_results = reciprocal_rank_fusion(
        [dense_ranking, bm25_ranking]
    )

    print("========== RRF FUSION ==========")

    for rank, (chunk_id, score) in enumerate(
        fused_results, start=1
    ):
        print(
            f"Rank: {rank} | "
            f"Chunk: {chunk_id} | "
            f"RRF score: {score:.6f}"
        )
