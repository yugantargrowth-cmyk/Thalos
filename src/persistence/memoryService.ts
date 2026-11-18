/**
 * THALOS Canonical Memory Service (S02 Memory)
 * ─────────────────────────────────────────────────────────────
 * Unifies the memory lifecycle across:
 * - Episodic conversation history
 * - Semantic facts
 * - Confirmed decisions & preferences
 * - Source document chunks & knowledge nodes
 *
 * Enforces provenance, verification state, non-duplication,
 * scope boundaries, supersession, and citation attribution.
 */

import { getSupabase } from '../lib/supabase.js';
import { audit } from '../lib/audit.js';
import { logger } from '../lib/logger.js';
import { knowledgeRepository, type KnowledgeNodeRow } from './repositories/knowledgeRepository.js';
import { hybridSearch, type SearchResult } from './ragSearch.js';

export type MemoryCategory =
  | 'company'
  | 'services'
  | 'market'
  | 'client'
  | 'process'
  | 'personal'
  | 'agent_memory'
  | 'decision'
  | 'preference';

export type MemorySourceType =
  | 'founder_stated'
  | 'agent_derived'
  | 'imported_document'
  | 'web_research';

export type MemoryScope = 'global' | 'client' | 'project' | 'personal';

export interface CreateMemoryItemInput {
  category: MemoryCategory | string;
  title: string;
  content: string;
  tags?: string[];
  source_type: MemorySourceType;
  source_ref?: string | null;
  confidence?: number;
  verification_status?: 'unverified' | 'verified' | 'disputed';
  scope?: MemoryScope | string;
  actor?: string;
}

export interface MemoryItemWithCitation extends KnowledgeNodeRow {
  citation: string;
}

export class MemoryService {
  /**
   * Store a memory item with strict validation and provenance rules.
   * Invariant: Uncertain LLM inferences (agent_derived) CANNOT be stored
   * as verified facts without explicit human confirmation.
   */
  async storeMemoryItem(input: CreateMemoryItemInput): Promise<KnowledgeNodeRow> {
    const actor = input.actor ?? 'system';

    // 1. Validation of required content and title
    if (!input.title?.trim()) {
      throw new Error('Memory item requires a non-empty title');
    }
    if (!input.content?.trim()) {
      throw new Error('Memory item requires non-empty content');
    }

    // 2. Enforce verification rules (S02-AC-04)
    // Agent-derived inferences MUST NOT be stored as verified facts
    let verificationStatus = input.verification_status ?? 'unverified';
    let confidence = input.confidence ?? (input.source_type === 'founder_stated' ? 1.0 : 0.7);

    if (input.source_type === 'agent_derived') {
      if (verificationStatus === 'verified') {
        logger.warn('Agent-derived inference cannot be directly stored as verified fact. Downgrading to unverified.');
        verificationStatus = 'unverified';
      }
      confidence = Math.min(confidence, 0.85); // Confidence capped for unverified inferences
    } else if (input.source_type === 'founder_stated') {
      verificationStatus = 'verified';
      confidence = 1.0;
    }

    // 3. Deduplication check (S02-AC-04)
    // Check if an active memory item with identical title and content already exists
    const existing = await knowledgeRepository.query({
      category: input.category,
      scope: input.scope ?? 'global',
      status: 'active',
    });

    const duplicate = existing.find(
      (node) =>
        node.title.trim().toLowerCase() === input.title.trim().toLowerCase() &&
        node.content.trim().toLowerCase() === input.content.trim().toLowerCase()
    );

    if (duplicate) {
      logger.info('Duplicate memory item found — reusing existing node', { id: duplicate.id, title: input.title });
      return duplicate;
    }

    // 4. Create record in knowledge_nodes
    const newNode = await knowledgeRepository.create({
      category: input.category,
      title: input.title.trim(),
      content: input.content.trim(),
      tags: input.tags ?? [],
      source_type: input.source_type,
      source_ref: input.source_ref ?? null,
      confidence,
      verification_status: verificationStatus,
      scope: input.scope ?? 'global',
    });

    // 5. Audit creation
    await audit({
      event_type: 'memory.created',
      entity_type: 'knowledge_node',
      entity_id: newNode.id,
      actor,
      description: `Stored memory item: ${newNode.title} (${newNode.category}, ${newNode.verification_status})`,
      metadata: {
        category: newNode.category,
        source_type: newNode.source_type,
        confidence: newNode.confidence,
        scope: newNode.scope,
      },
    });

    return newNode;
  }

