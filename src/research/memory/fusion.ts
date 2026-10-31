export function reciprocalRankFusion(lists: string[][]) {
  const scores = new Map<string, number>();
  for (const list of lists) {
    let rank = 0;
    for (const id of new Set(list)) {
      rank++;
      scores.set(id, (scores.get(id) ?? 0) + 1 / (60 + rank));
    }
  }
  return [...scores]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
