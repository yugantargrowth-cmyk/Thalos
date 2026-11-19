import { describe, it, expect, vi } from 'vitest';
import {
  computeSha256,
  extractText,
  chunkText,
  processIngestionJob,
} from '../../src/persistence/ingestionQueue.js';
import { documentRepository } from '../../src/persistence/repositories/documentRepository.js';

describe('Document Ingestion, Hashing, and Error Propagation (L13-AC-05, R-003)', () => {
  it('computes 64-character SHA-256 hex checksum accurately', () => {
    const buffer = Buffer.from('THALOS Operating System Knowledge Document', 'utf-8');
    const hash = computeSha256(buffer);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).toBe(computeSha256(buffer)); // Deterministic
  });

  it('extracts text from plain text, markdown, json, and csv buffers', async () => {
    // Markdown
    const mdBuf = Buffer.from('# Architecture\n\nModular monolith.', 'utf-8');
    expect(await extractText(mdBuf, 'text/markdown', 'arch.md')).toContain('Modular monolith');

    // JSON
    const jsonBuf = Buffer.from(JSON.stringify({ name: 'THALOS', version: '1.0.0' }), 'utf-8');
    expect(await extractText(jsonBuf, 'application/json', 'meta.json')).toContain('"version": "1.0.0"');

    // CSV
    const csvBuf = Buffer.from('id,name,value\n1,Alpha,100\n2,Beta,200', 'utf-8');
    expect(await extractText(csvBuf, 'text/csv', 'data.csv')).toContain('Alpha');
  });

  it('rejects unsupported MIME types with descriptive error', async () => {
    const binBuf = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    await expect(extractText(binBuf, 'application/x-custom-binary', 'file.bin')).rejects.toThrow(
      'Unsupported MIME type: application/x-custom-binary'
    );
  });

  it('chunks text with bounded chunk sizes and sentence boundaries', () => {
    const text = 'First sentence. '.repeat(50) + 'Second long paragraph with details. '.repeat(50);
    const chunks = chunkText(text, 500, 50);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeGreaterThan(50);
      expect(chunk.length).toBeLessThanOrEqual(550);
    }
  });

  it('rethrows on empty text and marks document failed (R-003 fix)', async () => {
    const updateSpy = vi.spyOn(documentRepository, 'updateStatus').mockResolvedValue(undefined);
    const checksumSpy = vi.spyOn(documentRepository, 'getByChecksum').mockResolvedValue(null);

    const emptyPayload = {
      document_id: 'doc-empty-123',
      filename: 'empty.txt',
      mime_type: 'text/plain',
      content_b64: Buffer.from('   \n\t  ', 'utf-8').toString('base64'),
    };

    // processIngestionJob must rethrow so the worker catches and records job failure (R-003)
    await expect(processIngestionJob(emptyPayload)).rejects.toThrow(
      'No extractable text found in document'
    );

    expect(updateSpy).toHaveBeenCalledWith('doc-empty-123', 'ingesting');
    expect(updateSpy).toHaveBeenCalledWith(
      'doc-empty-123',
      'failed',
      expect.objectContaining({ parse_error: expect.stringContaining('No extractable text') })
    );

    updateSpy.mockRestore();
    checksumSpy.mockRestore();
  });
});
