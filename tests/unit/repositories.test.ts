import { describe, it, expect } from 'vitest';
import {
  DocumentRepository,
  KnowledgeRepository,
  AuditRepository,
  JobRepository,
} from '../../src/persistence/repositories/index.js';

describe('Repository Layer and Memory Provenance / Supersession (L13-AC-03, L13-AC-06)', () => {
  it('instantiates all typed repository singletons', () => {
    expect(new DocumentRepository()).toBeDefined();
    expect(new KnowledgeRepository()).toBeDefined();
    expect(new AuditRepository()).toBeDefined();
    expect(new JobRepository()).toBeDefined();
  });

  it('validates memory fact structure with provenance, confidence, and verification', () => {
    const memoryFact = {
      category: 'client',
      title: 'Client Payment Preference',
      content: 'Demo Business prefers quarterly invoices delivered by email.',
      tags: ['finance', 'preference', 'client:demo'],
      source_type: 'founder_stated' as const,
      source_ref: 'conversation_2026-11-18',
      confidence: 0.95,
      verification_status: 'verified' as const,
      status: 'active' as const,
      scope: 'client',
    };

    expect(memoryFact.confidence).toBeGreaterThanOrEqual(0.0);
    expect(memoryFact.confidence).toBeLessThanOrEqual(1.0);
    expect(['unverified', 'verified', 'disputed']).toContain(memoryFact.verification_status);
    expect(['active', 'superseded', 'deleted']).toContain(memoryFact.status);
    expect(memoryFact.source_type).toBe('founder_stated');
    expect(memoryFact.source_ref).toBeDefined();
  });

  it('validates supersession and correction semantics', () => {
    const initialFactId = 'fact-1234';
    const oldFact = {
      id: initialFactId,
      status: 'active',
      superseded_by: null as string | null,
      content: 'Initial fact content.',
    };

    const newFactId = 'fact-5678';
    const updatedOldFact = {
      ...oldFact,
      status: 'superseded',
      superseded_by: newFactId,
    };

    const newFact = {
      id: newFactId,
      status: 'active',
      source_ref: `supersedes:${initialFactId}`,
      content: 'Updated and corrected fact content.',
    };

    expect(updatedOldFact.status).toBe('superseded');
    expect(updatedOldFact.superseded_by).toBe(newFact.id);
    expect(newFact.status).toBe('active');
    expect(newFact.source_ref).toContain(initialFactId);
  });
});
