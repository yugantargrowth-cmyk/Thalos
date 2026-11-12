-- ============================================================
-- Migration 006: Vector index for document_chunks
-- RUN ONLY AFTER bulk ingestion is complete.
-- Building an index on an empty or small table wastes resources.
-- Requires at least ~100 chunks to be meaningful.
-- ============================================================

-- Create IVFFlat index for cosine similarity search
-- lists=100 is appropriate for up to ~1M vectors; adjust for larger datasets
CREATE INDEX CONCURRENTLY IF NOT EXISTS document_chunks_vector_idx
  ON document_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- match_document_chunks RPC function — called by RAG search
CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding vector,
  match_threshold float,
  match_count int,
  filter_category text DEFAULT null
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  content text,
  section_title text,
  source_url text,
  page_number int,
  similarity float,
  documents jsonb
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.content,
    dc.section_title,
    dc.source_url,
    dc.page_number,
    1 - (dc.embedding <=> query_embedding) AS similarity,
    jsonb_build_object('title', d.title, 'category', d.category, 'status', d.status) AS documents
  FROM document_chunks dc
  JOIN documents d ON d.id = dc.document_id
  WHERE
    dc.embedding IS NOT NULL
    AND d.status = 'indexed'
    AND (filter_category IS NULL OR d.category = filter_category)
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
