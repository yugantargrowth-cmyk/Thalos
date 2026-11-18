/**
 * CRM Domain Service
 * ─────────────────────────────────────────────────────────────
 * Centralizes Lead, Client, Project, Task, and Activity lifecycle
 * operations, stage transitions, and audit records (L12-AC-02, L12-AC-03, L12-AC-07).
 */

import { getSupabase } from '../lib/supabase.js';
import { audit } from '../lib/audit.js';
import type {
  LeadEntity,
  LeadStage,
  ClientEntity,
  ClientStatus,
  ProjectEntity,
  TaskEntity,
  TaskStatus,
} from './entities.js';

export function normalisePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (digits.length === 13 && digits.startsWith('091')) return `+${digits.slice(1)}`;
  return phone.startsWith('+') ? phone : `+${digits}`;
}

export const VALID_LEAD_STAGES = [
  'new', 'researching', 'outreach_drafted', 'contacted', 'follow_up',
  'qualified', 'proposal_sent', 'negotiating', 'won', 'lost', 'unqualified',
];
export const VALID_TASK_STATUSES = ['todo', 'in_progress', 'blocked', 'review', 'completed', 'cancelled'];
export const VALID_TASK_PRIORITIES = ['low', 'medium', 'high', 'critical'];
export const VALID_PROJECT_STATUSES = ['planning', 'active', 'on_hold', 'completed', 'cancelled'];
export const VALID_CLIENT_STATUSES = ['active', 'paused', 'churned', 'onboarding'];

export interface CreateLeadInput {
  name: string;
  phone: string;
  contact_name?: string | null;
  email?: string | null;
  industry?: string | null;
  location?: string | null;
  source?: string | null;
  stage?: LeadStage | string;
  website?: string | null;
  estimated_value?: number | null;
  notes?: string | null;
  assigned_agent?: string | null;
}

export interface CreateClientInput {
  business_name: string;
  contact_name: string;
  phone: string;
  email?: string | null;
  monthly_value?: number;
  start_date: string;
  status?: ClientStatus | string;
  packages?: unknown[];
  notes?: string | null;
  converted_from_lead_id?: string | null;
}

export interface CreateProjectInput {
  client_id: string;
  name: string;
  description?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  milestones?: unknown[];
  deliverables?: unknown[];
  tags?: string[];
}

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  client_id?: string | null;
  project_id?: string | null;
  parent_task_id?: string | null;
  status?: TaskStatus | string;
  priority?: string;
  assigned_to?: string | null;
  assigned_agent?: string | null;
  due_date?: string | null;
  acceptance_criteria?: string | null;
  tags?: string[];
}

export interface ScheduleFollowUpInput {
  entity_type: string;
  entity_id: string;
  due_date: string;
  due_time?: string | null;
  reminder_note: string;
  assigned_agent?: string | null;
}

export class CrmService {
  // ── Leads ───────────────────────────────────────────────────

  async createLead(input: CreateLeadInput, actor = 'system'): Promise<LeadEntity> {
    if (!input.name || (typeof input.name === 'string' && !input.name.trim())) {
      throw new Error('Missing required input: name');
    }
    if (!input.phone || (typeof input.phone === 'string' && !input.phone.trim())) {
      throw new Error('Missing required input: phone');
    }

    const stage = input.stage ?? 'new';
    if (!VALID_LEAD_STAGES.includes(stage)) {
      throw new Error(`Invalid stage: ${stage}. Valid: ${VALID_LEAD_STAGES.join(', ')}`);
    }

    const normalised = normalisePhone(input.phone.trim());
    const record = {
      name: input.name.trim(),
      phone: normalised,
      contact_name: input.contact_name?.trim() ?? null,
      email: input.email?.trim() ?? null,
      source: input.source ?? 'manual',
      stage,
      industry: input.industry?.trim() ?? null,
      location: input.location?.trim() ?? null,
      website: input.website?.trim() ?? null,
      notes: input.notes ?? null,
      assigned_agent: input.assigned_agent ?? null,
      estimated_value: input.estimated_value ?? null,
    };

    const supabase = getSupabase();
    const { data, error } = await supabase.from('leads').insert(record).select().single();
    if (error || !data) throw new Error(`create_lead failed: ${error?.message || 'unknown error'}`);

    await audit({
      event_type: 'tool.create_lead',
      entity_type: 'lead',
      entity_id: data.id,
      actor,
      description: `Lead created: ${data.name} (${data.phone})`,
      metadata: { stage: data.stage, source: data.source },
    });

    return data as LeadEntity;
  }

