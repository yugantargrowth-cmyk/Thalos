import { describe, it, expect, vi, beforeEach } from 'vitest';
import { memoryService, type CreateMemoryItemInput } from '../../src/persistence/memoryService.js';
import { knowledgeRepository, type KnowledgeNodeRow } from '../../src/persistence/repositories/knowledgeRepository.js';
import { documentRepository, type DocumentRow, type DocumentChunkRow } from '../../src/persistence/repositories/documentRepository.js';
import { processIngestionJob } from '../../src/persistence/ingestionQueue.js';
import { assembleContext } from '../../src/intelligence/contextAssembler.js';
import * as ragSearchModule from '../../src/persistence/ragSearch.js';
import * as auditModule from '../../src/lib/audit.js';

describe('Mission S02: Canonical Memory System & Lifecycle (S02-AC-01 through S02-AC-08)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(ragSearchModule, 'hybridSearch').mockResolvedValue([]);
  });

  describe('S02-AC-01 & S02-AC-02: Memory Categories, Schemas & Provenance', () => {
    it('validates required fields and rejects empty titles or content', async () => {
      await expect(
        memoryService.storeMemoryItem({
          category: 'decision',
          title: '',
          content: 'Some valid content',
          source_type: 'founder_stated',
        })
      ).rejects.toThrow('Memory item requires a non-empty title');

      await expect(
        memoryService.storeMemoryItem({
          category: 'decision',
          title: 'Valid Title',
          content: '   ',
          source_type: 'founder_stated',
        })
      ).rejects.toThrow('Memory item requires non-empty content');
    });

    it('creates memory items with complete provenance, scope, and verification metadata', async () => {
      const mockCreatedNode: KnowledgeNodeRow = {
        id: 'node-101',
        category: 'preference',
        title: 'Communication Tone',
        content: 'Executive prefers concise executive summaries.',
        tags: ['preference', 'communication'],
        source_type: 'founder_stated',
        source_ref: 'conversation-founder-init',
        confidence: 1.0,
        verification_status: 'verified',
        scope: 'global',
        status: 'active',
        created_at: '2026-11-18T12:00:00Z',
        updated_at: '2026-11-18T12:00:00Z',
      };

      vi.spyOn(knowledgeRepository, 'query').mockResolvedValue([]);
      vi.spyOn(knowledgeRepository, 'create').mockResolvedValue(mockCreatedNode);
      const auditSpy = vi.spyOn(auditModule, 'audit').mockResolvedValue(undefined);

      const input: CreateMemoryItemInput = {
        category: 'preference',
        title: 'Communication Tone',
        content: 'Executive prefers concise executive summaries.',
        tags: ['preference', 'communication'],
        source_type: 'founder_stated',
        source_ref: 'conversation-founder-init',
        scope: 'global',
        actor: 'founder',
      };

      const result = await memoryService.storeMemoryItem(input);

      expect(result.id).toBe('node-101');
      expect(result.verification_status).toBe('verified');
      expect(result.confidence).toBe(1.0);
      expect(result.scope).toBe('global');
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'memory.created',
          entity_type: 'knowledge_node',
          entity_id: 'node-101',
        })
      );
    });
  });

  describe('S02-AC-04: Controlled Writes & Inference Gating', () => {
    it('gates agent-derived inferences: cannot be stored as verified facts directly', async () => {
      vi.spyOn(knowledgeRepository, 'query').mockResolvedValue([]);
      const createSpy = vi.spyOn(knowledgeRepository, 'create').mockImplementation(async (data) => ({
        id: 'node-agent-1',
        category: data.category,
        title: data.title,
        content: data.content,
        tags: data.tags ?? [],
        source_type: data.source_type,
        source_ref: data.source_ref ?? null,
        confidence: data.confidence ?? 0.7,
        verification_status: data.verification_status ?? 'unverified',
        scope: data.scope ?? 'global',
        status: 'active',
        created_at: '2026-11-18T12:00:00Z',
        updated_at: '2026-11-18T12:00:00Z',
      }));
      vi.spyOn(auditModule, 'audit').mockResolvedValue(undefined);

      // Attempt to store an agent-derived inference as verified
      const result = await memoryService.storeMemoryItem({
        category: 'decision',
        title: 'Client Payment Terms',
        content: 'Client likely pays net-15 based on chat tone.',
        source_type: 'agent_derived',
        verification_status: 'verified', // Should be downgraded!
        confidence: 0.99, // Should be capped!
        scope: 'client',
      });

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          verification_status: 'unverified',
          confidence: 0.85, // Capped at 0.85
        })
      );
      expect(result.verification_status).toBe('unverified');
      expect(result.confidence).toBeLessThanOrEqual(0.85);
    });

    it('deduplicates identical active memory items to prevent memory bloat', async () => {
      const existingActiveNode: KnowledgeNodeRow = {
        id: 'node-existing-1',
        category: 'company',
        title: 'Mission Statement',
        content: 'Autonomous enterprise operations.',
        tags: ['company'],
        source_type: 'founder_stated',
        confidence: 1.0,
        verification_status: 'verified',
        scope: 'global',
        status: 'active',
        created_at: '2026-11-18T10:00:00Z',
        updated_at: '2026-11-18T10:00:00Z',
      };

      vi.spyOn(knowledgeRepository, 'query').mockResolvedValue([existingActiveNode]);
      const createSpy = vi.spyOn(knowledgeRepository, 'create');

      const result = await memoryService.storeMemoryItem({
        category: 'company',
        title: '  Mission Statement  ',
        content: 'Autonomous enterprise operations.  ',
        source_type: 'founder_stated',
        scope: 'global',
      });

      // Must return existing node without calling create
      expect(result.id).toBe('node-existing-1');
      expect(createSpy).not.toHaveBeenCalled();
    });
  });

  describe('S02-AC-05: Supersession, Soft-Deletion & Verification Lifecycle', () => {
    it('supersedes old memory items atomically and records audit trail', async () => {
      const oldNode: KnowledgeNodeRow = {
        id: 'node-old-1',
        category: 'services',
        title: 'Base Pricing',
        content: 'Monthly retainer is $5,000.',
        tags: ['pricing'],
        source_type: 'founder_stated',
        confidence: 1.0,
        verification_status: 'verified',
        scope: 'global',
        status: 'active',
        created_at: '2026-11-01T00:00:00Z',
        updated_at: '2026-11-01T00:00:00Z',
      };

      const newNode: KnowledgeNodeRow = {
        id: 'node-new-2',
        category: 'services',
        title: 'Base Pricing',
        content: 'Monthly retainer is $7,500 effective Dec 2026.',
        tags: ['pricing'],
        source_type: 'founder_stated',
        confidence: 1.0,
        verification_status: 'verified',
        scope: 'global',
        status: 'active',
        created_at: '2026-11-18T12:00:00Z',
        updated_at: '2026-11-18T12:00:00Z',
      };

      vi.spyOn(knowledgeRepository, 'getById').mockResolvedValue(oldNode);
      vi.spyOn(knowledgeRepository, 'supersedeNode').mockResolvedValue({
        supersededNodeId: 'node-old-1',
        newNode,
      });
      const auditSpy = vi.spyOn(auditModule, 'audit').mockResolvedValue(undefined);

      const res = await memoryService.supersedeMemoryItem(
        'node-old-1',
        {
          category: 'services',
          title: 'Base Pricing',
          content: 'Monthly retainer is $7,500 effective Dec 2026.',
          source_type: 'founder_stated',
        },
        'founder'
      );

      expect(res.supersededId).toBe('node-old-1');
      expect(res.newItem.id).toBe('node-new-2');
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'memory.superseded',
          entity_id: 'node-new-2',
        })
      );
    });

    it('verifies or disputes memory items and updates confidence', async () => {
      const updatedNode: KnowledgeNodeRow = {
        id: 'node-agent-1',
        category: 'decision',
        title: 'Client Payment Terms',
        content: 'Client pays net-15.',
        tags: [],
        source_type: 'agent_derived',
        confidence: 1.0,
        verification_status: 'verified',
        scope: 'client',
        status: 'active',
        created_at: '2026-11-18T10:00:00Z',
        updated_at: '2026-11-18T12:00:00Z',
      };

      vi.spyOn(knowledgeRepository, 'updateVerification').mockResolvedValue(updatedNode);
      const auditSpy = vi.spyOn(auditModule, 'audit').mockResolvedValue(undefined);

      const verified = await memoryService.verifyMemoryItem('node-agent-1', 'verified', 'founder');
      expect(verified.verification_status).toBe('verified');
      expect(verified.confidence).toBe(1.0);
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'memory.verified',
          entity_id: 'node-agent-1',
        })
      );
    });
  });

  describe('S02-AC-03: Hybrid RAG Search with Citations and Ranking', () => {
    it('returns formatted citations and fusion ranking details in search results', async () => {
      vi.restoreAllMocks(); // restore mock so hybridSearch runs
      // Mock supabase for hybridSearch
      const mockChunks = [
        {
          id: 'chunk-rag-1',
          document_id: 'doc-rag-1',
          content: 'THALOS operating procedures for mission execution.',
          section_title: 'Execution Guide',
          page_number: 3,
          source_url: 'https://thalos.internal/docs/execution',
          documents: { title: 'Standard Operating Procedures', category: 'process', status: 'indexed' },
        },
      ];

      const { getSupabase } = await import('../../src/lib/supabase.js');
      const supabase = getSupabase();
      vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnThis(),
        textSearch: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: mockChunks, error: null }),
      } as any);

      const results = await ragSearchModule.hybridSearch({
        query: 'mission execution procedures',
        topK: 1,
      });

      expect(results.length).toBe(1);
      expect(results[0].citation).toBe('[Source: Standard Operating Procedures > Execution Guide (p. 3)]');
      expect(results[0].score).toBeGreaterThan(0);
      expect(results[0].metadata?.fusionMethod).toBe('fts_only');
    });
  });

  describe('S02-AC-06: Scope Boundaries & Data Isolation', () => {
    it('retrieves memories strictly within authorized scopes, preventing cross-client data leakage', async () => {
      const nodes: KnowledgeNodeRow[] = [
        {
          id: 'node-global',
          category: 'company',
          title: 'Company SLA',
          content: 'Standard SLA is 99.9%',
          tags: [],
          source_type: 'founder_stated',
          confidence: 1.0,
          verification_status: 'verified',
          scope: 'global',
          status: 'active',
          created_at: '2026-11-18T10:00:00Z',
          updated_at: '2026-11-18T10:00:00Z',
        },
        {
          id: 'node-client-a',
          category: 'client',
          title: 'Client A Secret Strategy',
          content: 'Client A discount is 25%',
          tags: [],
          source_type: 'founder_stated',
          confidence: 1.0,
          verification_status: 'verified',
          scope: 'client-A',
          status: 'active',
          created_at: '2026-11-18T10:00:00Z',
          updated_at: '2026-11-18T10:00:00Z',
        },
        {
          id: 'node-client-b',
          category: 'client',
          title: 'Client B Custom Terms',
          content: 'Client B pays via wire only',
          tags: [],
          source_type: 'founder_stated',
          confidence: 1.0,
          verification_status: 'verified',
          scope: 'client-B',
          status: 'active',
          created_at: '2026-11-18T10:00:00Z',
          updated_at: '2026-11-18T10:00:00Z',
        },
      ];

      vi.spyOn(knowledgeRepository, 'query').mockResolvedValue(nodes);

      // Querying with scope 'client-A'
      const retrievalForClientA = await memoryService.retrieveRelevantMemory('strategy terms', {
        allowedScopes: ['global', 'client-A'],
      });

      const retrievedIds = retrievalForClientA.knowledgeItems.map((k) => k.id);
      expect(retrievedIds).toContain('node-global');
      expect(retrievedIds).toContain('node-client-a');
      expect(retrievedIds).not.toContain('node-client-b'); // Client B data ISOLATED!

      // Verify citation format
      expect(retrievalForClientA.knowledgeItems[0].citation).toMatch(/^\[Knowledge: .*\]$/);
    });

    it('enforces scope boundaries during context assembly', () => {
      const memories = [
        {
          title: 'Global Guidelines',
          content: 'Operate transparently.',
          scope: 'global',
          citation: '[Knowledge: Global Guidelines]',
        },
        {
          title: 'Client A Confidential',
          content: 'Client A NDA active until 2030.',
          scope: 'client-A',
          citation: '[Knowledge: Client A Confidential]',
        },
        {
          title: 'Client B Confidential',
          content: 'Client B proprietary algorithm.',
          scope: 'client-B',
          citation: '[Knowledge: Client B Confidential]',
        },
      ];

      // Context assembly for Client A session
      const assembledForA = assembleContext({
        systemPrompt: 'You are THALOS.',
        userMessage: 'What are the applicable terms?',
        history: [],
        relevantMemories: memories,
        scopeFilter: { allowedScopes: ['global', 'client-A'] },
      });

      const systemText = assembledForA.messages[0].content;
      expect(systemText).toContain('Global Guidelines');
      expect(systemText).toContain('Client A Confidential');
      expect(systemText).not.toContain('Client B Confidential'); // Never leaked!
      expect(assembledForA.sourcesAttributed).toContain('[Knowledge: Client A Confidential]');
      expect(assembledForA.sourcesAttributed).not.toContain('[Knowledge: Client B Confidential]');
    });
  });

  describe('S02-AC-07: Document Checksum Deduplication & Version Supersession', () => {
    it('skips redundant chunking/embedding on identical checksum and reuses existing indexed chunks', async () => {
      const buffer = Buffer.from('Duplicate Document Content for Testing', 'utf-8');
      const checksum = 'mock-sha256-checksum-123456';

      const existingIndexedDoc: DocumentRow = {
        id: 'doc-existing-master',
        title: 'Original Specs',
        original_filename: 'specs.txt',
        file_format: 'text',
        mime_type: 'text/plain',
        file_size_bytes: buffer.length,
        checksum_sha256: checksum,
        version: 1,
        status: 'indexed',
        has_extractable_text: true,
        ocr_used: false,
        category: 'specs',
        tags: [],
        uploaded_by: 'founder',
        char_count: 38,
        embedding_model: 'text-embedding-004',
        embedding_dimensions: 768,
        created_at: '2026-11-18T10:00:00Z',
        updated_at: '2026-11-18T10:00:00Z',
      };

      const existingChunks: DocumentChunkRow[] = [
        {
          id: 'chunk-1',
          document_id: 'doc-existing-master',
          chunk_index: 0,
          content: 'Duplicate Document Content for Testing',
          char_count: 38,
          embedding: [0.1, 0.2, 0.3],
          embedding_model: 'text-embedding-004',
          created_at: '2026-11-18T10:00:00Z',
        },
      ];

      vi.spyOn(documentRepository, 'getByChecksum').mockResolvedValue(existingIndexedDoc);
      vi.spyOn(documentRepository, 'getChunks').mockResolvedValue(existingChunks);
      const insertChunkSpy = vi.spyOn(documentRepository, 'insertChunk').mockResolvedValue(undefined);
      const updateStatusSpy = vi.spyOn(documentRepository, 'updateStatus').mockResolvedValue(undefined);
      vi.spyOn(documentRepository, 'getById').mockResolvedValue({
        ...existingIndexedDoc,
        id: 'doc-new-duplicate',
        previous_version_id: null,
      });

      await processIngestionJob({
        document_id: 'doc-new-duplicate',
        filename: 'specs_copy.txt',
        mime_type: 'text/plain',
        checksum_sha256: checksum,
        content_b64: buffer.toString('base64'),
      });

      // Verify chunks were copied with deduplication attribution
      expect(insertChunkSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          document_id: 'doc-new-duplicate',
          chunk_index: 0,
          metadata: { deduplicated_from: 'doc-existing-master' },
        })
      );

      // Verify doc marked indexed without invoking LLM embedding
      expect(updateStatusSpy).toHaveBeenCalledWith('doc-new-duplicate', 'indexed', {
        char_count: 38,
        embedding_model: 'text-embedding-004',
        embedding_dimensions: 768,
      });
    });

    it('supersedes previous document version after indexing new version', async () => {
      const buffer = Buffer.from('Brand new content with updated terms v2', 'utf-8');
      const checksum = 'new-checksum-version-2';

      vi.spyOn(documentRepository, 'getByChecksum').mockResolvedValue(null); // New content
      vi.spyOn(documentRepository, 'insertChunk').mockResolvedValue(undefined);
      vi.spyOn(documentRepository, 'updateStatus').mockResolvedValue(undefined);
      vi.spyOn(documentRepository, 'getById').mockResolvedValue({
        id: 'doc-v2',
        title: 'Contract v2',
        original_filename: 'contract.txt',
        file_format: 'text',
        mime_type: 'text/plain',
        file_size_bytes: buffer.length,
        checksum_sha256: checksum,
        version: 2,
        previous_version_id: 'doc-v1', // References previous version!
        status: 'pending',
        has_extractable_text: true,
        ocr_used: false,
        category: 'legal',
        tags: [],
        uploaded_by: 'founder',
        created_at: '2026-11-18T12:00:00Z',
        updated_at: '2026-11-18T12:00:00Z',
      });

      const supersedeSpy = vi.spyOn(documentRepository, 'supersedeDocument').mockResolvedValue(undefined);

      await processIngestionJob({
        document_id: 'doc-v2',
        filename: 'contract.txt',
        mime_type: 'text/plain',
        checksum_sha256: checksum,
        content_b64: buffer.toString('base64'),
      });

      // Old doc-v1 must be superseded
      expect(supersedeSpy).toHaveBeenCalledWith('doc-v1', 'doc-v2');
    });
  });
});
