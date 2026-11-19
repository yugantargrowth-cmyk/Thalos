import { getSupabase } from '../../lib/supabase.js';

export interface DocumentRow {
  id: string;
  title: string;
  original_filename: string;
  file_format: string;
  mime_type: string;
  storage_path?: string | null;
  file_size_bytes: number;
  checksum_sha256: string;
  version: number;
  previous_version_id?: string | null;
  status: 'pending' | 'ingesting' | 'indexed' | 'failed' | 'superseded' | 'deleted';
  parse_method?: string | null;
  page_count?: number | null;
  char_count?: number | null;
  has_extractable_text: boolean;
  ocr_used: boolean;
  parse_error?: string | null;
  category: string;
  tags: string[];
  source_url?: string | null;
  uploaded_by: string;
  embedding_model?: string | null;
  embedding_dimensions?: number | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentChunkRow {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  char_count: number;
  page_number?: number | null;
  section_title?: string | null;
  source_url?: string | null;
  embedding?: number[] | null;
  embedding_model?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export class DocumentRepository {
  async getById(id: string): Promise<DocumentRow | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`DocumentRepository.getById error: ${error.message}`);
    return data as DocumentRow | null;
  }

  async getByChecksum(checksum: string): Promise<DocumentRow | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('checksum_sha256', checksum)
      .neq('status', 'deleted')
      .maybeSingle();

    if (error) throw new Error(`DocumentRepository.getByChecksum error: ${error.message}`);
    return data as DocumentRow | null;
  }

  async create(data: Partial<DocumentRow>): Promise<DocumentRow> {
    const supabase = getSupabase();
    const { data: created, error } = await supabase
      .from('documents')
      .insert({
        title: data.title,
        original_filename: data.original_filename,
        file_format: data.file_format,
        mime_type: data.mime_type,
        storage_path: data.storage_path ?? null,
        file_size_bytes: data.file_size_bytes ?? 0,
        checksum_sha256: data.checksum_sha256,
        version: data.version ?? 1,
        previous_version_id: data.previous_version_id ?? null,
        status: data.status ?? 'pending',
        category: data.category ?? 'general',
        tags: data.tags ?? [],
        source_url: data.source_url ?? null,
        uploaded_by: data.uploaded_by ?? 'founder',
        has_extractable_text: data.has_extractable_text ?? true,
      })
      .select('*')
      .single();

    if (error) throw new Error(`DocumentRepository.create error: ${error.message}`);
    return created as DocumentRow;
  }

  async updateStatus(
    id: string,
    status: DocumentRow['status'],
    details?: { parse_error?: string; char_count?: number; embedding_model?: string; embedding_dimensions?: number }
  ): Promise<void> {
    const supabase = getSupabase();
    const updatePayload: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
      ...(details?.parse_error !== undefined ? { parse_error: details.parse_error } : {}),
      ...(details?.char_count !== undefined ? { char_count: details.char_count } : {}),
      ...(details?.embedding_model !== undefined ? { embedding_model: details.embedding_model } : {}),
      ...(details?.embedding_dimensions !== undefined ? { embedding_dimensions: details.embedding_dimensions } : {}),
    };

    const { error } = await supabase
      .from('documents')
      .update(updatePayload)
      .eq('id', id);

    if (error) throw new Error(`DocumentRepository.updateStatus error: ${error.message}`);
  }

  async insertChunk(chunk: Omit<DocumentChunkRow, 'id' | 'created_at'>): Promise<void> {
    const supabase = getSupabase();
    const { error } = await supabase
      .from('document_chunks')
      .insert({
        document_id: chunk.document_id,
        chunk_index: chunk.chunk_index,
        content: chunk.content,
        char_count: chunk.char_count,
        page_number: chunk.page_number ?? null,
        section_title: chunk.section_title ?? null,
        source_url: chunk.source_url ?? null,
        embedding: chunk.embedding ?? null,
        embedding_model: chunk.embedding_model ?? null,
        metadata: chunk.metadata ?? {},
      });

    if (error) throw new Error(`DocumentRepository.insertChunk error: ${error.message}`);
  }

  async getChunks(documentId: string): Promise<DocumentChunkRow[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('document_chunks')
      .select('*')
      .eq('document_id', documentId)
      .order('chunk_index', { ascending: true });

    if (error) throw new Error(`DocumentRepository.getChunks error: ${error.message}`);
    return (data || []) as DocumentChunkRow[];
  }

  async supersedeDocument(oldDocId: string, _newDocId: string): Promise<void> {
    const supabase = getSupabase();
    const { error } = await supabase
      .from('documents')
      .update({
        status: 'superseded',
        updated_at: new Date().toISOString(),
      })
      .eq('id', oldDocId);

    if (error) throw new Error(`DocumentRepository.supersedeDocument error: ${error.message}`);
  }
}

export const documentRepository = new DocumentRepository();
