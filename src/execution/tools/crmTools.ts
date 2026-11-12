/**
 * CRM Tool Handlers
 * ─────────────────────────────────────────────────────────────
 * create_lead, update_lead, log_lead_activity, schedule_follow_up,
 * create_client, create_task, update_task, create_project, update_project
 *
 * All writes are audited. No fake data returned on failure.
 */

import { getSupabase } from '../../lib/supabase.js';
import { audit } from '../../lib/audit.js';

type HandlerResult = { output: unknown; evidence: string };

// ── Validation helpers ────────────────────────────────────────

const VALID_LEAD_STAGES = [
  'new','researching','outreach_drafted','contacted','follow_up',
  'qualified','proposal_sent','negotiating','won','lost','unqualified',
];
const VALID_TASK_STATUSES = ['todo','in_progress','blocked','review','completed','cancelled'];
const VALID_TASK_PRIORITIES = ['low','medium','high','critical'];
const VALID_PROJECT_STATUSES = ['planning','active','on_hold','completed','cancelled'];
const VALID_CLIENT_STATUSES = ['active','paused','churned','onboarding'];

function require<T>(inputs: Record<string, unknown>, key: string): T {
  const v = inputs[key];
  if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
    throw new Error(`Missing required input: ${key}`);
  }
  return v as T;
}

// ── create_lead ───────────────────────────────────────────────

export async function executeCreateLead(inputs: Record<string, unknown>): Promise<HandlerResult> {
  const name = require<string>(inputs, 'name');
  const phone = require<string>(inputs, 'phone');

  const record = {
    name: name.trim(),
    phone: phone.trim(),
    contact_name: (inputs.contact_name as string | undefined) ?? null,
    email: (inputs.email as string | undefined) ?? null,
    source: (inputs.source as string | undefined) ?? 'manual',
    stage: (inputs.stage as string | undefined) ?? 'new',
    industry: (inputs.industry as string | undefined) ?? null,
    location: (inputs.location as string | undefined) ?? null,
    website: (inputs.website as string | undefined) ?? null,
    notes: (inputs.notes as string | undefined) ?? null,
    assigned_agent: (inputs.assigned_agent as string | undefined) ?? null,
  };

  if (record.stage && !VALID_LEAD_STAGES.includes(record.stage)) {
    throw new Error(`Invalid stage: ${record.stage}. Valid: ${VALID_LEAD_STAGES.join(', ')}`);
  }

  const supabase = getSupabase();
  const { data, error } = await supabase.from('leads').insert(record).select().single();
  if (error) throw new Error(`create_lead failed: ${error.message}`);

  await audit({
    event_type: 'tool.create_lead',
    entity_type: 'lead',
    entity_id: data.id,
    description: `Lead created: ${name} (${phone})`,
    metadata: { stage: record.stage, source: record.source },
  });

  return {
    output: { id: data.id, name: data.name, phone: data.phone, stage: data.stage },
    evidence: `Lead ${data.id} (${name}) created in stage '${data.stage}' at ${new Date().toISOString()}`,
  };
}

// ── update_lead ───────────────────────────────────────────────

export async function executeUpdateLead(inputs: Record<string, unknown>): Promise<HandlerResult> {
  const lead_id = require<string>(inputs, 'lead_id');

  const allowed: Record<string, unknown> = {};
  const updateable = [
    'stage','contact_name','email','phone','industry','location','website',
    'notes','next_action','follow_up_date','assigned_agent','score','tags',
    'research_status','verified_claims',
  ];

  for (const key of updateable) {
    if (inputs[key] !== undefined) allowed[key] = inputs[key];
  }

  if (allowed.stage && !VALID_LEAD_STAGES.includes(allowed.stage as string)) {
    throw new Error(`Invalid stage: ${allowed.stage}`);
  }
  if (Object.keys(allowed).length === 0) throw new Error('No fields to update provided');

  const supabase = getSupabase();
  const { data, error } = await supabase.from('leads').update(allowed).eq('id', lead_id).select().single();
  if (error) throw new Error(`update_lead failed: ${error.message}`);
  if (!data) throw new Error(`Lead not found: ${lead_id}`);

  await audit({
    event_type: 'tool.update_lead',
    entity_type: 'lead',
    entity_id: lead_id,
    description: `Lead updated: fields [${Object.keys(allowed).join(', ')}]`,
  });

  return {
    output: { id: data.id, updated_fields: Object.keys(allowed), stage: data.stage },
    evidence: `Lead ${lead_id} updated fields [${Object.keys(allowed).join(', ')}] at ${new Date().toISOString()}`,
  };
}

