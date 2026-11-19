/**
 * Business Reporting Service
 * ─────────────────────────────────────────────────────────────
 * Derives business intelligence, pipeline analytics, and revenue summaries
 * strictly from persisted database records with explicit filters & freshness (L12-AC-06).
 */

import { getSupabase } from '../lib/supabase.js';

export interface PipelineReport {
  generated_at: string;
  total_leads: number;
  stage_counts: Record<string, number>;
  total_pipeline_value: number;
  conversion_rate_percent: number;
  data_freshness: string;
}

export interface RevenueReport {
  generated_at: string;
  active_clients: number;
  mrr: number;
  total_invoiced: number;
  total_collected: number;
  total_outstanding: number;
  collection_ratio_percent: number;
  disclaimer: string;
}

export class ReportingService {
  /**
   * Derive live pipeline velocity and conversion metrics from leads table (L12-AC-06)
   */
  async getPipelineReport(): Promise<PipelineReport> {
    const supabase = getSupabase();
    const { data: leads, error } = await supabase
      .from('leads')
      .select('stage, estimated_value, created_at');

    if (error) throw new Error(`Failed to generate pipeline report: ${error.message}`);

    const allLeads = leads ?? [];
    const stageCounts: Record<string, number> = {};
    let totalValue = 0;
    let wonCount = 0;

    for (const lead of allLeads) {
      stageCounts[lead.stage] = (stageCounts[lead.stage] ?? 0) + 1;
      if (lead.estimated_value) totalValue += Number(lead.estimated_value);
      if (lead.stage === 'won') wonCount++;
    }

    const conversionRate = allLeads.length > 0
      ? Math.round((wonCount / allLeads.length) * 10000) / 100
      : 0;

    return {
      generated_at: new Date().toISOString(),
      total_leads: allLeads.length,
      stage_counts: stageCounts,
      total_pipeline_value: Math.round(totalValue * 100) / 100,
      conversion_rate_percent: conversionRate,
      data_freshness: 'live_query',
    };
  }

  /**
   * Derive live revenue, MRR, and outstanding collections from clients, invoices, and payments (L12-AC-06)
   */
  async getRevenueReport(): Promise<RevenueReport> {
    const supabase = getSupabase();

    const [clientsRes, invoicesRes, paymentsRes] = await Promise.all([
      supabase.from('clients').select('monthly_value, status').eq('status', 'active'),
      supabase.from('invoices').select('total, balance_due, status').neq('status', 'void').neq('status', 'cancelled'),
      supabase.from('payments').select('amount'),
    ]);

    const activeClients = clientsRes.data ?? [];
    const invoices = invoicesRes.data ?? [];
    const payments = paymentsRes.data ?? [];

    const mrr = activeClients.reduce((sum, c) => sum + (Number(c.monthly_value) || 0), 0);
    const totalInvoiced = invoices.reduce((sum, i) => sum + (Number(i.total) || 0), 0);
    const totalOutstanding = invoices
      .filter((i) => ['sent', 'partially_paid', 'overdue'].includes(i.status))
      .reduce((sum, i) => sum + (Number(i.balance_due) || 0), 0);
    const totalCollected = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    const collectionRatio = totalInvoiced > 0
      ? Math.round((totalCollected / totalInvoiced) * 10000) / 100
      : 0;

    return {
      generated_at: new Date().toISOString(),
      active_clients: activeClients.length,
      mrr: Math.round(mrr * 100) / 100,
      total_invoiced: Math.round(totalInvoiced * 100) / 100,
      total_collected: Math.round(totalCollected * 100) / 100,
      total_outstanding: Math.round(totalOutstanding * 100) / 100,
      collection_ratio_percent: collectionRatio,
      disclaimer: 'Derived from persisted invoices and payment ledger. Internal reference only.',
    };
  }
}

export const reportingService = new ReportingService();
