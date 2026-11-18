/**
 * Tool Registry — builds Groq-compatible function specs from the DB tool table.
 * Each tool becomes a JSON Schema function definition the LLM can call.
 * Input schemas are defined here and kept in sync with tool handler expectations.
 */

import { getSupabase } from '../lib/supabase.js';

export interface ToolSpec {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** Parameter schemas per tool_id */
const TOOL_PARAMS: Record<string, Record<string, unknown>> = {
  web_search: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query (1–8 words, specific)' },
    },
    required: ['query'],
  },
  website_audit: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Full URL to fetch and inspect (https://)' },
    },
    required: ['url'],
  },
  social_lookup: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Public social media profile URL' },
    },
    required: ['url'],
  },
  search_knowledge: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'What to search for in the knowledge base' },
      top_k: { type: 'number', description: 'Number of results (default 5)' },
      category: { type: 'string', description: 'Optional document category filter' },
    },
    required: ['query'],
  },
  create_lead: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Business name' },
      phone: { type: 'string', description: 'Phone number (+91XXXXXXXXXX)' },
      contact_name: { type: 'string' },
      email: { type: 'string' },
      source: { type: 'string', enum: ['google_maps','referral','inbound','manual','import','scout'] },
      stage: { type: 'string', enum: ['new','researching','outreach_drafted','contacted','follow_up','qualified','proposal_sent','negotiating','won','lost','unqualified'] },
      industry: { type: 'string' },
      location: { type: 'string', description: 'Area in Ahmedabad/Gujarat' },
      website: { type: 'string' },
      notes: { type: 'string' },
    },
    required: ['name', 'phone'],
  },
  update_lead: {
    type: 'object',
    properties: {
      lead_id: { type: 'string', description: 'Lead UUID' },
      stage: { type: 'string', enum: ['new','researching','outreach_drafted','contacted','follow_up','qualified','proposal_sent','negotiating','won','lost','unqualified'] },
      notes: { type: 'string' },
      next_action: { type: 'string' },
      follow_up_date: { type: 'string', description: 'YYYY-MM-DD' },
      score: { type: 'number', description: '0–100 qualification score' },
    },
    required: ['lead_id'],
  },
  log_lead_activity: {
    type: 'object',
    properties: {
      lead_id: { type: 'string', description: 'Lead UUID' },
      activity: { type: 'string', enum: ['contacted','drafted','researched','followed_up','note','stage_change'] },
      description: { type: 'string' },
      agent: { type: 'string' },
    },
    required: ['lead_id', 'activity', 'description'],
  },
  schedule_follow_up: {
    type: 'object',
    properties: {
      entity_type: { type: 'string', enum: ['lead','client','task','project'] },
      entity_id: { type: 'string', description: 'UUID of the entity' },
      due_date: { type: 'string', description: 'YYYY-MM-DD' },
      reminder_note: { type: 'string' },
      assigned_agent: { type: 'string' },
    },
    required: ['entity_type', 'entity_id', 'due_date', 'reminder_note'],
  },
  draft_whatsapp: {
    type: 'object',
    properties: {
      lead_id: { type: 'string' },
      phone: { type: 'string' },
      content: { type: 'string', description: 'The WhatsApp message text' },
    },
    required: ['content', 'phone'],
  },
  draft_email: {
    type: 'object',
    properties: {
      lead_id: { type: 'string' },
      to: { type: 'string' },
      subject: { type: 'string' },
      body: { type: 'string' },
    },
    required: ['to', 'subject', 'body'],
  },
  send_email: {
    type: 'object',
    properties: {
      to: { type: 'string' },
      subject: { type: 'string' },
      html: { type: 'string' },
      from: { type: 'string' },
    },
    required: ['to', 'subject', 'html'],
  },
  send_whatsapp: {
    type: 'object',
    properties: {
      phone: { type: 'string' },
      content: { type: 'string' },
      lead_id: { type: 'string' },
    },
    required: ['phone', 'content'],
  },
  create_task: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
      project_id: { type: 'string' },
      priority: { type: 'string', enum: ['low','medium','high','critical'] },
      assigned_to: { type: 'string' },
      due_date: { type: 'string', description: 'YYYY-MM-DD' },
    },
    required: ['title'],
  },
  update_task: {
    type: 'object',
    properties: {
      task_id: { type: 'string', description: 'Task UUID' },
      status: { type: 'string', enum: ['todo','in_progress','blocked','review','completed','cancelled'] },
      priority: { type: 'string', enum: ['low','medium','high','critical'] },
      evidence: { type: 'string' },
    },
    required: ['task_id'],
  },
  create_project: {
    type: 'object',
    properties: {
      client_id: { type: 'string', description: 'Client UUID' },
      name: { type: 'string' },
      description: { type: 'string' },
      due_date: { type: 'string', description: 'YYYY-MM-DD' },
    },
    required: ['client_id', 'name'],
  },
  update_project: {
    type: 'object',
    properties: {
      project_id: { type: 'string' },
      status: { type: 'string', enum: ['planning','active','on_hold','completed','cancelled'] },
      name: { type: 'string' },
    },
    required: ['project_id'],
  },
  create_client: {
    type: 'object',
    properties: {
      business_name: { type: 'string' },
      contact_name: { type: 'string' },
      phone: { type: 'string' },
      start_date: { type: 'string', description: 'YYYY-MM-DD' },
      monthly_value: { type: 'number' },
      lead_id: { type: 'string', description: 'UUID of the lead being converted' },
    },
    required: ['business_name', 'contact_name', 'phone', 'start_date'],
  },
  build_proposal: {
    type: 'object',
    properties: {
      client_name: { type: 'string' },
      client_id: { type: 'string' },
      lead_id: { type: 'string' },
      line_items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            description: { type: 'string' },
            quantity: { type: 'number' },
            unit_price: { type: 'number' },
          },
          required: ['description', 'quantity', 'unit_price'],
        },
      },
      tax_percent: { type: 'number', description: 'GST % (default 18)' },
      valid_until: { type: 'string', description: 'YYYY-MM-DD' },
      notes: { type: 'string' },
    },
    required: ['client_name', 'line_items'],
  },
  build_invoice: {
    type: 'object',
    properties: {
      client_name: { type: 'string' },
      client_id: { type: 'string' },
      line_items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            description: { type: 'string' },
            quantity: { type: 'number' },
            unit_price: { type: 'number' },
          },
          required: ['description', 'quantity', 'unit_price'],
        },
      },
      due_date: { type: 'string', description: 'YYYY-MM-DD' },
      tax_percent: { type: 'number' },
    },
    required: ['client_name', 'line_items', 'due_date'],
  },
  generate_business_report: {
    type: 'object',
    properties: {
      report_type: { type: 'string', enum: ['overview','pipeline','finance','tasks'], description: 'Type of report' },
    },
    required: [],
  },
  export_business_data: {
    type: 'object',
    properties: {
      entity: { type: 'string', enum: ['leads','clients','tasks','proposals','invoices'] },
      limit: { type: 'number', description: 'Max rows (default 200, max 500)' },
    },
    required: ['entity'],
  },
  save_to_db: {
    type: 'object',
    properties: {
      table: {
        type: 'string',
        enum: ['leads', 'lead_activities', 'follow_ups', 'clients', 'projects', 'tasks', 'documents', 'knowledge_nodes'],
        description: 'Target database table name',
      },
      record: {
        type: 'object',
        description: 'Record fields to persist in Supabase',
      },
    },
    required: ['table', 'record'],
  },
  sheets_import: {
    type: 'object',
    properties: {
      target_table: {
        type: 'string',
        enum: ['leads', 'clients'],
        description: 'Target table to import rows into',
      },
      csv_data: {
        type: 'string',
        description: 'Raw CSV text content',
      },
      document_id: {
        type: 'string',
        description: 'UUID of an uploaded document containing the spreadsheet',
      },
    },
    required: ['target_table'],
  },
  ingest_knowledge_file: {
    type: 'object',
    properties: {
      document_id: {
        type: 'string',
        description: 'UUID of an existing uploaded document record to index',
      },
    },
    required: ['document_id'],
  },
  n8n_trigger: {
    type: 'object',
    properties: {
      workflow_name: { type: 'string', description: 'Name of the n8n workflow' },
      payload: { type: 'object', description: 'Payload data to send to the webhook' },
    },
    required: ['workflow_name'],
  },
};

