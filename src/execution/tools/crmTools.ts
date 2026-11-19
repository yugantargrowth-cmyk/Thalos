/**
 * CRM Tool Handlers
 * ─────────────────────────────────────────────────────────────
 * create_lead, update_lead, log_lead_activity, schedule_follow_up,
 * create_client, create_task, update_task, create_project, update_project
 *
 * All writes are audited. No fake data returned on failure.
 * Delegates domain operations directly to crmService (L12-AC-07).
 */

import { crmService } from '../../business/crmService.js';

type HandlerResult = { output: unknown; evidence: string };

function requireInput<T>(inputs: Record<string, unknown>, key: string): T {
  const v = inputs[key];
  if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
    throw new Error(`Missing required input: ${key}`);
  }
  return v as T;
}

// ── create_lead ───────────────────────────────────────────────

export async function executeCreateLead(inputs: Record<string, unknown>): Promise<HandlerResult> {
  const name = requireInput<string>(inputs, 'name');
  const phone = requireInput<string>(inputs, 'phone');

  const lead = await crmService.createLead({
    name,
    phone,
    contact_name: (inputs.contact_name as string | undefined) ?? null,
    email: (inputs.email as string | undefined) ?? null,
    source: (inputs.source as string | undefined) ?? 'manual',
    stage: (inputs.stage as string | undefined) ?? 'new',
    industry: (inputs.industry as string | undefined) ?? null,
    location: (inputs.location as string | undefined) ?? null,
    website: (inputs.website as string | undefined) ?? null,
    notes: (inputs.notes as string | undefined) ?? null,
    assigned_agent: (inputs.assigned_agent as string | undefined) ?? null,
  });

  return {
    output: { id: lead.id, name: lead.name, phone: lead.phone, stage: lead.stage },
    evidence: `Lead ${lead.id} (${name}) created in stage '${lead.stage}' at ${new Date().toISOString()}`,
  };
}

// ── update_lead ───────────────────────────────────────────────

export async function executeUpdateLead(inputs: Record<string, unknown>): Promise<HandlerResult> {
  const lead_id = requireInput<string>(inputs, 'lead_id');

  const { lead, updated_fields } = await crmService.updateLead(lead_id, inputs);

  return {
    output: { id: lead.id, updated_fields, stage: lead.stage },
    evidence: `Lead ${lead_id} updated fields [${updated_fields.join(', ')}] at ${new Date().toISOString()}`,
  };
}

// ── log_lead_activity ─────────────────────────────────────────

export async function executeLogLeadActivity(inputs: Record<string, unknown>): Promise<HandlerResult> {
  const lead_id = requireInput<string>(inputs, 'lead_id');
  const activity = requireInput<string>(inputs, 'activity');
  const description = requireInput<string>(inputs, 'description');
  const agent = (inputs.agent as string | undefined) ?? null;
  const metadata = (inputs.metadata as Record<string, unknown> | undefined) ?? {};

  const res = await crmService.logLeadActivity(lead_id, activity, description, agent, metadata);

  return {
    output: res,
    evidence: `Activity '${activity}' logged on lead ${lead_id} at ${new Date().toISOString()}`,
  };
}

// ── schedule_follow_up ────────────────────────────────────────

export async function executeScheduleFollowUp(inputs: Record<string, unknown>): Promise<HandlerResult> {
  const entity_type = requireInput<string>(inputs, 'entity_type');
  const entity_id = requireInput<string>(inputs, 'entity_id');
  const due_date = requireInput<string>(inputs, 'due_date');
  const reminder_note = requireInput<string>(inputs, 'reminder_note');
  const due_time = (inputs.due_time as string | undefined) ?? null;
  const assigned_agent = (inputs.assigned_agent as string | undefined) ?? null;

  const res = await crmService.scheduleFollowUp({
    entity_type,
    entity_id,
    due_date,
    due_time,
    reminder_note,
    assigned_agent,
  });

  return {
    output: res,
    evidence: `Follow-up scheduled for ${entity_type} ${entity_id} on ${due_date} at ${new Date().toISOString()}`,
  };
}

