/**
 * Reporting & Export Tool Handlers
 * ─────────────────────────────────────────────────────────────
 * generate_business_report, export_business_data
 * ingest_knowledge_file (re-queue wrapper)
 *
 * Reports are built from live DB state only. No fake/cached metrics.
 */

import { getSupabase } from '../../lib/supabase.js';
import { audit } from '../../lib/audit.js';

type HandlerResult = { output: unknown; evidence: string };

// ── generate_business_report ──────────────────────────────────

export async function executeGenerateBusinessReport(inputs: Record<string, unknown>): Promise<HandlerResult> {
  const reportType = (inputs.report_type as string | undefined) ?? 'overview';
  const asOf = new Date().toISOString();
  const supabase = getSupabase();

  const [leadsResult, clientsResult, pipelineResult, tasksResult, approvalsResult] = await Promise.all([
    supabase.from('leads').select('stage').neq('stage', 'won').neq('stage', 'lost').neq('stage', 'unqualified'),
    supabase.from('clients').select('business_name, status, monthly_value').eq('status', 'active'),
    supabase.from('leads').select('stage, name').eq('stage', 'proposal_sent'),
    supabase.from('tasks').select('status, priority').neq('status', 'completed').neq('status', 'cancelled'),
    supabase.from('approval_queue').select('action').eq('status', 'pending'),
  ]);

  // Pipeline stage counts
  const stageCounts: Record<string, number> = {};
  for (const lead of leadsResult.data ?? []) {
    stageCounts[lead.stage] = (stageCounts[lead.stage] ?? 0) + 1;
  }

  // MRR
  const activeClients = clientsResult.data ?? [];
  const mrr = activeClients.reduce((sum, c) => sum + parseFloat(String(c.monthly_value ?? 0)), 0);

  // Open tasks by priority
  const tasksByPriority: Record<string, number> = {};
  for (const task of tasksResult.data ?? []) {
    tasksByPriority[task.priority] = (tasksByPriority[task.priority] ?? 0) + 1;
  }

  const report = {
    report_type: reportType,
    generated_at: asOf,
    summary: {
      active_clients: activeClients.length,
      mrr_inr: mrr,
      active_pipeline_leads: Object.values(stageCounts).reduce((s, n) => s + n, 0),
      pipeline_by_stage: stageCounts,
      proposals_sent: (pipelineResult.data ?? []).length,
      open_tasks: (tasksResult.data ?? []).length,
      tasks_by_priority: tasksByPriority,
      pending_approvals: (approvalsResult.data ?? []).length,
    },
    disclaimer: 'Figures are for internal reference only. Financial figures are pre-CA review estimates.',
  };

  await audit({
    event_type: 'tool.generate_business_report',
    description: `Business report generated: type=${reportType}`,
    metadata: { report_type: reportType },
  });

  return {
    output: report,
    evidence: `Business report (type=${reportType}) generated from live DB at ${asOf}. Active clients: ${activeClients.length}, MRR: ₹${mrr.toLocaleString('en-IN')}.`,
  };
}

// ── export_business_data ──────────────────────────────────────

export async function executeExportBusinessData(inputs: Record<string, unknown>): Promise<HandlerResult> {
  const entity = (inputs.entity as string | undefined) ?? 'leads';
  const ALLOWED_EXPORTS = ['leads', 'clients', 'tasks', 'proposals', 'invoices'];

  if (!ALLOWED_EXPORTS.includes(entity)) {
    throw new Error(`Entity not exportable: ${entity}. Allowed: ${ALLOWED_EXPORTS.join(', ')}`);
  }

  const limit = Math.min((inputs.limit as number | undefined) ?? 200, 500);
  const supabase = getSupabase();

  const { data, error, count } = await supabase
    .from(entity)
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`export_business_data failed: ${error.message}`);

  await audit({
    event_type: 'tool.export_business_data',
    description: `Data export: ${entity} (${count ?? 0} rows)`,
    metadata: { entity, rows: data?.length ?? 0 },
  });

  return {
    output: {
      entity,
      rows: data?.length ?? 0,
      total_available: count,
      data,
      exported_at: new Date().toISOString(),
      note: limit < (count ?? 0) ? `Showing first ${limit} of ${count} rows. Use limit parameter to adjust.` : undefined,
    },
    evidence: `${data?.length ?? 0} rows from '${entity}' exported at ${new Date().toISOString()}. Total available: ${count}.`,
  };
}