export { TOOL_PARAMS };

export interface ToolContract {
  tool_id: string;
  display_name: string;
  description: string;
  version: string;
  category: 'research' | 'communication' | 'documents' | 'data' | 'automation';
  permission_level: number;
  timeout_seconds: number;
  requires_approval: boolean;
  idempotent: boolean;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  evidence_contract: {
    success: string;
    failure: string;
  };
}

export const TOOL_OUTPUT_SCHEMAS: Record<string, Record<string, unknown>> = {
  web_search: {
    type: 'object',
    properties: {
      results: { type: 'array' },
      query: { type: 'string' },
      source: { type: 'string' },
    },
    required: ['results', 'query'],
  },
  website_audit: {
    type: 'object',
    properties: {
      url: { type: 'string' },
      status: { type: 'number' },
      headers: { type: 'object' },
    },
    required: ['url', 'status'],
  },
  social_lookup: {
    type: 'object',
    properties: {
      url: { type: 'string' },
      platform: { type: 'string' },
    },
    required: ['url', 'platform'],
  },
  search_knowledge: {
    type: 'object',
    properties: {
      results: { type: 'array' },
      query: { type: 'string' },
    },
    required: ['results'],
  },
  ingest_knowledge_file: {
    type: 'object',
    properties: {
      document_id: { type: 'string' },
      status: { type: 'string' },
    },
    required: ['document_id', 'status'],
  },
  draft_whatsapp: {
    type: 'object',
    properties: {
      draft_type: { type: 'string' },
      content: { type: 'string' },
      status: { type: 'string' },
      phone: { type: 'string' },
      wa_link: { type: 'string' },
    },
    required: ['draft_type', 'content', 'status'],
  },
  draft_email: {
    type: 'object',
    properties: {
      draft_type: { type: 'string' },
      to: { type: 'string' },
      subject: { type: 'string' },
      body: { type: 'string' },
      status: { type: 'string' },
    },
    required: ['draft_type', 'to', 'subject', 'body', 'status'],
  },
  send_whatsapp: {
    type: 'object',
    properties: {
      phone_e164: { type: 'string' },
      wa_link: { type: 'string' },
      content: { type: 'string' },
      status: { type: 'string' },
      dispatch_method: { type: 'string' },
    },
    required: ['phone_e164', 'wa_link', 'status'],
  },
  send_email: {
    type: 'object',
    properties: {
      message_id: { type: 'string' },
      to: { type: 'string' },
      subject: { type: 'string' },
    },
    required: ['message_id', 'to'],
  },
  create_lead: {
    type: 'object',
    properties: {
      lead: { type: 'object' },
    },
    required: ['lead'],
  },
  update_lead: {
    type: 'object',
    properties: {
      lead: { type: 'object' },
    },
    required: ['lead'],
  },
  log_lead_activity: {
    type: 'object',
    properties: {
      activity: { type: 'object' },
    },
    required: ['activity'],
  },
  schedule_follow_up: {
    type: 'object',
    properties: {
      follow_up: { type: 'object' },
    },
    required: ['follow_up'],
  },
  create_task: {
    type: 'object',
    properties: {
      task: { type: 'object' },
    },
    required: ['task'],
  },
  update_task: {
    type: 'object',
    properties: {
      task: { type: 'object' },
    },
    required: ['task'],
  },
  create_project: {
    type: 'object',
    properties: {
      project: { type: 'object' },
    },
    required: ['project'],
  },
  update_project: {
    type: 'object',
    properties: {
      project: { type: 'object' },
    },
    required: ['project'],
  },
  create_client: {
    type: 'object',
    properties: {
      client: { type: 'object' },
    },
    required: ['client'],
  },
  build_proposal: {
    type: 'object',
    properties: {
      proposal: { type: 'object' },
      totals: { type: 'object' },
    },
    required: ['totals'],
  },
  build_invoice: {
    type: 'object',
    properties: {
      invoice: { type: 'object' },
      totals: { type: 'object' },
    },
    required: ['totals'],
  },
  generate_business_report: {
    type: 'object',
    properties: {
      report_type: { type: 'string' },
      metrics: { type: 'object' },
    },
    required: ['report_type'],
  },
  export_business_data: {
    type: 'object',
    properties: {
      entity: { type: 'string' },
      row_count: { type: 'number' },
    },
    required: ['entity', 'row_count'],
  },
  sheets_import: {
    type: 'object',
    properties: {
      imported: { type: 'number' },
      target_table: { type: 'string' },
    },
    required: ['imported', 'target_table'],
  },
  save_to_db: {
    type: 'object',
    properties: {
      table: { type: 'string' },
      data: { type: 'object' },
    },
    required: ['table'],
  },
  n8n_trigger: {
    type: 'object',
    properties: {
      status: { type: 'string' },
      webhook_id: { type: 'string' },
    },
    required: ['status'],
  },
};

