/**
 * Product Portfolio & Business Units Domain Service (S05-AC-08)
 * ─────────────────────────────────────────────────────────────
 * Unifies multiple Yugantar-owned products and business units
 * under a single modular architecture without duplicating core
 * tables (leads, clients, projects, invoices).
 */

import { getSupabase } from '../lib/supabase.js';

export interface BusinessUnitDefinition {
  id: string;
  name: string;
  description: string;
  category: 'agency' | 'software' | 'productized_service';
  status: 'active' | 'development' | 'incubating';
  default_packages: string[];
}

export const CANONICAL_BUSINESS_UNITS: BusinessUnitDefinition[] = [
  {
    id: 'yugantar_growth',
    name: 'Yugantar Growth',
    description: 'Autonomous growth engineering and sales pipeline execution agency for high-growth enterprises.',
    category: 'agency',
    status: 'active',
    default_packages: ['pipeline_accelerator', 'revenue_retainer', 'custom_growth_sprint'],
  },
  {
    id: 'thalos_ai',
    name: 'THALOS AI Operating System',
    description: 'Agentic AI Business Operating System coordinating intelligence, memory, execution, and immune safeguards.',
    category: 'software',
    status: 'active',
    default_packages: ['thalos_core', 'enterprise_agent_mesh', 'dedicated_runtime'],
  },
  {
    id: 'scout_leadgen',
    name: 'Scout B2B Intelligence',
    description: 'Automated local business reconnaissance and verification crawler across Gujarat & Pan-India.',
    category: 'productized_service',
    status: 'active',
    default_packages: ['scout_daily_leads', 'deep_enrichment_pack'],
  },
  {
    id: 'custom_solutions',
    name: 'Yugantar Custom Solutions',
    description: 'Bespoke enterprise digital architecture, integrations, and automation engineering.',
    category: 'agency',
    status: 'active',
    default_packages: ['enterprise_custom_build'],
  },
];

export interface PortfolioSummary {
  timestamp: string;
  business_units: Array<{
    id: string;
    name: string;
    leads_count: number;
    clients_count: number;
    active_projects_count: number;
    total_revenue: number;
  }>;
}

export class PortfolioService {
  /**
   * List all registered business units and product offerings.
   */
  listBusinessUnits(): BusinessUnitDefinition[] {
    return CANONICAL_BUSINESS_UNITS;
  }

  /**
   * Get a specific business unit by ID.
   */
  getBusinessUnit(unitId: string): BusinessUnitDefinition | null {
    return CANONICAL_BUSINESS_UNITS.find((u) => u.id === unitId) ?? null;
  }

  /**
   * Derive live cross-unit portfolio performance metrics without schema duplication.
   */
  async getPortfolioSummary(): Promise<PortfolioSummary> {
    const supabase = getSupabase();

    const [leadsRes, clientsRes, projectsRes, paymentsRes] = await Promise.all([
      supabase.from('leads').select('tags'),
      supabase.from('clients').select('tags, packages'),
      supabase.from('projects').select('tags, status'),
      supabase.from('payments').select('amount'),
    ]);

    const leads = leadsRes.data ?? [];
    const clients = clientsRes.data ?? [];
    const projects = projectsRes.data ?? [];
    const payments = paymentsRes.data ?? [];

    const totalSystemPayments = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    const unitsMetrics = CANONICAL_BUSINESS_UNITS.map((unit) => {
      // Attribute counts based on business_unit tag (or default to yugantar_growth)
      const unitTag = `unit:${unit.id}`;
      const isDefault = unit.id === 'yugantar_growth';

      const unitLeads = leads.filter(
        (l) => (l.tags ?? []).includes(unitTag) || (isDefault && !(l.tags ?? []).some((t: string) => t.startsWith('unit:')))
      ).length;

      const unitClients = clients.filter(
        (c) => (c.tags ?? []).includes(unitTag) || (isDefault && !(c.tags ?? []).some((t: string) => t.startsWith('unit:')))
      ).length;

      const unitProjects = projects.filter(
        (p) =>
          p.status === 'active' &&
          ((p.tags ?? []).includes(unitTag) || (isDefault && !(p.tags ?? []).some((t: string) => t.startsWith('unit:'))))
      ).length;

      // Assign revenue proportionally or attributed to unit
      const revenue = isDefault ? totalSystemPayments : 0;

      return {
        id: unit.id,
        name: unit.name,
        leads_count: unitLeads,
        clients_count: unitClients,
        active_projects_count: unitProjects,
        total_revenue: Math.round(revenue * 100) / 100,
      };
    });

    return {
      timestamp: new Date().toISOString(),
      business_units: unitsMetrics,
    };
  }
}

export const portfolioService = new PortfolioService();
