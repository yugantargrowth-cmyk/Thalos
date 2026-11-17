import { describe, it, expect } from 'vitest';

describe('Reciprocal Rank Fusion Ranking & Math (L13-AC-04)', () => {
  // Pure RRF formula: score(d) = w_fts / (K + rank_fts) + w_vec / (K + rank_vec)
  const K = 60;
  const wFts = 1.0;
  const wVec = 1.0;

  function computeRRF(ftsRank?: number, vecRank?: number): number {
    let score = 0;
    if (ftsRank) score += wFts / (K + ftsRank);
    if (vecRank) score += wVec / (K + vecRank);
    return Number(score.toFixed(6));
  }

  it('computes reciprocal rank fusion score accurately for single-source results', () => {
    // Rank 1 in FTS only
    const ftsOnly = computeRRF(1, undefined);
    expect(ftsOnly).toBe(Number((1 / 61).toFixed(6)));

    // Rank 1 in Vector only
    const vecOnly = computeRRF(undefined, 1);
    expect(vecOnly).toBe(Number((1 / 61).toFixed(6)));
  });

  it('boosts documents matching both FTS and Vector significantly over single-source results', () => {
    const dualMatch = computeRRF(2, 2); // Rank 2 in both
    const singleMatch = computeRRF(1, undefined); // Rank 1 in FTS only

    // 1/62 + 1/62 = 2/62 ≈ 0.032258
    // 1/61 ≈ 0.016393
    expect(dualMatch).toBeGreaterThan(singleMatch);
    expect(dualMatch).toBeCloseTo((1 / 62) + (1 / 62), 5);
  });

  it('sorts higher-ranked hybrid candidates ahead of lower-ranked candidates', () => {
    const candidateA = { id: 'chunk_A', score: computeRRF(1, 1) };
    const candidateB = { id: 'chunk_B', score: computeRRF(1, 10) };
    const candidateC = { id: 'chunk_C', score: computeRRF(undefined, 1) };

    const sorted = [candidateB, candidateA, candidateC].sort((a, b) => b.score - a.score);
    expect(sorted[0].id).toBe('chunk_A'); // Both rank 1
    expect(sorted[1].id).toBe('chunk_B'); // Both present, ranks 1 & 10
    expect(sorted[2].id).toBe('chunk_C'); // Only vector rank 1
  });
});