export const TOOL_CONTRACTS: Record<string, ToolContract> = {
  web_search: {
    tool_id: 'web_search',
    display_name: 'Web Search',
    description: 'Search the web for business intelligence using SearXNG or Tavily fallback',
    version: '1.0.0',
    category: 'research',
    permission_level: 0,
    timeout_seconds: 30,
    requires_approval: false,
    idempotent: false,
    input_schema: TOOL_PARAMS.web_search,
    output_schema: TOOL_OUTPUT_SCHEMAS.web_search,
    evidence_contract: {
      success: 'Search results returned with source URLs and timestamps',
      failure: 'No results returned or provider error',
    },
  },
  website_audit: {
    tool_id: 'website_audit',
    display_name: 'Website Audit',
    description: 'Fetch and analyse a URL for business information. HTTP check only — does not run Lighthouse.',
    version: '1.0.0',
    category: 'research',
    permission_level: 0,
    timeout_seconds: 45,
    requires_approval: false,
    idempotent: false,
    input_schema: TOOL_PARAMS.website_audit,
    output_schema: TOOL_OUTPUT_SCHEMAS.website_audit,
    evidence_contract: {
      success: 'Website response received with metadata',
      failure: 'Fetch failed or timeout',
    },
  },
  social_lookup: {
    tool_id: 'social_lookup',
    display_name: 'Social Lookup',
    description: 'Check business social media presence from public URLs only. Does not scrape or guarantee data.',
    version: '1.0.0',
    category: 'research',
    permission_level: 0,
    timeout_seconds: 30,
    requires_approval: false,
    idempotent: false,
    input_schema: TOOL_PARAMS.social_lookup,
    output_schema: TOOL_OUTPUT_SCHEMAS.social_lookup,
    evidence_contract: {
      success: 'Public profile data retrieved from provided URL',
      failure: 'URL not accessible or no public data',
    },
  },
  draft_whatsapp: {
    tool_id: 'draft_whatsapp',
    display_name: 'Draft WhatsApp',
    description: 'Compose a personalised WhatsApp message draft using verified lead claims only. Does not send.',
    version: '1.0.0',
    category: 'communication',
    permission_level: 0,
    timeout_seconds: 10,
    requires_approval: false,
    idempotent: true,
    input_schema: TOOL_PARAMS.draft_whatsapp,
    output_schema: TOOL_OUTPUT_SCHEMAS.draft_whatsapp,
    evidence_contract: {
      success: 'Draft created and saved to approval queue',
      failure: 'Draft generation failed',
    },
  },
  draft_email: {
    tool_id: 'draft_email',
    display_name: 'Draft Email',
    description: 'Compose a personalised email draft. Does not send.',
    version: '1.0.0',
    category: 'communication',
    permission_level: 0,
    timeout_seconds: 10,
    requires_approval: false,
    idempotent: true,
    input_schema: TOOL_PARAMS.draft_email,
    output_schema: TOOL_OUTPUT_SCHEMAS.draft_email,
    evidence_contract: {
      success: 'Email draft created and saved',
      failure: 'Draft generation failed',
    },
  },
  send_whatsapp: {
    tool_id: 'send_whatsapp',
    display_name: 'Send WhatsApp (Manual Handoff)',
    description: 'Generates a wa.me deep link for manual WhatsApp dispatch. Manual tap required.',
    version: '1.0.0',
    category: 'communication',
    permission_level: 2,
    timeout_seconds: 10,
    requires_approval: true,
    idempotent: false,
    input_schema: TOOL_PARAMS.send_whatsapp,
    output_schema: TOOL_OUTPUT_SCHEMAS.send_whatsapp,
    evidence_contract: {
      success: 'wa.me link generated for manual tap',
      failure: 'Link generation failed',
    },
  },
  send_email: {
    tool_id: 'send_email',
    display_name: 'Send Email',
    description: 'Send email via configured provider (Resend). Requires Resend API key and verified domain.',
    version: '1.0.0',
    category: 'communication',
    permission_level: 2,
    timeout_seconds: 30,
    requires_approval: true,
    idempotent: false,
    input_schema: TOOL_PARAMS.send_email,
    output_schema: TOOL_OUTPUT_SCHEMAS.send_email,
    evidence_contract: {
      success: 'Provider message ID received and logged',
      failure: 'Provider error or missing credentials',
    },
  },
  create_lead: {
    tool_id: 'create_lead',
    display_name: 'Create Lead',
    description: 'Create a new lead record with deduplication by phone number.',
    version: '1.0.0',
    category: 'data',
    permission_level: 0,
    timeout_seconds: 10,
    requires_approval: false,
    idempotent: true,
    input_schema: TOOL_PARAMS.create_lead,
    output_schema: TOOL_OUTPUT_SCHEMAS.create_lead,
    evidence_contract: {
      success: 'Lead record created with UUID',
      failure: 'Validation error or duplicate phone',
    },
  },
  update_lead: {
    tool_id: 'update_lead',
    display_name: 'Update Lead',
    description: 'Update an existing lead record. Logs change to audit trail.',
    version: '1.0.0',
    category: 'data',
    permission_level: 0,
    timeout_seconds: 10,
    requires_approval: false,
    idempotent: false,
    input_schema: TOOL_PARAMS.update_lead,
    output_schema: TOOL_OUTPUT_SCHEMAS.update_lead,
    evidence_contract: {
      success: 'Lead updated and audit entry created',
      failure: 'Lead not found or validation error',
    },
  },
  log_lead_activity: {
    tool_id: 'log_lead_activity',
    display_name: 'Log Lead Activity',
    description: "Append an activity entry to a lead's activity log.",
    version: '1.0.0',
    category: 'data',
    permission_level: 0,
    timeout_seconds: 10,
    requires_approval: false,
    idempotent: true,
    input_schema: TOOL_PARAMS.log_lead_activity,
    output_schema: TOOL_OUTPUT_SCHEMAS.log_lead_activity,
    evidence_contract: {
      success: 'Activity entry appended with timestamp and agent',
      failure: 'Lead not found or write error',
    },
  },
  schedule_follow_up: {
    tool_id: 'schedule_follow_up',
    display_name: 'Schedule Follow-Up',
    description: 'Create a follow-up reminder record for a lead or task.',
    version: '1.0.0',
    category: 'data',
    permission_level: 0,
    timeout_seconds: 10,
    requires_approval: false,
    idempotent: true,
    input_schema: TOOL_PARAMS.schedule_follow_up,
    output_schema: TOOL_OUTPUT_SCHEMAS.schedule_follow_up,
    evidence_contract: {
      success: 'Follow-up record created in database',
      failure: 'Validation error or write failure',
    },
  },
  create_task: {
    tool_id: 'create_task',
    display_name: 'Create Task',
    description: 'Create a task record under a project.',
    version: '1.0.0',
    category: 'data',
    permission_level: 0,
    timeout_seconds: 10,
    requires_approval: false,
    idempotent: true,
    input_schema: TOOL_PARAMS.create_task,
    output_schema: TOOL_OUTPUT_SCHEMAS.create_task,
    evidence_contract: {
      success: 'Task record created',
      failure: 'Project not found or validation error',
    },
  },
  update_task: {
    tool_id: 'update_task',
    display_name: 'Update Task',
    description: 'Update task status, assignee or details.',
    version: '1.0.0',
    category: 'data',
    permission_level: 0,
    timeout_seconds: 10,
    requires_approval: false,
    idempotent: false,
    input_schema: TOOL_PARAMS.update_task,
    output_schema: TOOL_OUTPUT_SCHEMAS.update_task,
    evidence_contract: {
      success: 'Task updated and audit entry created',
      failure: 'Task not found or validation error',
    },
  },
  create_project: {
    tool_id: 'create_project',
    display_name: 'Create Project',
    description: 'Create a project under a client record.',
    version: '1.0.0',
    category: 'data',
    permission_level: 0,
    timeout_seconds: 10,
    requires_approval: false,
    idempotent: true,
    input_schema: TOOL_PARAMS.create_project,
    output_schema: TOOL_OUTPUT_SCHEMAS.create_project,
    evidence_contract: {
      success: 'Project record created',
      failure: 'Client not found or validation error',
    },
  },
  update_project: {
    tool_id: 'update_project',
    display_name: 'Update Project',
    description: 'Update project status, milestones or scope.',
    version: '1.0.0',
    category: 'data',
    permission_level: 0,
    timeout_seconds: 10,
    requires_approval: false,
    idempotent: false,
    input_schema: TOOL_PARAMS.update_project,
    output_schema: TOOL_OUTPUT_SCHEMAS.update_project,
    evidence_contract: {
      success: 'Project updated and audit entry created',
      failure: 'Project not found or validation error',
    },
  },
  create_client: {
    tool_id: 'create_client',
    display_name: 'Create Client',
    description: 'Convert a lead to client or create a new client record.',
    version: '1.0.0',
    category: 'data',
    permission_level: 2,
    timeout_seconds: 10,
    requires_approval: true,
    idempotent: true,
    input_schema: TOOL_PARAMS.create_client,
    output_schema: TOOL_OUTPUT_SCHEMAS.create_client,
    evidence_contract: {
      success: 'Client record created',
      failure: 'Validation error or duplicate',
    },
  },
  build_proposal: {
    tool_id: 'build_proposal',
    display_name: 'Build Proposal',
    description: 'Generate a formatted proposal document with configurable tax rates.',
    version: '1.0.0',
    category: 'documents',
    permission_level: 0,
    timeout_seconds: 30,
    requires_approval: false,
    idempotent: true,
    input_schema: TOOL_PARAMS.build_proposal,
    output_schema: TOOL_OUTPUT_SCHEMAS.build_proposal,
    evidence_contract: {
      success: 'Proposal record created with computed totals',
      failure: 'Proposal generation failed',
    },
  },
  build_invoice: {
    tool_id: 'build_invoice',
    display_name: 'Build Invoice',
    description: 'Generate a GST invoice from a proposal. Requires approval.',
    version: '1.0.0',
    category: 'documents',
    permission_level: 2,
    timeout_seconds: 30,
    requires_approval: true,
    idempotent: true,
    input_schema: TOOL_PARAMS.build_invoice,
    output_schema: TOOL_OUTPUT_SCHEMAS.build_invoice,
    evidence_contract: {
      success: 'Invoice record created with balance_due calculated',
      failure: 'Invoice generation failed',
    },
  },
  generate_business_report: {
    tool_id: 'generate_business_report',
    display_name: 'Generate Business Report',
    description: 'Calculate and format a business intelligence report from structured DB records.',
    version: '1.0.0',
    category: 'data',
    permission_level: 0,
    timeout_seconds: 60,
    requires_approval: false,
    idempotent: false,
    input_schema: TOOL_PARAMS.generate_business_report,
    output_schema: TOOL_OUTPUT_SCHEMAS.generate_business_report,
    evidence_contract: {
      success: 'Report generated with sourced data and date range',
      failure: 'Query error or insufficient data',
    },
  },
  export_business_data: {
    tool_id: 'export_business_data',
    display_name: 'Export Business Data',
    description: 'Export structured business data as CSV or JSON for specified entity type.',
    version: '1.0.0',
    category: 'data',
    permission_level: 2,
    timeout_seconds: 60,
    requires_approval: true,
    idempotent: false,
    input_schema: TOOL_PARAMS.export_business_data,
    output_schema: TOOL_OUTPUT_SCHEMAS.export_business_data,
    evidence_contract: {
      success: 'Export file generated and download link provided',
      failure: 'Query error or permission denied',
    },
  },
  sheets_import: {
    tool_id: 'sheets_import',
    display_name: 'Import CSV/Spreadsheet',
    description: 'Import leads or clients from a CSV file.',
    version: '1.0.0',
    category: 'data',
    permission_level: 2,
    timeout_seconds: 120,
    requires_approval: true,
    idempotent: false,
    input_schema: TOOL_PARAMS.sheets_import,
    output_schema: TOOL_OUTPUT_SCHEMAS.sheets_import,
    evidence_contract: {
      success: 'Records parsed, deduplicated and imported',
      failure: 'Parse error or validation failure',
    },
  },
  save_to_db: {
    tool_id: 'save_to_db',
    display_name: 'Save to Database',
    description: 'Write a validated record to Supabase.',
    version: '1.0.0',
    category: 'data',
    permission_level: 0,
    timeout_seconds: 10,
    requires_approval: false,
    idempotent: true,
    input_schema: TOOL_PARAMS.save_to_db,
    output_schema: TOOL_OUTPUT_SCHEMAS.save_to_db,
    evidence_contract: {
      success: 'Record persisted with ID returned',
      failure: 'Database write error',
    },
  },
  search_knowledge: {
    tool_id: 'search_knowledge',
    display_name: 'Search Knowledge Base',
    description: 'Hybrid vector + full-text search of the indexed knowledge base with citations.',
    version: '1.0.0',
    category: 'data',
    permission_level: 0,
    timeout_seconds: 15,
    requires_approval: false,
    idempotent: false,
    input_schema: TOOL_PARAMS.search_knowledge,
    output_schema: TOOL_OUTPUT_SCHEMAS.search_knowledge,
    evidence_contract: {
      success: 'Relevant chunks returned with source citations',
      failure: 'Search error or no index available',
    },
  },
  ingest_knowledge_file: {
    tool_id: 'ingest_knowledge_file',
    display_name: 'Ingest Knowledge File',
    description: 'Upload and index a document into the knowledge base.',
    version: '1.0.0',
    category: 'data',
    permission_level: 2,
    timeout_seconds: 300,
    requires_approval: true,
    idempotent: false,
    input_schema: TOOL_PARAMS.ingest_knowledge_file,
    output_schema: TOOL_OUTPUT_SCHEMAS.ingest_knowledge_file,
    evidence_contract: {
      success: 'File parsed, chunked, embedded and indexed',
      failure: 'Parse failure, unsupported format, or embedding error',
    },
  },
  n8n_trigger: {
    tool_id: 'n8n_trigger',
    display_name: 'Trigger n8n Workflow',
    description: 'Trigger an n8n webhook. Reserved for future deployment; currently disabled.',
    version: '1.0.0',
    category: 'automation',
    permission_level: 1,
    timeout_seconds: 30,
    requires_approval: true,
    idempotent: false,
    input_schema: TOOL_PARAMS.n8n_trigger,
    output_schema: TOOL_OUTPUT_SCHEMAS.n8n_trigger,
    evidence_contract: {
      success: 'n8n webhook acknowledged with run ID',
      failure: 'n8n not configured or unreachable',
    },
  },
};

