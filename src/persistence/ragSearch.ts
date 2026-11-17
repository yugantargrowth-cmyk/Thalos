import { getSupabase } from '../lib/supabase.js';
import { generateEmbedding } from '../intelligence/llmClient.js';
import { logger } from '../lib/logger.js';

export interface SearchResult {
  chunk_id: string;
  document_id: string;
  document_title: string;
  content: string;
  score: number;
  section_title?: string;
  source_url?: string;
  page_number?: number;
  metadata?: {
    ftsRank?: number;
    vectorRank?: number;
    vectorSimilarity?: number;
    fusionMethod: 'reciprocal_rank_fusion' | 'fts_only' | 'vector_only';
  };
}

export interface SearchOptions {
  query: string;
  topK?: number;
  category?: string;
  ftsWeight?: number;
  vectorWeight?: number;
  rrfK?: number;
}

/**
 * Hybrid Search combining Full-Text Search (BM25 via Postgres tsvector) and
 * Vector Cosine Similarity (pgvector) using Reciprocal Rank Fusion (RRF).
 *
 * Ranking Formula (RRF):
 * score(d) = (w_fts / (K + rank_fts(d))) + (w_vec / (K + rank_vec(d)))
 * where default K = 60, w_fts = 1.0, w_vec = 1.0.
 */
export async function hybridSearch(options: SearchOptions): Promise<SearchResult[]> {
  const {
    query,
    topK = 5,
    category,
    ftsWeight = 1.0,
    vectorWeight = 1.0,
    rrfK = 60,
  } = options;

  const supabase = getSupabase();

  // 1. Full-text search (lexical BM25 match against fts_vector)
  let ftsQ = supabase
    .from('document_chunks')
    .select(`
      id, document_id, content, section_title, source_url, page_number,
      documents!inner(title, category, status)
    `)
    .textSearch('fts_vector', query, { type: 'websearch' })
    .eq('documents.status', 'indexed')
    .limit(topK * 3);

  if (category) ftsQ = ftsQ.eq('documents.category', category);
  const { data: ftsResults, error: ftsError } = await ftsQ;

  if (ftsError) {
    logger.warn('Full-text search query failed or skipped', { error: ftsError.message });
  }

  // 2. Vector search (dense semantic match against embeddings)
  let vectorResults: Array<{
    id: string;
    document_id: string;
    content: string;
    section_title?: string;
    source_url?: string;
    page_number?: number;
    similarity: number;
    documents: { title: string; category: string; status: string } | Array<{ title: string; category: string; status: string }>;
  }> = [];

  try {
    const { embedding } = await generateEmbedding(query);
    const { data: vecData, error: vecError } = await supabase.rpc('match_document_chunks', {
      query_embedding: embedding,
      match_threshold: 0.4,
      match_count: topK * 3,
      filter_category: category ?? null,
    });

    if (vecError) {
      logger.warn('Vector RPC search error', { error: vecError.message });
    } else if (vecData) {
      vectorResults = vecData;
    }
  } catch (err) {
    logger.warn('Vector search unavailable, falling back to FTS only', {
      error: err instanceof Error ? err.message : err,
    });
  }

  // 3. Reciprocal Rank Fusion (RRF)
  interface Candidate {
    chunk_id: string;
    document_id: string;
    document_title: string;
    content: string;
    section_title?: string;
    source_url?: string;
    page_number?: number;
    ftsRank?: number;
    vectorRank?: number;
    vectorSimilarity?: number;
    rrfScore: number;
  }

  const candidates = new Map<string, Candidate>();

  // Process FTS rankings (1-indexed rank)
  (ftsResults ?? []).forEach((r, idx) => {
    const rank = idx + 1;
    const doc = Array.isArray(r.documents) ? r.documents[0] : r.documents;
    candidates.set(r.id, {
      chunk_id: r.id,
      document_id: r.document_id,
      document_title: doc?.title ?? 'Untitled',
      content: r.content,
      section_title: r.section_title ?? undefined,
      source_url: r.source_url ?? undefined,
      page_number: r.page_number ?? undefined,
      ftsRank: rank,
      rrfScore: ftsWeight / (rrfK + rank),
    });
  });

  // Process Vector rankings (1-indexed rank)
  vectorResults.forEach((r, idx) => {
    const rank = idx + 1;
    const doc = Array.isArray(r.documents) ? r.documents[0] : r.documents;
    const existing = candidates.get(r.id);

    const vecContribution = vectorWeight / (rrfK + rank);

    if (existing) {
      existing.vectorRank = rank;
      existing.vectorSimilarity = r.similarity;
      existing.rrfScore += vecContribution;
    } else {
      candidates.set(r.id, {
        chunk_id: r.id,
        document_id: r.document_id,
        document_title: doc?.title ?? 'Untitled',
        content: r.content,
        section_title: r.section_title ?? undefined,
        source_url: r.source_url ?? undefined,
        page_number: r.page_number ?? undefined,
        vectorRank: rank,
        vectorSimilarity: r.similarity,
        rrfScore: vecContribution,
      });
    }
  });

  // Sort candidates by combined RRF score descending
  const sorted = Array.from(candidates.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, topK);

  return sorted.map((c) => ({
    chunk_id: c.chunk_id,
    document_id: c.document_id,
    document_title: c.document_title,
    content: c.content,
    score: Number(c.rrfScore.toFixed(6)),
    section_title: c.section_title,
    source_url: c.source_url,
    page_number: c.page_number,
    metadata: {
      ftsRank: c.ftsRank,
      vectorRank: c.vectorRank,
      vectorSimilarity: c.vectorSimilarity,
      fusionMethod: c.ftsRank && c.vectorRank
        ? 'reciprocal_rank_fusion'
        : (c.vectorRank ? 'vector_only' : 'fts_only'),
    },
  }));
}