// ── create_client ─────────────────────────────────────────────

export async function executeCreateClient(inputs: Record<string, unknown>): Promise<HandlerResult> {
  const business_name = requireInput<string>(inputs, 'business_name');
  const contact_name = requireInput<string>(inputs, 'contact_name');
  const phone = requireInput<string>(inputs, 'phone');
  const start_date = requireInput<string>(inputs, 'start_date');

  const client = await crmService.createClient({
    business_name,
    contact_name,
    phone,
    email: (inputs.email as string | undefined) ?? null,
    monthly_value: inputs.monthly_value as number | undefined,
    start_date,
    status: inputs.status as string | undefined,
    packages: (inputs.packages as unknown[] | undefined) ?? [],
    notes: (inputs.notes as string | undefined) ?? null,
    converted_from_lead_id: (inputs.lead_id as string | undefined) ?? null,
  });

  return {
    output: { id: client.id, business_name: client.business_name, monthly_value: client.monthly_value },
    evidence: `Client ${client.id} (${business_name}) created at ${new Date().toISOString()}`,
  };
}

// ── create_task ───────────────────────────────────────────────

export async function executeCreateTask(inputs: Record<string, unknown>): Promise<HandlerResult> {
  const title = requireInput<string>(inputs, 'title');

  const task = await crmService.createTask({
    title,
    description: (inputs.description as string | undefined) ?? null,
    project_id: (inputs.project_id as string | undefined) ?? null,
    parent_task_id: (inputs.parent_task_id as string | undefined) ?? null,
    priority: inputs.priority as string | undefined,
    assigned_to: (inputs.assigned_to as string | undefined) ?? null,
    due_date: (inputs.due_date as string | undefined) ?? null,
    acceptance_criteria: (inputs.acceptance_criteria as string | undefined) ?? null,
    tags: (inputs.tags as string[] | undefined) ?? [],
  });

  return {
    output: { id: task.id, title: task.title, priority: task.priority, status: task.status },
    evidence: `Task ${task.id} ('${title}') created at ${new Date().toISOString()}`,
  };
}

// ── update_task ───────────────────────────────────────────────

export async function executeUpdateTask(inputs: Record<string, unknown>): Promise<HandlerResult> {
  const task_id = requireInput<string>(inputs, 'task_id');

  const { task, updated_fields } = await crmService.updateTask(task_id, inputs);

  return {
    output: { id: task.id, status: task.status, updated_fields },
    evidence: `Task ${task_id} updated [${updated_fields.join(', ')}] at ${new Date().toISOString()}`,
  };
}

// ── create_project ────────────────────────────────────────────

export async function executeCreateProject(inputs: Record<string, unknown>): Promise<HandlerResult> {
  const client_id = requireInput<string>(inputs, 'client_id');
  const name = requireInput<string>(inputs, 'name');

  const project = await crmService.createProject({
    client_id,
    name,
    description: (inputs.description as string | undefined) ?? null,
    start_date: (inputs.start_date as string | undefined) ?? null,
    due_date: (inputs.due_date as string | undefined) ?? null,
    milestones: (inputs.milestones as unknown[] | undefined) ?? [],
    deliverables: (inputs.deliverables as unknown[] | undefined) ?? [],
    tags: (inputs.tags as string[] | undefined) ?? [],
  });

  return {
    output: { id: project.id, name: project.name, status: project.status, client_id },
    evidence: `Project ${project.id} ('${name}') created at ${new Date().toISOString()}`,
  };
}

// ── update_project ────────────────────────────────────────────

export async function executeUpdateProject(inputs: Record<string, unknown>): Promise<HandlerResult> {
  const project_id = requireInput<string>(inputs, 'project_id');

  const { project, updated_fields } = await crmService.updateProject(project_id, inputs);

  return {
    output: { id: project.id, status: project.status, updated_fields },
    evidence: `Project ${project_id} updated [${updated_fields.join(', ')}] at ${new Date().toISOString()}`,
  };
}