// ── log_lead_activity ─────────────────────────────────────────

export async function executeLogLeadActivity(inputs: Record<string, unknown>): Promise<HandlerResult> {
  const lead_id = require<string>(inputs, 'lead_id');
  const activity = require<string>(inputs, 'activity');
  const description = require<string>(inputs, 'description');

  const record = {
    lead_id,
    activity,
    description,
    agent: (inputs.agent as string | undefined) ?? null,
    metadata: (inputs.metadata as Record<string, unknown> | undefined) ?? {},
  };

  const supabase = getSupabase();
  const { data, error } = await supabase.from('lead_activities').insert(record).select().single();
  if (error) throw new Error(`log_lead_activity failed: ${error.message}`);

  return {
    output: { activity_id: data.id, lead_id, activity },
    evidence: `Activity '${activity}' logged on lead ${lead_id} at ${new Date().toISOString()}`,
  };
}

// ── schedule_follow_up ────────────────────────────────────────

export async function executeScheduleFollowUp(inputs: Record<string, unknown>): Promise<HandlerResult> {
  const entity_type = require<string>(inputs, 'entity_type');
  const entity_id = require<string>(inputs, 'entity_id');
  const due_date = require<string>(inputs, 'due_date');
  const reminder_note = require<string>(inputs, 'reminder_note');

  const record = {
    entity_type,
    entity_id,
    due_date,
    due_time: (inputs.due_time as string | undefined) ?? null,
    reminder_note,
    assigned_agent: (inputs.assigned_agent as string | undefined) ?? null,
    status: 'pending',
  };

  const supabase = getSupabase();
  const { data, error } = await supabase.from('follow_ups').insert(record).select().single();
  if (error) throw new Error(`schedule_follow_up failed: ${error.message}`);

  return {
    output: { follow_up_id: data.id, entity_type, entity_id, due_date },
    evidence: `Follow-up scheduled for ${entity_type} ${entity_id} on ${due_date} at ${new Date().toISOString()}`,
  };
}

// ── create_client ─────────────────────────────────────────────

export async function executeCreateClient(inputs: Record<string, unknown>): Promise<HandlerResult> {
  const business_name = require<string>(inputs, 'business_name');
  const contact_name = require<string>(inputs, 'contact_name');
  const phone = require<string>(inputs, 'phone');
  const start_date = require<string>(inputs, 'start_date');

  const monthly_value = (inputs.monthly_value as number | undefined) ?? 0;
  if (monthly_value < 0) throw new Error('monthly_value must be non-negative');

  const status = (inputs.status as string | undefined) ?? 'onboarding';
  if (!VALID_CLIENT_STATUSES.includes(status)) {
    throw new Error(`Invalid status: ${status}. Valid: ${VALID_CLIENT_STATUSES.join(', ')}`);
  }

  const record = {
    business_name,
    contact_name,
    phone,
    email: (inputs.email as string | undefined) ?? null,
    monthly_value,
    start_date,
    status,
    packages: (inputs.packages as unknown[] | undefined) ?? [],
    notes: (inputs.notes as string | undefined) ?? null,
    converted_from_lead_id: (inputs.lead_id as string | undefined) ?? null,
  };

  const supabase = getSupabase();
  const { data, error } = await supabase.from('clients').insert(record).select().single();
  if (error) throw new Error(`create_client failed: ${error.message}`);

  await audit({
    event_type: 'tool.create_client',
    entity_type: 'client',
    entity_id: data.id,
    description: `Client created: ${business_name}`,
  });

  return {
    output: { id: data.id, business_name: data.business_name, monthly_value: data.monthly_value },
    evidence: `Client ${data.id} (${business_name}) created at ${new Date().toISOString()}`,
  };
}

// ── create_task ───────────────────────────────────────────────

export async function executeCreateTask(inputs: Record<string, unknown>): Promise<HandlerResult> {
  const title = require<string>(inputs, 'title');
  const priority = (inputs.priority as string | undefined) ?? 'medium';

  if (!VALID_TASK_PRIORITIES.includes(priority)) {
    throw new Error(`Invalid priority: ${priority}. Valid: ${VALID_TASK_PRIORITIES.join(', ')}`);
  }

  const record = {
    title,
    description: (inputs.description as string | undefined) ?? null,
    project_id: (inputs.project_id as string | undefined) ?? null,
    parent_task_id: (inputs.parent_task_id as string | undefined) ?? null,
    status: 'todo',
    priority,
    assigned_to: (inputs.assigned_to as string | undefined) ?? null,
    due_date: (inputs.due_date as string | undefined) ?? null,
    acceptance_criteria: (inputs.acceptance_criteria as string | undefined) ?? null,
    tags: (inputs.tags as string[] | undefined) ?? [],
  };

  const supabase = getSupabase();
  const { data, error } = await supabase.from('tasks').insert(record).select().single();
  if (error) throw new Error(`create_task failed: ${error.message}`);

  return {
    output: { id: data.id, title: data.title, priority: data.priority, status: data.status },
    evidence: `Task ${data.id} ('${title}') created at ${new Date().toISOString()}`,
  };
}

