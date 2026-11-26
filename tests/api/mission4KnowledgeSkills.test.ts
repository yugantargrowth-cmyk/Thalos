import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/api/app.js';
import { issueToken } from '../../src/api/middleware/auth.js';
import { MemoryService } from '../../src/persistence/memoryService.js';
import { hybridSearch } from '../../src/persistence/ragSearch.js';
import { validateWorkflowDefinition } from '../../src/execution/workflowRuntime.js';
import { assembleContext } from '../../src/intelligence/contextAssembler.js';

const { mockSupabase } = vi.hoisted(() => ({
  mockSupabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock('../../src/lib/supabase.js', () => ({
  getSupabase: () => mockSupabase,
  supabase: mockSupabase,
}));

vi.mock('../../src/lib/audit.js', () => ({
  audit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/intelligence/llmClient.js', () => ({
  generateEmbedding: vi.fn().mockResolvedValue({ embedding: new Array(1536).fill(0.01) }),
  llmCall: vi.fn().mockResolvedValue({ content: 'Mock response', tokens_used: 10 }),
}));

vi.mock('../../src/persistence/ingestionQueue.js', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    queueIngestionJob: vi.fn().mockResolvedValue({ job_id: 'job-ingest-1' }),
  };
});

describe('Mission 4: Knowledge, Memory, RAG & Reusable Skills', () => {
  const app = createApp();
  const token = issueToken();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Document Upload, Ingestion & Deduplication', () => {
    it('accepts document upload and queues ingestion job', async () => {
      mockSupabase.from.mockReturnValue({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
        insert: () => ({
          select: () => ({
            single: () => Promise.resolve({
              data: {
                id: 'doc-uuid-101',
                title: 'Yugantar_Growth_Pitch.pdf',
                status: 'pending',
              },
              error: null,
            }),
          }),
        }),
      });

      const res = await request(app)
        .post('/api/knowledge/documents')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('%PDF-1.4 Mock PDF Content For Yugantar Growth'), 'Yugantar_Growth_Pitch.pdf');

      expect([201, 202]).toContain(res.status);
      expect(res.body.document).toBeDefined();
      expect(res.body.document.id).toBe('doc-uuid-101');
      expect(res.body.document.status).toBe('pending');
    });

    it('rejects duplicate document uploads based on SHA-256 checksum with 409 Conflict', async () => {
      const fileBuffer = Buffer.from('Unique document content to test duplicate checksum');

      mockSupabase.from.mockReturnValue({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({
              data: {
                id: 'doc-existing-999',
                title: 'Existing_Doc.txt',
                status: 'indexed',
              },
              error: null,
            }),
          }),
        }),
      });

      const res = await request(app)
        .post('/api/knowledge/documents')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', fileBuffer, 'Duplicate_Doc.txt');

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Duplicate file');
      expect(res.body.existing_document.id).toBe('doc-existing-999');
    });
  });

  describe('2. Hybrid RAG Search (FTS + Vector Cosine + RRF)', () => {
    it('executes hybrid search combining FTS and vector results using Reciprocal Rank Fusion', async () => {
      // Mock FTS Postgres textSearch
      mockSupabase.from.mockReturnValue({
        select: () => ({
          textSearch: () => ({
            eq: () => ({
              limit: () => Promise.resolve({
                data: [
                  {
                    id: 'chunk-fts-1',
                    document_id: 'doc-1',
                    content: 'Yugantar Growth SEO and content growth services in Ahmedabad',
                    section_title: 'Overview',
                    documents: { title: 'Yugantar Pitch', category: 'services', status: 'indexed' },
                  },
                ],
                error: null,
              }),
            }),
          }),
        }),
      });

      // Mock Vector RPC match_document_chunks
      mockSupabase.rpc.mockResolvedValueOnce({
        data: [
          {
            id: 'chunk-vec-1',
            document_id: 'doc-1',
            content: 'High-ticket B2B client acquisition systems',
            similarity: 0.88,
            documents: { title: 'Yugantar Pitch', category: 'services', status: 'indexed' },
          },
        ],
        error: null,
      });

      const results = await hybridSearch({
        query: 'B2B client acquisition and SEO in Ahmedabad',
        topK: 3,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('score');
      expect(results[0]).toHaveProperty('content');
      expect(results[0]).toHaveProperty('citation');
      expect(results.some((r) => r.content.includes('SEO') || r.content.includes('acquisition'))).toBe(true);
    });
  });

  describe('3. Memory Lifecycle, Provenance & Scope Isolation', () => {
    it('automatically marks founder_stated memories as verified with confidence 1.0', async () => {
      const memoryService = new MemoryService();

      let insertedRow: any = null;
      const mockQueryBuilder: any = {
        select: () => mockQueryBuilder,
        eq: () => mockQueryBuilder,
        order: () => Promise.resolve({ data: [], error: null }),
        insert: (data: any) => ({
          select: () => ({
            single: () => {
              insertedRow = { id: 'mem-f-1', ...data, status: 'active', created_at: new Date().toISOString() };
              return Promise.resolve({ data: insertedRow, error: null });
            },
          }),
        }),
      };
      mockSupabase.from.mockReturnValue(mockQueryBuilder);

      const item = await memoryService.storeMemoryItem({
        category: 'preference',
        title: 'Outreach Tone Preference',
        content: 'Always keep email outreach under 100 words and focus on immediate ROI.',
        source_type: 'founder_stated',
        scope: 'global',
      });

      expect(item.verification_status).toBe('verified');
      expect(item.confidence).toBe(1.0);
    });

    it('downgrades agent_derived memories to unverified to prevent hallucination persistence', async () => {
      const memoryService = new MemoryService();

      let insertedRow: any = null;
      const mockQueryBuilder: any = {
        select: () => mockQueryBuilder,
        eq: () => mockQueryBuilder,
        order: () => Promise.resolve({ data: [], error: null }),
        insert: (data: any) => ({
          select: () => ({
            single: () => {
              insertedRow = { id: 'mem-a-1', ...data, status: 'active', created_at: new Date().toISOString() };
              return Promise.resolve({ data: insertedRow, error: null });
            },
          }),
        }),
      };
      mockSupabase.from.mockReturnValue(mockQueryBuilder);

      const item = await memoryService.storeMemoryItem({
        category: 'market',
        title: 'Competitor Pricing Inference',
        content: 'Competitor X appears to be charging ~₹75,000/month based on job postings.',
        source_type: 'agent_derived',
        verification_status: 'verified', // Agent attempts to self-verify
        confidence: 0.95,
      });

      expect(item.verification_status).toBe('unverified');
      expect(item.confidence).toBeLessThanOrEqual(0.85);
    });

    it('enforces scope isolation during context assembly to prevent cross-scope data leaks', () => {
      const memories = [
        {
          title: 'Global Operating Rule',
          content: 'Founder Shlok signs off on all payments.',
          scope: 'global',
          citation: 'rule:001',
        },
        {
          title: 'Client Alpha Secret Strategy',
          content: 'Alpha target conversion rate is 4.5%.',
          scope: 'client_alpha',
          citation: 'client:alpha',
        },
        {
          title: 'Client Beta Secret Strategy',
          content: 'Beta target conversion rate is 8.0%.',
          scope: 'client_beta',
          citation: 'client:beta',
        },
      ];

      // Assemble context for Client Alpha session
      const alphaContext = assembleContext({
        systemPrompt: 'You are THALOS.',
        relevantMemories: memories,
        scopeFilter: { allowedScopes: ['global', 'client_alpha'] },
        history: [],
        userMessage: 'What are the current targets?',
      });

      const alphaPrompt = alphaContext.messages.find((m) => m.role === 'system')?.content || '';
      expect(alphaPrompt).toContain('Founder Shlok signs off on all payments.');
      expect(alphaPrompt).toContain('Alpha target conversion rate is 4.5%.');
      expect(alphaPrompt).not.toContain('Beta target conversion rate is 8.0%.'); // Strictly isolated!
    });
  });

  describe('4. Reusable Skill & Workflow Demonstrator', () => {
    it('validates DAG workflow definitions for cycle-free execution', () => {
      const validWorkflow = {
        workflow_id: 'knowledge_research',
        display_name: 'Knowledge Research Skill',
        description: 'Multi-stage search and synthesis skill',
        status: 'active',
        steps: [
          { step: 'rag_search', agent: 'researcher', tool: 'search_knowledge', depends_on: null },
          { step: 'web_supplement', agent: 'researcher', tool: 'web_search', depends_on: 'rag_search' },
          { step: 'compile_findings', agent: 'researcher', tool: 'save_to_db', depends_on: 'web_supplement' },
        ],
      };

      const result = validateWorkflowDefinition(validWorkflow);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('catches circular dependencies in invalid workflow definitions', () => {
      const cyclicWorkflow = {
        workflow_id: 'invalid_cyclic_skill',
        display_name: 'Broken Skill',
        description: 'Cyclic steps',
        status: 'active',
        steps: [
          { step: 'step_a', agent: 'scout', tool: 'web_search', depends_on: 'step_c' },
          { step: 'step_b', agent: 'researcher', tool: 'website_audit', depends_on: 'step_a' },
          { step: 'step_c', agent: 'analyst', tool: 'generate_business_report', depends_on: 'step_b' },
        ],
      };

      const result = validateWorkflowDefinition(cyclicWorkflow);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('cycle') || e.includes('Circular'))).toBe(true);
    });
  });
});