  async updateLead(leadId: string, updates: Record<string, unknown>, actor = 'system'): Promise<{ lead: LeadEntity; updated_fields: string[] }> {
    if (!leadId || (typeof leadId === 'string' && !leadId.trim())) {
      throw new Error('Missing required input: lead_id');
    }

    const allowed: Record<string, unknown> = {};
    const updateable = [
      'stage', 'contact_name', 'email', 'phone', 'industry', 'location', 'website',
      'notes', 'next_action', 'follow_up_date', 'assigned_agent', 'score', 'tags',
      'research_status', 'verified_claims', 'name', 'estimated_value',
    ];

    for (const key of updateable) {
      if (updates[key] !== undefined) allowed[key] = updates[key];
    }

    if (allowed.stage && !VALID_LEAD_STAGES.includes(allowed.stage as string)) {
      throw new Error(`Invalid stage: ${allowed.stage}`);
    }
    if (Object.keys(allowed).length === 0) {
      throw new Error('No fields to update provided');
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('leads')
      .update(allowed)
      .eq('id', leadId)
      .select()
      .single();

    if (error) throw new Error(`update_lead failed: ${error.message}`);
    if (!data) throw new Error(`Lead not found: ${leadId}`);

    await audit({
      event_type: 'tool.update_lead',
      entity_type: 'lead',
      entity_id: leadId,
      actor,
      description: `Lead updated: fields [${Object.keys(allowed).join(', ')}]`,
    });

    return { lead: data as LeadEntity, updated_fields: Object.keys(allowed) };
  }

  async logLeadActivity(
    leadId: string,
    activity: string,
    description: string,
    agent?: string | null,
    metadata: Record<string, unknown> = {},
    actor = 'system'
  ): Promise<{ activity_id: string; lead_id: string; activity: string }> {
    if (!leadId) throw new Error('Missing required input: lead_id');
    if (!activity) throw new Error('Missing required input: activity');
    if (!description) throw new Error('Missing required input: description');

    const record = {
      lead_id: leadId,
      activity,
      description,
      agent: agent ?? null,
      metadata,
    };

    const supabase = getSupabase();
    const { data, error } = await supabase.from('lead_activities').insert(record).select().single();
    if (error || !data) throw new Error(`log_lead_activity failed: ${error?.message || 'unknown error'}`);

    await audit({
      event_type: 'tool.log_lead_activity',
      entity_type: 'lead',
      entity_id: leadId,
      actor,
      description: `Activity '${activity}' logged on lead ${leadId}`,
    });

    return { activity_id: data.id, lead_id: leadId, activity };
  }

  async scheduleFollowUp(
    input: ScheduleFollowUpInput,
    actor = 'system'
  ): Promise<{ follow_up_id: string; entity_type: string; entity_id: string; due_date: string }> {
    if (!input.entity_type) throw new Error('Missing required input: entity_type');
    if (!input.entity_id) throw new Error('Missing required input: entity_id');
    if (!input.due_date) throw new Error('Missing required input: due_date');
    if (!input.reminder_note) throw new Error('Missing required input: reminder_note');

    const record = {
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      due_date: input.due_date,
      due_time: input.due_time ?? null,
      reminder_note: input.reminder_note,
      assigned_agent: input.assigned_agent ?? null,
      status: 'pending',
    };

    const supabase = getSupabase();
    const { data, error } = await supabase.from('follow_ups').insert(record).select().single();
    if (error || !data) throw new Error(`schedule_follow_up failed: ${error?.message || 'unknown error'}`);

    if (input.entity_type === 'lead') {
      await supabase.from('leads').update({ follow_up_date: input.due_date }).eq('id', input.entity_id);
    }

    await audit({
      event_type: 'tool.schedule_follow_up',
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      actor,
      description: `Follow-up scheduled for ${input.entity_type} ${input.entity_id} on ${input.due_date}`,
    });

    return { follow_up_id: data.id, entity_type: input.entity_type, entity_id: input.entity_id, due_date: input.due_date };
  }

  // ── Clients ─────────────────────────────────────────────────

  async createClient(input: CreateClientInput, actor = 'founder'): Promise<ClientEntity> {
    if (!input.business_name || !input.business_name.trim()) throw new Error('Missing required input: business_name');
    if (!input.contact_name || !input.contact_name.trim()) throw new Error('Missing required input: contact_name');
    if (!input.phone || !input.phone.trim()) throw new Error('Missing required input: phone');
    if (!input.start_date || !input.start_date.trim()) throw new Error('Missing required input: start_date');

    const monthly_value = input.monthly_value ?? 0;
    if (monthly_value < 0) throw new Error('monthly_value must be non-negative');

    const status = input.status ?? 'onboarding';
    if (!VALID_CLIENT_STATUSES.includes(status)) {
      throw new Error(`Invalid status: ${status}. Valid: ${VALID_CLIENT_STATUSES.join(', ')}`);
    }

    const record = {
      business_name: input.business_name.trim(),
      contact_name: input.contact_name.trim(),
      phone: input.phone.trim(),
      email: input.email?.trim() ?? null,
      monthly_value,
      start_date: input.start_date,
      status,
      packages: input.packages ?? [],
      notes: input.notes ?? null,
      converted_from_lead_id: input.converted_from_lead_id ?? null,
    };

    const supabase = getSupabase();
    const { data, error } = await supabase.from('clients').insert(record).select().single();
    if (error || !data) throw new Error(`create_client failed: ${error?.message || 'unknown error'}`);

    if (input.converted_from_lead_id) {
      await supabase.from('leads').update({ stage: 'won' }).eq('id', input.converted_from_lead_id);
    }

    await audit({
      event_type: 'tool.create_client',
      entity_type: 'client',
      entity_id: data.id,
      actor,
      description: `Client created: ${data.business_name}`,
    });

    return data as ClientEntity;
  }

  async updateClient(clientId: string, updates: Record<string, unknown>, actor = 'founder'): Promise<ClientEntity> {
    if (!clientId) throw new Error('Missing required input: client_id');

    if (updates.status && !VALID_CLIENT_STATUSES.includes(updates.status as string)) {
      throw new Error(`Invalid status: ${updates.status}`);
    }

    const allowed = ['business_name', 'contact_name', 'email', 'phone', 'monthly_value', 'status', 'packages', 'notes', 'tags', 'deliverable_tracker'];
    const filtered: Record<string, unknown> = {};
    for (const f of allowed) {
      if (updates[f] !== undefined) filtered[f] = updates[f];
    }
    if (Object.keys(filtered).length === 0) throw new Error('No fields to update');

    const supabase = getSupabase();
    const { data, error } = await supabase.from('clients').update(filtered).eq('id', clientId).select().single();
    if (error) throw new Error(`update_client failed: ${error.message}`);
    if (!data) throw new Error(`Client not found: ${clientId}`);

    await audit({
      event_type: 'client.updated',
      entity_type: 'client',
      entity_id: clientId,
      actor,
      description: `Client updated: ${data.business_name}`,
    });

    return data as ClientEntity;
  }

  // ── Tasks ───────────────────────────────────────────────────

  async createTask(input: CreateTaskInput, actor = 'system'): Promise<TaskEntity> {
    if (!input.title || !input.title.trim()) throw new Error('Missing required input: title');

    const priority = input.priority ?? 'medium';
    if (!VALID_TASK_PRIORITIES.includes(priority)) {
      throw new Error(`Invalid priority: ${priority}. Valid: ${VALID_TASK_PRIORITIES.join(', ')}`);
    }

    const record = {
      title: input.title.trim(),
      description: input.description ?? null,
      project_id: input.project_id ?? null,
      parent_task_id: input.parent_task_id ?? null,
      status: input.status ?? 'todo',
      priority,
      assigned_to: input.assigned_to ?? null,
      due_date: input.due_date ?? null,
      acceptance_criteria: input.acceptance_criteria ?? null,
      tags: input.tags ?? [],
    };

    const supabase = getSupabase();
    const { data, error } = await supabase.from('tasks').insert(record).select().single();
    if (error || !data) throw new Error(`create_task failed: ${error?.message || 'unknown error'}`);

    await audit({
      event_type: 'tool.create_task',
      entity_type: 'task',
      entity_id: data.id,
      actor,
      description: `Task created: ${data.title}`,
    });

    return data as TaskEntity;
  }

  async updateTask(taskId: string, updates: Record<string, unknown>, actor = 'system'): Promise<{ task: TaskEntity; updated_fields: string[] }> {
    if (!taskId || (typeof taskId === 'string' && !taskId.trim())) {
      throw new Error('Missing required input: task_id');
    }

    const allowed: Record<string, unknown> = {};
    for (const key of ['title', 'description', 'status', 'priority', 'assigned_to', 'due_date', 'acceptance_criteria', 'evidence', 'tags']) {
      if (updates[key] !== undefined) allowed[key] = updates[key];
    }

    if (allowed.status && !VALID_TASK_STATUSES.includes(allowed.status as string)) {
      throw new Error(`Invalid status: ${allowed.status}`);
    }
    if (allowed.priority && !VALID_TASK_PRIORITIES.includes(allowed.priority as string)) {
      throw new Error(`Invalid priority: ${allowed.priority}`);
    }

    if (allowed.status === 'completed') {
      allowed.completed_date = new Date().toISOString().split('T')[0];
    }
    if (Object.keys(allowed).length === 0) throw new Error('No fields to update');

    const supabase = getSupabase();
    const { data, error } = await supabase.from('tasks').update(allowed).eq('id', taskId).select().single();
    if (error) throw new Error(`update_task failed: ${error.message}`);
    if (!data) throw new Error(`Task not found: ${taskId}`);

    await audit({
      event_type: 'tool.update_task',
      entity_type: 'task',
      entity_id: taskId,
      actor,
      description: `Task updated: ${data.title}`,
      metadata: { fields: Object.keys(allowed) },
    });

    return { task: data as TaskEntity, updated_fields: Object.keys(allowed) };
  }

  // ── Projects ────────────────────────────────────────────────

  async createProject(input: CreateProjectInput, actor = 'system'): Promise<ProjectEntity> {
    if (!input.client_id || !input.client_id.trim()) throw new Error('Missing required input: client_id');
    if (!input.name || !input.name.trim()) throw new Error('Missing required input: name');

    const record = {
      client_id: input.client_id,
      name: input.name.trim(),
      description: input.description ?? null,
      status: 'planning',
      start_date: input.start_date ?? null,
      due_date: input.due_date ?? null,
      milestones: input.milestones ?? [],
      deliverables: input.deliverables ?? [],
      tags: input.tags ?? [],
    };

    const supabase = getSupabase();
    const { data, error } = await supabase.from('projects').insert(record).select().single();
    if (error || !data) throw new Error(`create_project failed: ${error?.message || 'unknown error'}`);

    await audit({
      event_type: 'tool.create_project',
      entity_type: 'project',
      entity_id: data.id,
      actor,
      description: `Project created: ${data.name} for client ${input.client_id}`,
    });

    return data as ProjectEntity;
  }

  async updateProject(projectId: string, updates: Record<string, unknown>, actor = 'system'): Promise<{ project: ProjectEntity; updated_fields: string[] }> {
    if (!projectId || (typeof projectId === 'string' && !projectId.trim())) {
      throw new Error('Missing required input: project_id');
    }

    const allowed: Record<string, unknown> = {};
    for (const key of ['name', 'description', 'status', 'start_date', 'due_date', 'milestones', 'deliverables', 'blockers', 'tags']) {
      if (updates[key] !== undefined) allowed[key] = updates[key];
    }

    if (allowed.status && !VALID_PROJECT_STATUSES.includes(allowed.status as string)) {
      throw new Error(`Invalid status: ${allowed.status}`);
    }
    if (allowed.status === 'completed') {
      allowed.completed_date = new Date().toISOString().split('T')[0];
    }
    if (Object.keys(allowed).length === 0) throw new Error('No fields to update');

    const supabase = getSupabase();
    const { data, error } = await supabase.from('projects').update(allowed).eq('id', projectId).select().single();
    if (error) throw new Error(`update_project failed: ${error.message}`);
    if (!data) throw new Error(`Project not found: ${projectId}`);

    await audit({
      event_type: 'tool.update_project',
      entity_type: 'project',
      entity_id: projectId,
      actor,
      description: `Project updated: ${data.name}`,
      metadata: { fields: Object.keys(allowed) },
    });

    return { project: data as ProjectEntity, updated_fields: Object.keys(allowed) };
  }
}

export const crmService = new CrmService();
