import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkerService } from '../../src/worker/worker.js';

const mockSupabase = {
  from: vi.fn(),
  rpc: vi.fn(),
};

vi.mock('../../src/lib/supabase.js', () => ({
  getSupabase: () => mockSupabase,
}));

describe('Worker CSV Import Job (L11-AC-05, R-004)', () => {
  let worker: WorkerService;

  beforeEach(() => {
    vi.clearAllMocks();
    worker = new WorkerService('test-worker');
  });

  it('imports leads from CSV string and upserts records', async () => {
    const csvContent = 'name,phone,email,industry\nAlpha Corp,+1234567890,alpha@example.com,Tech\nBeta LLC,+1987654321,beta@example.com,Finance';

    const upsertMock = vi.fn().mockResolvedValue({ error: null });
    mockSupabase.from.mockReturnValue({
      upsert: upsertMock,
    });

    await worker.importCsv({
      target_table: 'leads',
      csv_data: csvContent,
    });

    expect(mockSupabase.from).toHaveBeenCalledWith('leads');
    expect(upsertMock).toHaveBeenCalledTimes(2);
    expect(upsertMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        name: 'Alpha Corp',
        phone: '+1234567890',
        email: 'alpha@example.com',
        industry: 'Tech',
        stage: 'new',
        source: 'import',
      }),
      { onConflict: 'phone' }
    );
  });

  it('imports clients from CSV string and inserts records', async () => {
    const csvContent = 'business_name,contact_name,phone,email,monthly_value\nAcme Dental,Dr. Smith,+15550001,smith@acme.com,1500';

    const insertMock = vi.fn().mockResolvedValue({ error: null });
    mockSupabase.from.mockReturnValue({
      insert: insertMock,
    });

    await worker.importCsv({
      target_table: 'clients',
      csv_data: csvContent,
    });

    expect(mockSupabase.from).toHaveBeenCalledWith('clients');
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        business_name: 'Acme Dental',
        contact_name: 'Dr. Smith',
        phone: '+15550001',
        email: 'smith@acme.com',
        monthly_value: 1500,
        status: 'active',
      })
    );
  });

  it('throws error if CSV has no content or insufficient rows', async () => {
    await expect(
      worker.importCsv({ target_table: 'leads', csv_data: '' })
    ).rejects.toThrow('No CSV data provided or extracted');

    await expect(
      worker.importCsv({ target_table: 'leads', csv_data: 'name,phone,email' })
    ).rejects.toThrow('CSV must contain a header and at least one data row');
  });

  it('extracts CSV data from document chunks when document_id is provided', async () => {
    const chunkMock = vi.fn().mockReturnValue({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({
            data: [
              { content: 'name,phone\n' },
              { content: 'Gamma Inc,+1122334455\n' },
            ],
            error: null,
          }),
        }),
      }),
    });

    const upsertMock = vi.fn().mockResolvedValue({ error: null });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'document_chunks') return chunkMock();
      if (table === 'leads') return { upsert: upsertMock };
      return {};
    });

    await worker.importCsv({
      target_table: 'leads',
      document_id: 'doc-uuid-1234',
    });

    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Gamma Inc',
        phone: '+1122334455',
      }),
      { onConflict: 'phone' }
    );
  });
});
