/**
 * Marketing & Social Domain Service (S05-AC-04)
 * ─────────────────────────────────────────────────────────────
 * Manages marketing campaigns and social media post drafting/planning.
 * Enforces strict invariant: publishing to external platforms ALWAYS
 * requires prior explicit human/founder approval.
 */

import { getSupabase } from '../lib/supabase.js';
import { audit } from '../lib/audit.js';

export type SocialPostPlatform = 'linkedin' | 'twitter' | 'instagram' | 'blog' | 'newsletter';
export type SocialPostStatus = 'draft' | 'pending_approval' | 'approved' | 'published' | 'rejected';

export interface SocialPostEntity {
  id: string;
  platform: SocialPostPlatform;
  topic: string;
  content: string;
  status: SocialPostStatus;
  scheduled_for?: string | null;
  published_at?: string | null;
  approval_id?: string | null;
  approved_by?: string | null;
  campaign_id?: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface DraftPostInput {
  platform: SocialPostPlatform;
  topic: string;
  content: string;
  scheduled_for?: string | null;
  campaign_id?: string | null;
  tags?: string[];
}

export class MarketingService {
  /**
   * Draft a new social media post or content piece.
   */
  async draftPost(input: DraftPostInput, actor = 'system'): Promise<SocialPostEntity> {
    if (!input.platform) throw new Error('Platform is required');
    if (!input.topic?.trim()) throw new Error('Topic is required');
    if (!input.content?.trim()) throw new Error('Content is required');

    const supabase = getSupabase();
    const record = {
      platform: input.platform,
      topic: input.topic.trim(),
      content: input.content.trim(),
      status: 'draft' as SocialPostStatus,
      scheduled_for: input.scheduled_for ?? null,
      campaign_id: input.campaign_id ?? null,
      tags: input.tags ?? [],
    };

    const { data, error } = await supabase
      .from('marketing_posts')
      .insert(record)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`draftPost failed: ${error?.message || 'Database insert error'}`);
    }

    await audit({
      event_type: 'marketing.post_drafted',
      entity_type: 'marketing_post',
      entity_id: data.id,
      actor,
      description: `Drafted ${input.platform} post: ${input.topic}`,
      metadata: { platform: input.platform, topic: input.topic },
    });

    return data as SocialPostEntity;
  }

  /**
   * Submit a drafted post for founder approval before publication.
   */
  async submitForApproval(postId: string, actor = 'system'): Promise<SocialPostEntity> {
    if (!postId) throw new Error('Post ID is required');

    const supabase = getSupabase();
    const { data: current, error: getErr } = await supabase
      .from('marketing_posts')
      .select('*')
      .eq('id', postId)
      .single();

    if (getErr || !current) throw new Error(`Post not found: ${postId}`);
    if (current.status !== 'draft') {
      throw new Error(`Cannot submit post for approval from status: ${current.status}`);
    }

    const { data, error } = await supabase
      .from('marketing_posts')
      .update({
        status: 'pending_approval',
        updated_at: new Date().toISOString(),
      })
      .eq('id', postId)
      .select('*')
      .single();

    if (error || !data) throw new Error(`submitForApproval failed: ${error?.message}`);

    await audit({
      event_type: 'marketing.submitted_for_approval',
      entity_type: 'marketing_post',
      entity_id: postId,
      actor,
      description: `Submitted ${data.platform} post '${data.topic}' for founder approval`,
    });

    return data as SocialPostEntity;
  }

  /**
   * Approve a drafted post with cryptographic or human approval reference.
   */
  async approvePost(postId: string, approvalId: string, actor = 'founder'): Promise<SocialPostEntity> {
    if (!postId) throw new Error('Post ID is required');
    if (!approvalId) throw new Error('approvalId is required');

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('marketing_posts')
      .update({
        status: 'approved',
        approval_id: approvalId,
        approved_by: actor,
        updated_at: new Date().toISOString(),
      })
      .eq('id', postId)
      .select('*')
      .single();

    if (error || !data) throw new Error(`approvePost failed: ${error?.message}`);

    await audit({
      event_type: 'marketing.post_approved',
      entity_type: 'marketing_post',
      entity_id: postId,
      actor,
      description: `Approved ${data.platform} post '${data.topic}' with approval ${approvalId}`,
      metadata: { approval_id: approvalId },
    });

    return data as SocialPostEntity;
  }

  /**
   * Publish an approved social post.
   * INVARIANT: Publication will strictly FAIL if the post has not been approved.
   */
  async publishPost(
    postId: string,
    actor = 'system'
  ): Promise<{ post: SocialPostEntity; published_evidence: string }> {
    if (!postId) throw new Error('Post ID is required');

    const supabase = getSupabase();
    const { data: current, error: getErr } = await supabase
      .from('marketing_posts')
      .select('*')
      .eq('id', postId)
      .single();

    if (getErr || !current) throw new Error(`Post not found: ${postId}`);

    // S05-AC-04 invariant: Publishing requires approval
    if (current.status !== 'approved') {
      throw new Error(
        `Publication requires prior explicit founder approval. Current status is '${current.status}'.`
      );
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('marketing_posts')
      .update({
        status: 'published',
        published_at: now,
        updated_at: now,
      })
      .eq('id', postId)
      .select('*')
      .single();

    if (error || !data) throw new Error(`publishPost failed: ${error?.message}`);

    const publishedEvidence = `Published ${data.platform} post [${data.id}] at ${now} with approval ${data.approval_id}`;

    await audit({
      event_type: 'marketing.post_published',
      entity_type: 'marketing_post',
      entity_id: postId,
      actor,
      description: publishedEvidence,
      metadata: { platform: data.platform, published_at: now },
    });

    return {
      post: data as SocialPostEntity,
      published_evidence: publishedEvidence,
    };
  }
}

export const marketingService = new MarketingService();
