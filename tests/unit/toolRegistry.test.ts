/**
 * Unit tests for toolRegistry — verifies spec shape and coverage.
 */
import { describe, it, expect, vi } from 'vitest';

const TOOL_ROWS = [
  { tool_id: 'web_search',       display_name: 'Web Search',       description: 'Search the web',   status: 'available' },
  { tool_id: 'website_audit',    display_name: 'Website Audit',    description: 'Audit a URL',      status: 'available' },
  { tool_id: 'social_lookup',    display_name: 'Social Lookup',    description: 'Check social',     status: 'available' },
  { tool_id: 'create_lead',      display_name: 'Create Lead',      description: 'Create a lead',    status: 'available' },
  { tool_id: 'search_knowledge', display_name: 'Search Knowledge', description: 'RAG search',       status: 'available' },
];


vi.mock('../../src/lib/supabase.js', () => ({
  getSupabase: () => ({
    from: (table: string) => {
      if (table === 'agents') {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({
                data: {
                  agent_id: 'scout',
                  allowed_tools: ['web_search', 'website_audit', 'social_lookup', 'create_lead', 'search_knowledge'],
                },
                error: null,
              }),
            }),
          }),
        };
      }
      // tools table — .select().in().in() pattern
      return {
        select: () => ({
          in: () => ({
            in: () => Promise.resolve({ data: TOOL_ROWS, error: null }),
          }),
        }),
      };
    },
  }),
}));

import { loadToolSpecs } from '../../src/intelligence/toolRegistry.js';

describe('loadToolSpecs', () => {
  it('returns an array of tool specs', async () => {
    const specs = await loadToolSpecs('scout');
    expect(Array.isArray(specs)).toBe(true);
    expect(specs.length).toBeGreaterThan(0);
  });

  it('every spec has type=function', async () => {
    const specs = await loadToolSpecs('scout');
    for (const s of specs) {
      expect(s.type).toBe('function');
    }
  });

  it('every spec has a non-empty name and description', async () => {
    const specs = await loadToolSpecs('scout');
    for (const s of specs) {
      expect(typeof s.function.name).toBe('string');
      expect(s.function.name.length).toBeGreaterThan(0);
      expect(typeof s.function.description).toBe('string');
      expect(s.function.description.length).toBeGreaterThan(0);
    }
  });

  it('every spec parameters has type=object', async () => {
    const specs = await loadToolSpecs('scout');
    for (const s of specs) {
      const params = s.function.parameters as Record<string, unknown>;
      expect(params.type).toBe('object');
      expect(params.properties).toBeDefined();
    }
  });

  it('web_search spec has required query param', async () => {
    const specs = await loadToolSpecs('scout');
    const ws = specs.find(s => s.function.name === 'web_search');
    expect(ws).toBeDefined();
    const required = (ws!.function.parameters as Record<string, string[]>).required;
    expect(required).toContain('query');
  });

  it('create_lead spec requires name and phone', async () => {
    const specs = await loadToolSpecs('scout');
    const cl = specs.find(s => s.function.name === 'create_lead');
    expect(cl).toBeDefined();
    const required = (cl!.function.parameters as Record<string, string[]>).required;
    expect(required).toContain('name');
    expect(required).toContain('phone');
  });

  it('every spec with required array has only strings in it', async () => {
    const specs = await loadToolSpecs('scout');
    for (const s of specs) {
      const req = (s.function.parameters as Record<string, unknown>).required;
      if (Array.isArray(req)) {
        for (const r of req) expect(typeof r).toBe('string');
      }
    }
  });
});
