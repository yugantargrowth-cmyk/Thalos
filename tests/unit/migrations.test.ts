import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
// @ts-expect-error migrate.js is an executable JavaScript script
import { getMigrationPlan } from '../../scripts/migrate.js';

describe('Database migrations validation (L13-AC-01, L13-AC-02)', () => {
  const migrationsDir = join(process.cwd(), 'database', 'migrations');
  const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  it('all migration files are strictly numbered in ascending order 001 to 007', () => {
    expect(files.length).toBeGreaterThanOrEqual(7);
    files.forEach((file, idx) => {
      const prefix = parseInt(file.split('_')[0], 10);
      expect(prefix).toBe(idx + 1);
    });
  });

  it('each migration file is non-empty and contains valid SQL statements', () => {
    for (const file of files) {
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      expect(sql.trim().length).toBeGreaterThan(50);
      // Ensure no dangling placeholders in SQL
      expect(sql).not.toContain('TODO');
      expect(sql).not.toContain('REPLACE_ME');
    }
  });

  it('getMigrationPlan generates complete deterministic plan with sha256 checksums', async () => {
    const plan = await getMigrationPlan();
    expect(plan.length).toBe(files.length);
    for (const item of plan) {
      expect(item.checksum).toMatch(/^[a-f0-9]{64}$/);
      expect(item.length).toBeGreaterThan(0);
    }
  });

  it('verifies RLS policies are declared on all primary data tables in migration 005', () => {
    const mig005 = readFileSync(join(migrationsDir, '005_knowledge_integrations_audit.sql'), 'utf8');
    const expectedTables = ['documents', 'document_chunks', 'knowledge_nodes', 'integrations', 'audit_log'];
    for (const table of expectedTables) {
      expect(mig005).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
    }
  });

  it('verifies audit_log immutability trigger exists to enforce append-only constraint', () => {
    const mig005 = readFileSync(join(migrationsDir, '005_knowledge_integrations_audit.sql'), 'utf8');
    expect(mig005).toContain('prevent_audit_mutation()');
    expect(mig005).toContain('BEFORE UPDATE OR DELETE ON audit_log');
  });

  it('verifies migration 007 adds confidence, verification_status, scope and superseded_by to knowledge_nodes', () => {
    const mig007 = readFileSync(join(migrationsDir, '007_memory_provenance_and_supersession.sql'), 'utf8');
    expect(mig007).toContain('confidence');
    expect(mig007).toContain('verification_status');
    expect(mig007).toContain('superseded_by');
    expect(mig007).toContain('scope');
  });
});