  /**
   * Correct or supersede a memory item (S02-AC-05).
   * Atomically marks the old item as superseded and creates the new replacement.
   */
  async supersedeMemoryItem(
    oldId: string,
    updatedInput: CreateMemoryItemInput,
    actor = 'system'
  ): Promise<{ supersededId: string; newItem: KnowledgeNodeRow }> {
    const oldNode = await knowledgeRepository.getById(oldId);
    if (!oldNode) {
      throw new Error(`Memory item to supersede not found: ${oldId}`);
    }

    const { supersededNodeId, newNode } = await knowledgeRepository.supersedeNode(oldId, {
      ...updatedInput,
      source_ref: updatedInput.source_ref ?? `supersedes:${oldId}`,
    });

    await audit({
      event_type: 'memory.superseded',
      entity_type: 'knowledge_node',
      entity_id: newNode.id,
      actor,
      description: `Superseded memory item ${oldId} with new node ${newNode.id}`,
      metadata: { old_id: oldId, new_id: newNode.id },
    });

    return { supersededId: supersededNodeId, newItem: newNode };
  }

  /**
   * Explicit soft-deletion of memory with audit trail (S02-AC-05).
   */
  async deleteMemoryItem(id: string, reason = 'Deleted by user', actor = 'system'): Promise<void> {
    const supabase = getSupabase();
    const { error } = await supabase
      .from('knowledge_nodes')
      .update({
        status: 'deleted',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete memory item: ${error.message}`);
    }

    await audit({
      event_type: 'memory.deleted',
      entity_type: 'knowledge_node',
      entity_id: id,
      actor,
      description: `Deleted memory item ${id}: ${reason}`,
      metadata: { reason },
    });
  }

  /**
   * Verify or dispute a stored memory item (S02-AC-04, S02-AC-05).
   */
  async verifyMemoryItem(
    id: string,
    status: 'verified' | 'disputed',
    actor = 'founder'
  ): Promise<KnowledgeNodeRow> {
    const confidence = status === 'verified' ? 1.0 : 0.0;
    const updated = await knowledgeRepository.updateVerification(id, status, confidence);

    await audit({
      event_type: `memory.${status}`,
      entity_type: 'knowledge_node',
      entity_id: id,
      actor,
      description: `Memory item ${id} marked as ${status} by ${actor}`,
      metadata: { status, confidence },
    });

    return updated;
  }

  /**
   * Retrieve relevant memory items and document chunks with scope boundaries (S02-AC-03, S02-AC-06).
   * Prevents cross-client data leakage by filtering scope.
   */
  async retrieveRelevantMemory(
    query: string,
    options?: {
      scope?: MemoryScope | string;
      allowedScopes?: string[];
      category?: string;
      topK?: number;
    }
  ): Promise<{
    knowledgeItems: MemoryItemWithCitation[];
    documentChunks: SearchResult[];
  }> {
    const topK = options?.topK ?? 5;
    const allowedScopes = options?.allowedScopes ?? (options?.scope ? ['global', options.scope] : ['global']);

    // 1. Query structured knowledge nodes
    const nodes = await knowledgeRepository.query({
      category: options?.category,
      status: 'active',
      limit: topK * 2,
    });

    // Filter by allowed scopes to prevent data leakage (S02-AC-06)
    const filteredNodes = nodes.filter((n) => allowedScopes.includes(n.scope));

    // Basic lexical relevance filter if query provided
    const queryTerms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    const scoredNodes = filteredNodes.map((n) => {
      const text = `${n.title} ${n.content}`.toLowerCase();
      let matchCount = 0;
      for (const term of queryTerms) {
        if (text.includes(term)) matchCount++;
      }
      return { node: n, matchCount };
    });

    scoredNodes.sort((a, b) => b.matchCount - a.matchCount);

    const knowledgeItems: MemoryItemWithCitation[] = scoredNodes.slice(0, topK).map(({ node }) => ({
      ...node,
      citation: `[Knowledge: ${node.title} (${node.category})]`,
    }));

    // 2. Query document chunks using hybrid search
    let documentChunks: SearchResult[] = [];
    try {
      documentChunks = await hybridSearch({
        query,
        topK,
        category: options?.category,
      });
    } catch (err) {
      logger.warn('Hybrid search failed during memory retrieval', { error: err instanceof Error ? err.message : err });
    }

    return {
      knowledgeItems,
      documentChunks,
    };
  }
}

export const memoryService = new MemoryService();