// ── update_task ───────────────────────────────────────────────

export async function executeUpdateTask(inputs: Record<string, unknown>): Promise<HandlerResult> {
  const task_id = require<string>(inputs, 'task_id');

  const allowed: Record<string, unknown> = {};
  for (const key of ['title','description','status','priority','assigned_to','due_date','acceptance_criteria','evidence','tags']) {
    if (inputs[key] !== undefined) allowed[key] = inputs[key];
  }

  if (allowed.status && !VALID_TASK_STATUSES.includes(allowed.status as string)) {
    throw new Error(`Invalid status: ${allowed.status}`);
  }
  if (allowed.priority && !VALID_TASK_PRIORITIES.includes(allowed.priority as string)) {
    throw new Error(`Invalid priority: ${allowed.priority}`);
  }

  // Auto-set completed_date when marking complete
  if (allowed.status === 'completed') {
    allowed.completed_date = new Date().toISOString().split('T')[0];
  }
  if (Object.keys(allowed).length === 0) throw new Error('No fields to update');

  const supabase = getSupabase();
  const { data, error } = await supabase.from('tasks').update(allowed).eq('id', task_id).select().single();
  if (error) throw new Error(`update_task failed: ${error.message}`);
  if (!data) throw new Error(`Task not found: ${task_id}`);

  return {
    output: { id: data.id, status: data.status, updated_fields: Object.keys(allowed) },
    evidence: `Task ${task_id} updated [${Object.keys(allowed).join(', ')}] at ${new Date().toISOString()}`,
  };
}

// ── create_project ────────────────────────────────────────────

export async function executeCreateProject(inputs: Record<string, unknown>): Promise<HandlerResult> {
  const client_id = require<string>(inputs, 'client_id');
  const name = require<string>(inputs, 'name');

  const record = {
    client_id,
    name,
    description: (inputs.description as string | undefined) ?? null,
    status: 'planning',
    start_date: (inputs.start_date as string | undefined) ?? null,
    due_date: (inputs.due_date as string | undefined) ?? null,
    milestones: (inputs.milestones as unknown[] | undefined) ?? [],
    deliverables: (inputs.deliverables as unknown[] | undefined) ?? [],
    tags: (inputs.tags as string[] | undefined) ?? [],
  };

  const supabase = getSupabase();
  const { data, error } = await supabase.from('projects').insert(record).select().single();
  if (error) throw new Error(`create_project failed: ${error.message}`);

  await audit({
    event_type: 'tool.create_project',
    entity_type: 'project',
    entity_id: data.id,
    description: `Project created: ${name} for client ${client_id}`,
  });

  return {
    output: { id: data.id, name: data.name, status: data.status, client_id },
    evidence: `Project ${data.id} ('${name}') created at ${new Date().toISOString()}`,
  };
}

// ── update_project ────────────────────────────────────────────

export async function executeUpdateProject(inputs: Record<string, unknown>): Promise<HandlerResult> {
  const project_id = require<string>(inputs, 'project_id');

  const allowed: Record<string, unknown> = {};
  for (const key of ['name','description','status','start_date','due_date','milestones','deliverables','blockers','tags']) {
    if (inputs[key] !== undefined) allowed[key] = inputs[key];
  }

  if (allowed.status && !VALID_PROJECT_STATUSES.includes(allowed.status as string)) {
    throw new Error(`Invalid status: ${allowed.status}`);
  }
  if (allowed.status === 'completed') {
    allowed.completed_date = new Date().toISOString().split('T')[0];
  }
  if (Object.keys(allowed).length === 0) throw new Error('No fields to update');

  const supabase = getSupabase();
  const { data, error } = await supabase.from('projects').update(allowed).eq('id', project_id).select().single();
  if (error) throw new Error(`update_project failed: ${error.message}`);
  if (!data) throw new Error(`Project not found: ${project_id}`);

  return {
    output: { id: data.id, status: data.status, updated_fields: Object.keys(allowed) },
    evidence: `Project ${project_id} updated [${Object.keys(allowed).join(', ')}] at ${new Date().toISOString()}`,
  };
}
