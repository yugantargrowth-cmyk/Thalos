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
}

export interface SearchOptions {
  query: string;
  topK?: number;
  category?: string;
}

export async function hybridSearch(options: SearchOptions): Promise<SearchResult[]> {
  const { query, topK = 5, category } = options;
  const supabase = getSupabase();

  // 1. Full-text search (always available)
  let ftsQ = supabase
    .from('document_chunks')
    .select(`
      id, document_id, content, section_title, source_url, page_number,
      documents!inner(title, category, status)
    `)
    .textSearch('fts_vector', query, { type: 'websearch' })
    .eq('documents.status', 'indexed')
    .limit(topK * 2);

  if (category) ftsQ = ftsQ.eq('documents.category', category);
  const { data: ftsResults } = await ftsQ;

  // 2. Vector search (requires embeddings to exist)
  let vectorResults: typeof ftsResults = [];
  try {
    const { embedding } = await generateEmbedding(query);
    const { data: vecData } = await supabase.rpc('match_document_chunks', {
      query_embedding: embedding,
      match_threshold: 0.5,
      match_count: topK,
      filter_category: category ?? null,
    });
    vectorResults = (vecData as typeof ftsResults) ?? [];
  } catch (err) {
    logger.warn('Vector search failed, using FTS only', { error: err instanceof Error ? err.message : err });
  }

  // 3. Merge and deduplicate by chunk id, keeping highest score
  const merged = new Map<string, SearchResult>();

  for (const r of (ftsResults ?? [])) {
    const doc = Array.isArray(r.documents) ? r.documents[0] : r.documents;
    merged.set(r.id, {
      chunk_id: r.id,
      document_id: r.document_id,
      document_title: doc?.title ?? 'Unknown',
      content: r.content,
      score: 0.5,
      section_title: r.section_title ?? undefined,
      source_url: r.source_url ?? undefined,
      page_number: r.page_number ?? undefined,
    });
  }

  for (const r of (vectorResults ?? [])) {
    const existing = merged.get(r.id);
    const score = (r as unknown as { similarity?: number }).similarity ?? 0;
    if (!existing || score > existing.score) {
      const doc = Array.isArray(r.documents) ? r.documents[0] : r.documents;
      merged.set(r.id, {
        chunk_id: r.id,
        document_id: r.document_id,
        document_title: doc?.title ?? 'Unknown',
        content: r.content,
        score,
        section_title: r.section_title ?? undefined,
        source_url: r.source_url ?? undefined,
        page_number: r.page_number ?? undefined,
      });
    }
  }

  return Array.from(merged.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
