/** Relevance metrics operate only on frozen labels; no training or prompt optimization. */
export function relevanceMetrics(selected: string[], labels: Record<string, number>, k: number) {
  if (
    !Number.isInteger(k) ||
    k < 1 ||
    selected.length > k ||
    new Set(selected).size !== selected.length ||
    Object.values(labels).some((x) => !Number.isFinite(x) || x < 0)
  )
    throw Error("RETRIEVAL_LABELS_INVALID");
  const relevant = Object.values(labels).filter((x) => x > 0).length;
  const hits = selected.filter((id) => (labels[id] ?? 0) > 0).length;
  const first = selected.findIndex((id) => (labels[id] ?? 0) > 0);
  const dcg = (grades: number[]) =>
    grades.reduce((sum, grade, index) => sum + (2 ** grade - 1) / Math.log2(index + 2), 0);
  const ideal = dcg(
    Object.values(labels)
      .sort((a, b) => b - a)
      .slice(0, k),
  );
  return {
    precisionAtK: hits / k,
    recallAtK: relevant ? hits / relevant : 0,
    mrr: first < 0 ? 0 : 1 / (first + 1),
    ndcgAtK: ideal ? dcg(selected.map((id) => labels[id] ?? 0)) / ideal : 0,
  };
}
