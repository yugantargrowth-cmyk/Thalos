import { getSupabase } from '../../lib/supabase.js';

export interface KnowledgeNodeRow {
  id: string;
  category: 'company' | 'services' | 'market' | 'client' | 'process' | 'personal' | 'agent_memory' | string;
  title: string;
  content: string;
  tags: string[];
  source_type: 'founder_stated' | 'agent_derived' | 'imported_document' | 'web_research' | string;
  source_ref?: string | null;
  confidence: number;
  verification_status: 'unverified' | 'verified' | 'disputed';
  status: 'active' | 'superseded' | 'deleted';
  superseded_by?: string | null;
  scope: 'global' | 'client' | 'project' | 'personal' | string;
  embedding?: number[] | null;
  created_at: string;
  updated_at: string;
}

export interface CreateKnowledgeNodeInput {
  category: string;
  title: string;
  content: string;
  tags?: string[];
  source_type: 'founder_stated' | 'agent_derived' | 'imported_document' | 'web_research' | string;
  source_ref?: string | null;
  confidence?: number;
  verification_status?: 'unverified' | 'verified' | 'disputed';
  scope?: string;
  embedding?: number[] | null;
}

export class KnowledgeRepository {
  async getById(id: string): Promise<KnowledgeNodeRow | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('knowledge_nodes')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`KnowledgeRepository.getById error: ${error.message}`);
    return data as KnowledgeNodeRow | null;
  }

  async create(input: CreateKnowledgeNodeInput): Promise<KnowledgeNodeRow> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('knowledge_nodes')
      .insert({
        category: input.category,
        title: input.title,
        content: input.content,
        tags: input.tags ?? [],
        source_type: input.source_type,
        source_ref: input.source_ref ?? null,
        confidence: input.confidence ?? 1.0,
        verification_status: input.verification_status ?? 'unverified',
        status: 'active',
        scope: input.scope ?? 'global',
        embedding: input.embedding ?? null,
      })
      .select('*')
      .single();

    if (error) throw new Error(`KnowledgeRepository.create error: ${error.message}`);
    return data as KnowledgeNodeRow;
  }

  async query(filters?: {
    category?: string;
    scope?: string;
    status?: 'active' | 'superseded' | 'deleted';
    verification_status?: 'unverified' | 'verified' | 'disputed';
    tags?: string[];
    limit?: number;
  }): Promise<KnowledgeNodeRow[]> {
    const supabase = getSupabase();
    let q = supabase.from('knowledge_nodes').select('*');

    if (filters?.status) {
      q = q.eq('status', filters.status);
    } else {
      q = q.eq('status', 'active'); // default to active knowledge
    }

    if (filters?.category) q = q.eq('category', filters.category);
    if (filters?.scope) q = q.eq('scope', filters.scope);
    if (filters?.verification_status) q = q.eq('verification_status', filters.verification_status);
    if (filters?.tags && filters.tags.length > 0) q = q.contains('tags', filters.tags);
    if (filters?.limit) q = q.limit(filters.limit);

    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw new Error(`KnowledgeRepository.query error: ${error.message}`);
    return (data || []) as KnowledgeNodeRow[];
  }

  /**
   * Atomic supersession/correction: creates the new node and marks the old node
   * as superseded with reference to the replacing node.
   */
  async supersedeNode(oldNodeId: string, newNodeInput: CreateKnowledgeNodeInput): Promise<{
    supersededNodeId: string;
    newNode: KnowledgeNodeRow;
  }> {
    const supabase = getSupabase();

    // 1. Create the new replacement node
    const newNode = await this.create({
      ...newNodeInput,
      source_ref: newNodeInput.source_ref ?? `supersedes:${oldNodeId}`,
    });

    // 2. Mark old node superseded pointing to new node
    const { error } = await supabase
      .from('knowledge_nodes')
      .update({
        status: 'superseded',
        superseded_by: newNode.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', oldNodeId);

    if (error) throw new Error(`KnowledgeRepository.supersedeNode error: ${error.message}`);

    return {
      supersededNodeId: oldNodeId,
      newNode,
    };
  }

  async updateVerification(
    id: string,
    status: 'verified' | 'disputed',
    confidence?: number
  ): Promise<KnowledgeNodeRow> {
    const supabase = getSupabase();
    const updatePayload: Record<string, unknown> = {
      verification_status: status,
      updated_at: new Date().toISOString(),
      ...(confidence !== undefined ? { confidence } : {}),
    };

    const { data, error } = await supabase
      .from('knowledge_nodes')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw new Error(`KnowledgeRepository.updateVerification error: ${error.message}`);
    return data as KnowledgeNodeRow;
  }
}

export const knowledgeRepository = new KnowledgeRepository();