// ── ingest_knowledge_file ─────────────────────────────────────
// This tool queues an already-uploaded document for RAG ingestion.
// The actual ingestion runs in the background worker via ingest_document job.

export async function executeIngestKnowledgeFile(inputs: Record<string, unknown>): Promise<HandlerResult> {
  const document_id = inputs.document_id as string;
  if (!document_id?.trim()) throw new Error('document_id is required (UUID of an existing document record)');

  const supabase = getSupabase();

  // Verify document exists
  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .select('id, title, status')
    .eq('id', document_id)
    .single();

  if (docErr || !doc) throw new Error(`Document not found: ${document_id}`);
  if (doc.status === 'indexed') {
    return {
      output: { document_id, title: doc.title, status: 'already_indexed' },
      evidence: `Document ${document_id} is already indexed. No action taken.`,
    };
  }

  // Queue ingestion job
  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .insert({
      job_type: 'ingest_document',
      payload: { document_id },
      status: 'queued',
      max_attempts: 3,
    })
    .select()
    .single();

  if (jobErr) throw new Error(`Failed to queue ingestion job: ${jobErr.message}`);

  // Update document status to 'ingesting'
  await supabase.from('documents').update({ status: 'ingesting' }).eq('id', document_id);

  await audit({
    event_type: 'tool.ingest_knowledge_file',
    entity_type: 'document',
    entity_id: document_id,
    description: `Knowledge ingestion queued for: ${doc.title}`,
    metadata: { job_id: job.id },
  });

  return {
    output: {
      document_id,
      title: doc.title,
      job_id: job.id,
      status: 'queued',
      note: 'Ingestion queued. Worker will chunk and embed the document. Check document status to confirm indexing.',
    },
    evidence: `Ingestion job ${job.id} queued for document '${doc.title}' (${document_id}) at ${new Date().toISOString()}`,
  };
}

// ── sheets_import (stub with clear limitation message) ────────

export async function executeSheetsImport(inputs: Record<string, unknown>): Promise<HandlerResult> {
  // Google Sheets direct API not yet integrated — this tool accepts CSV data or file reference
  const csv_data = inputs.csv_data as string | undefined;
  const target_table = inputs.target_table as string | undefined;

  if (!csv_data && !inputs.document_id) {
    throw new Error(
      'sheets_import requires either csv_data (CSV string) or document_id of an uploaded CSV/XLSX file. ' +
      'Google Sheets direct sync is not yet configured.'
    );
  }

  if (!target_table) throw new Error('target_table is required');

  const IMPORTABLE_TABLES = ['leads', 'clients'];
  if (!IMPORTABLE_TABLES.includes(target_table)) {
    throw new Error(`Import not supported for table: ${target_table}. Supported: ${IMPORTABLE_TABLES.join(', ')}`);
  }

  // Queue as an ingestion job for the worker to process
  const supabase = getSupabase();
  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .insert({
      job_type: 'import_csv',
      payload: { csv_data: csv_data?.slice(0, 50000), target_table, document_id: inputs.document_id },
      status: 'queued',
      max_attempts: 2,
    })
    .select()
    .single();

  if (jobErr) throw new Error(`Failed to queue import job: ${jobErr.message}`);

  return {
    output: {
      job_id: job?.id,
      target_table,
      status: 'queued',
      note: 'Import queued for background processing. Check job status for results.',
    },
    evidence: `CSV import job queued for table '${target_table}' at ${new Date().toISOString()}`,
  };
}