export function getToolContract(toolId: string): ToolContract | undefined {
  return TOOL_CONTRACTS[toolId];
}

export function getAllToolContracts(): ToolContract[] {
  return Object.values(TOOL_CONTRACTS);
}

export function validateToolInput(
  toolId: string,
  inputs: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const spec = TOOL_PARAMS[toolId];
  if (!spec) {
    return { valid: false, errors: [`No parameter schema defined for tool: ${toolId}`] };
  }

  if (Array.isArray(spec.required)) {
    for (const field of spec.required as string[]) {
      const val = inputs[field];
      if (val === undefined || val === null || (typeof val === 'string' && val.trim() === '')) {
        errors.push(`Missing required parameter for ${toolId}: ${field}`);
      }
    }
  }

  const properties = (spec.properties as Record<string, Record<string, unknown>>) ?? {};
  for (const [key, val] of Object.entries(inputs)) {
    const propSpec = properties[key];
    if (propSpec && val !== undefined && val !== null) {
      if (propSpec.type === 'string' && typeof val !== 'string') {
        errors.push(`Parameter '${key}' must be a string`);
      } else if (propSpec.type === 'number' && typeof val !== 'number') {
        errors.push(`Parameter '${key}' must be a number`);
      } else if (propSpec.type === 'array' && !Array.isArray(val)) {
        errors.push(`Parameter '${key}' must be an array`);
      } else if (propSpec.type === 'object' && (typeof val !== 'object' || Array.isArray(val))) {
        errors.push(`Parameter '${key}' must be an object`);
      }

      if (Array.isArray(propSpec.enum) && !propSpec.enum.includes(val)) {
        errors.push(`Parameter '${key}' has invalid value '${val}'. Allowed values: ${(propSpec.enum as string[]).join(', ')}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Load tool specs for a given agent from the DB.
 * Returns Groq-compatible function definitions for the agent's allowed_tools.
 * Excludes disabled or unconfigured tools.
 */
export async function loadToolSpecs(agentId: string): Promise<ToolSpec[]> {
  const supabase = getSupabase();

  const { data: agent } = await supabase
    .from('agents')
    .select('allowed_tools')
    .eq('agent_id', agentId)
    .single();

  if (!agent?.allowed_tools?.length) return [];

  const { data: tools } = await supabase
    .from('tools')
    .select('tool_id, display_name, description, status')
    .in('tool_id', agent.allowed_tools)
    .in('status', ['available', 'configured', 'operational']);

  if (!tools) return [];

  return tools.map(t => ({
    type: 'function' as const,
    function: {
      name: t.tool_id,
      description: t.description,
      parameters: TOOL_PARAMS[t.tool_id] ?? { type: 'object', properties: {}, required: [] },
    },
  }));
}
