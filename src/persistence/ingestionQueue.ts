import { getSupabase } from '../lib/supabase.js';
import { generateEmbedding } from '../intelligence/llmClient.js';
import { logger } from '../lib/logger.js';


export interface IngestionJob {
  document_id: string;
  filename: string;
  mime_type: string;
  buffer: Buffer;
}

/** Queue a document for async ingestion */
export async function queueIngestionJob(job: IngestionJob): Promise<string> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('jobs').insert({
    job_type: 'ingest_document',
    priority: 5,
    payload: {
      document_id: job.document_id,
      filename: job.filename,
      mime_type: job.mime_type,
      // Buffer as base64 for transport through job queue
      content_b64: job.buffer.toString('base64'),
    },
    idempotency_key: `ingest_${job.document_id}`,
  }).select('id').single();

  if (error) throw new Error(`Failed to queue ingestion job: ${error.message}`);
  return data!.id;
}

/** Process a single ingestion job — called by worker */
export async function processIngestionJob(payload: Record<string, unknown>): Promise<void> {
  const supabase = getSupabase();
  const docId = payload.document_id as string;
  const filename = payload.filename as string;
  const mimeType = payload.mime_type as string;
  const buffer = Buffer.from(payload.content_b64 as string, 'base64');

  await supabase.from('documents').update({ status: 'ingesting' }).eq('id', docId);

  try {
    // Extract text
    const text = await extractText(buffer, mimeType, filename);

    if (!text.trim()) {
      await supabase.from('documents').update({
        status: 'failed',
        parse_error: 'No extractable text found',
        has_extractable_text: false,
      }).eq('id', docId);
      return;
    }

    // Chunk text
    const CHUNK_SIZE = 800;
    const OVERLAP = 100;
    const chunks = chunkText(text, CHUNK_SIZE, OVERLAP);

    // Embed and persist each chunk
    const EMBEDDING_MODEL = 'text-embedding-004';
    let indexed = 0;

    for (let i = 0; i < chunks.length; i++) {
      try {
        const { embedding } = await generateEmbedding(chunks[i]);
        await supabase.from('document_chunks').insert({
          document_id: docId,
          chunk_index: i,
          content: chunks[i],
          char_count: chunks[i].length,
          embedding,
          embedding_model: EMBEDDING_MODEL,
        });
        indexed++;
      } catch (embErr) {
        logger.warn('Chunk embedding failed — storing without vector', {
          doc_id: docId, chunk_index: i,
          error: embErr instanceof Error ? embErr.message : embErr,
        });
        // Store chunk without embedding (FTS still works)
        await supabase.from('document_chunks').insert({
          document_id: docId,
          chunk_index: i,
          content: chunks[i],
          char_count: chunks[i].length,
        });
        indexed++;
      }
    }

    await supabase.from('documents').update({
      status: 'indexed',
      char_count: text.length,
      embedding_model: EMBEDDING_MODEL,
      embedding_dimensions: 768, // text-embedding-004 default
    }).eq('id', docId);

    logger.info('Document ingested', { doc_id: docId, chunks: indexed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Ingestion failed', { doc_id: docId, error: msg });
    await supabase.from('documents').update({
      status: 'failed',
      parse_error: msg.slice(0, 500),
    }).eq('id', docId);
  }
}

async function extractText(buffer: Buffer, mimeType: string, _filename: string): Promise<string> {
  if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
    return buffer.toString('utf-8');
  }

  if (mimeType === 'application/json') {
    return JSON.stringify(JSON.parse(buffer.toString('utf-8')), null, 2);
  }

  if (mimeType === 'text/csv') {
    return buffer.toString('utf-8');
  }

  if (mimeType === 'application/pdf') {
    const pdfParse = (await import('pdf-parse')).default;
    const result = await pdfParse(buffer);
    return result.text;
  }

  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    const xlsx = await import('xlsx');
    const wb = xlsx.read(buffer);
    return wb.SheetNames
      .map(name => xlsx.utils.sheet_to_csv(wb.Sheets[name]))
      .join('\n---\n');
  }

  throw new Error(`Unsupported MIME type: ${mimeType}`);
}

function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + chunkSize;

    // Try to break at sentence boundary
    if (end < text.length) {
      const breakPoint = text.lastIndexOf('. ', end);
      if (breakPoint > start + chunkSize / 2) end = breakPoint + 1;
    }

    chunks.push(text.slice(start, end).trim());
    start = end - overlap;
  }

  return chunks.filter(c => c.length > 50);
}
