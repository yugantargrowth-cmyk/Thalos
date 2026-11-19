/**
 * Canonical Domain Entities & Contracts
 * ─────────────────────────────────────────────────────────────
 * Defines entity types, state machines, relationship rules, and
 * invariant constraints for the Yugantar Growth operating modules (L12-AC-01).
 */

// ── Lead Entity ───────────────────────────────────────────────
export const LEAD_STAGES = [
  'new',
  'researching',
  'outreach_drafted',
  'contacted',
  'follow_up',
  'qualified',
  'proposal_sent',
  'negotiating',
  'won',
  'lost',
  'unqualified',
] as const;

export type LeadStage = typeof LEAD_STAGES[number];

export interface LeadEntity {
  id: string;
  name: string;
  contact_name?: string | null;
  phone: string;
  email?: string | null;
  industry?: string | null;
  location?: string | null;
  stage: LeadStage;
  source?: string | null;
  estimated_value?: number | null;
  follow_up_date?: string | null;
  notes?: string | null;
  verified_claims?: string[];
  created_at: string;
  updated_at: string;
}

// ── Client Entity ─────────────────────────────────────────────
export const CLIENT_STATUSES = ['active', 'onboarding', 'paused', 'churned'] as const;
export type ClientStatus = typeof CLIENT_STATUSES[number];

export interface ClientEntity {
  id: string;
  business_name: string;
  contact_name: string;
  phone: string;
  email?: string | null;
  status: ClientStatus;
  start_date: string;
  monthly_value: number; // in INR
  packages?: string[];
  converted_from_lead_id?: string | null;
  created_at: string;
  updated_at: string;
}

// ── Project & Task Entities ───────────────────────────────────
export const PROJECT_STATUSES = ['active', 'in_progress', 'completed', 'blocked', 'cancelled'] as const;
export type ProjectStatus = typeof PROJECT_STATUSES[number];

export interface ProjectEntity {
  id: string;
  client_id: string;
  name: string;
  status: ProjectStatus;
  due_date?: string | null;
  completed_date?: string | null;
  deliverables?: Record<string, unknown>;
  progress_percent?: number;
  created_at: string;
  updated_at: string;
}

export const TASK_STATUSES = ['todo', 'in_progress', 'completed', 'blocked'] as const;
export type TaskStatus = typeof TASK_STATUSES[number];

export interface TaskEntity {
  id: string;
  project_id?: string | null;
  client_id?: string | null;
  title: string;
  status: TaskStatus;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  due_date?: string | null;
  completed_date?: string | null;
  assigned_agent?: string | null;
  created_at: string;
  updated_at: string;
}

// ── Finance Entities ──────────────────────────────────────────
export interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export const INVOICE_STATUSES = [
  'draft',
  'approved',
  'sent',
  'partially_paid',
  'paid',
  'overdue',
  'cancelled',
  'void',
] as const;

export type InvoiceStatus = typeof INVOICE_STATUSES[number];

export interface InvoiceEntity {
  id: string;
  invoice_number: string;
  client_id?: string | null;
  proposal_id?: string | null;
  client_name: string;
  client_email?: string | null;
  line_items: LineItem[];
  subtotal: number;
  tax_percent: number;
  tax_amount: number;
  total: number;
  balance_due: number;
  due_date: string;
  status: InvoiceStatus;
  sent_at?: string | null;
  sent_evidence?: string | null;
  approval_id?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentEntity {
  id: string;
  invoice_id: string;
  amount: number;
  payment_date: string;
  payment_method: 'bank_transfer' | 'upi' | 'cash' | 'cheque' | 'online' | 'other';
  reference?: string | null;
  notes?: string | null;
  recorded_by: string;
  evidence_type: string;
  created_at: string;
}

export const PROPOSAL_STATUSES = ['draft', 'approved', 'sent', 'accepted', 'rejected', 'expired'] as const;
export type ProposalStatus = typeof PROPOSAL_STATUSES[number];

export interface ProposalEntity {
  id: string;
  lead_id?: string | null;
  client_id?: string | null;
  client_name: string;
  client_email?: string | null;
  line_items: LineItem[];
  custom_scope?: string | null;
  subtotal: number;
  tax_percent: number;
  tax_amount: number;
  total: number;
  valid_until?: string | null;
  status: ProposalStatus;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}
