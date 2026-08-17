/**
 * Normalizes text for name matching: case-insensitive, punctuation-insensitive,
 * whitespace-collapsed. Keeps unicode letters/digits (so Cyrillic names work) and spaces.
 */
export function normalizeForMatching(value: string): string {
  return value
    .trim()
    .toLowerCase()
    // Пунктуация/спецсимволы трактуются как разделители слов, а не просто вырезаются —
    // иначе "Отдел-Продаж" не совпадёт с "Отдел Продаж".
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshteinDistance(a: string, b: string): number {
  if (a === b) { return 0; }
  if (a.length === 0) { return b.length; }
  if (b.length === 0) { return a.length; }

  let previousRow = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 0; i < a.length; i++) {
    const currentRow = [i + 1];
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      currentRow.push(Math.min(
        currentRow[j] + 1,       // вставка
        previousRow[j + 1] + 1,  // удаление
        previousRow[j] + cost    // замена
      ));
    }
    previousRow = currentRow;
  }

  return previousRow[b.length];
}

/**
 * Similarity in [0, 1]: 1 = identical after normalization, then a containment bonus for
 * one name being fully contained in the other (common for abbreviated folder/class names),
 * falling back to normalized Levenshtein distance otherwise.
 */
export function similarity(a: string, b: string): number {
  const normA = normalizeForMatching(a);
  const normB = normalizeForMatching(b);

  if (normA === normB) { return 1; }
  if (!normA || !normB) { return 0; }

  if (normA.includes(normB) || normB.includes(normA)) {
    const shorter = Math.min(normA.length, normB.length);
    const longer = Math.max(normA.length, normB.length);
    return 0.85 + 0.15 * (shorter / longer);
  }

  const distance = levenshteinDistance(normA, normB);
  const maxLen = Math.max(normA.length, normB.length);
  return 1 - distance / maxLen;
}

export interface FuzzyCandidate<T> {
  key: string;
  item: T;
}

/**
 * Picks the highest-scoring candidate at or above `threshold`, or null if none qualifies.
 */
export function findBestFuzzyMatch<T>(
  query: string,
  candidates: Iterable<FuzzyCandidate<T>>,
  threshold: number
): T | null {
  let best: { item: T; score: number } | null = null;

  for (const candidate of candidates) {
    const score = similarity(query, candidate.key);
    if (score >= threshold && (!best || score > best.score)) {
      best = { item: candidate.item, score };
    }
  }

  return best ? best.item : null;
}
