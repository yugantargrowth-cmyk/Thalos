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
};

/**
 * Load tool specs for a given agent from the DB.
 * Returns Groq-compatible function definitions for the agent's allowed_tools.
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
    .in('status', ['available', 'configured', 'operational', 'needs_configuration']);

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
