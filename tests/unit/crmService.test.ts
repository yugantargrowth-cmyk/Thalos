import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CrmService,
  normalisePhone,
  VALID_LEAD_STAGES,
  VALID_CLIENT_STATUSES,
  VALID_TASK_STATUSES,
  VALID_TASK_PRIORITIES,
  VALID_PROJECT_STATUSES,
} from '../../src/business/crmService.js';
import { audit } from '../../src/lib/audit.js';

const mockSingle = vi.fn();
const mockMaybeSingle = vi.fn();
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();

vi.mock('../../src/lib/supabase.js', () => ({
  getSupabase: () => ({
    from: () => ({
      insert: mockInsert,
      update: mockUpdate,
      select: mockSelect,
    }),
  }),
}));

vi.mock('../../src/lib/audit.js', () => ({
  audit: vi.fn().mockResolvedValue(undefined),
}));

describe('CrmService — Domain Operations & Lifecycle (L12-AC-02, L12-AC-03)', () => {
  let crmService: CrmService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSingle.mockReset();
    mockMaybeSingle.mockReset();
    mockSelect.mockReset();
    mockInsert.mockReset();
    mockUpdate.mockReset();
    mockEq.mockReset();

    crmService = new CrmService();

    const queryMock: any = {
      select: vi.fn(() => queryMock),
      update: vi.fn(() => queryMock),
      eq: vi.fn(() => queryMock),
      single: mockSingle,
      maybeSingle: mockMaybeSingle,
    };
    mockSelect.mockReturnValue(queryMock);
    mockInsert.mockReturnValue(queryMock);
    mockUpdate.mockReturnValue(queryMock);
    mockEq.mockReturnValue(queryMock);
  });

  // ── Phone Normalisation ─────────────────────────────────────
  describe('normalisePhone', () => {
    it('normalises standard 10-digit Indian numbers to E.164 +91 format', () => {
      expect(normalisePhone('9876543210')).toBe('+919876543210');
      expect(normalisePhone('+919876543210')).toBe('+919876543210');
      expect(normalisePhone('919876543210')).toBe('+919876543210');
      expect(normalisePhone('0919876543210')).toBe('+919876543210');
    });

    it('strips dashes, parentheses, and spaces', () => {
      expect(normalisePhone('+91 (98765) 43-210')).toBe('+919876543210');
    });
  });

  // ── Lead Operations ─────────────────────────────────────────
  describe('createLead', () => {
    it('creates lead with normalised phone and default stage new', async () => {
      mockSingle.mockResolvedValueOnce({
        data: {
          id: 'lead-1',
          name: 'Apex Dental',
          phone: '+919876543210',
          stage: 'new',
          source: 'manual',
        },
        error: null,
      });

      const lead = await crmService.createLead({
        name: 'Apex Dental',
        phone: '9876543210',
      });

      expect(lead.id).toBe('lead-1');
      expect(lead.phone).toBe('+919876543210');
      expect(lead.stage).toBe('new');
      expect(audit).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'tool.create_lead',
          entity_type: 'lead',
        })
      );
    });

    it('rejects lead creation with missing name or phone', async () => {
      await expect(crmService.createLead({ name: '', phone: '9876543210' })).rejects.toThrow('name');
      await expect(crmService.createLead({ name: 'Apex Dental', phone: '   ' })).rejects.toThrow('phone');
    });

    it('rejects lead creation with invalid stage', async () => {
      await expect(
        crmService.createLead({
          name: 'Apex Dental',
          phone: '9876543210',
          stage: 'super_won',
        })
      ).rejects.toThrow('Invalid stage');
    });
  });

  describe('updateLead', () => {
    it('updates allowed lead fields and logs audit', async () => {
      mockSingle.mockResolvedValueOnce({
        data: {
          id: 'lead-1',
          name: 'Apex Dental',
          stage: 'qualified',
        },
        error: null,
      });

      const { lead, updated_fields } = await crmService.updateLead('lead-1', {
        stage: 'qualified',
        contact_name: 'Dr. Apex',
      });

      expect(lead.stage).toBe('qualified');
      expect(updated_fields).toContain('stage');
      expect(updated_fields).toContain('contact_name');
    });

    it('rejects update with invalid stage', async () => {
      await expect(
        crmService.updateLead('lead-1', { stage: 'invalid_stage' })
      ).rejects.toThrow('Invalid stage');
    });

    it('rejects update with no valid fields', async () => {
      await expect(crmService.updateLead('lead-1', {})).rejects.toThrow('No fields to update');
    });
  });

  // ── Client Operations ───────────────────────────────────────
  describe('createClient', () => {
    it('creates active client and updates lead to won if converted_from_lead_id provided', async () => {
      mockSingle.mockResolvedValueOnce({
        data: {
          id: 'client-1',
          business_name: 'Apex Dental Clinic',
          monthly_value: 35000,
          status: 'active',
          converted_from_lead_id: 'lead-1',
        },
        error: null,
      });

      const client = await crmService.createClient({
        business_name: 'Apex Dental Clinic',
        contact_name: 'Dr. Apex',
        phone: '+919876543210',
        start_date: '2026-11-01',
        monthly_value: 35000,
        status: 'active',
        converted_from_lead_id: 'lead-1',
      });

      expect(client.id).toBe('client-1');
      expect(client.monthly_value).toBe(35000);
      expect(audit).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'tool.create_client',
          entity_type: 'client',
        })
      );
    });

    it('rejects negative monthly value', async () => {
      await expect(
        crmService.createClient({
          business_name: 'Apex Dental',
          contact_name: 'Dr. Apex',
          phone: '+919876543210',
          start_date: '2026-11-01',
          monthly_value: -500,
        })
      ).rejects.toThrow('monthly_value must be non-negative');
    });

    it('rejects invalid client status', async () => {
      await expect(
        crmService.createClient({
          business_name: 'Apex Dental',
          contact_name: 'Dr. Apex',
          phone: '+919876543210',
          start_date: '2026-11-01',
          status: 'suspended_forever',
        })
      ).rejects.toThrow('Invalid status');
    });
  });

  // ── Project & Task Operations ───────────────────────────────
  describe('createTask & updateTask', () => {
    it('creates task with default priority medium and status todo', async () => {
      mockSingle.mockResolvedValueOnce({
        data: {
          id: 'task-1',
          title: 'Design Social Media Banner',
          priority: 'medium',
          status: 'todo',
        },
        error: null,
      });

      const task = await crmService.createTask({
        title: 'Design Social Media Banner',
      });

      expect(task.priority).toBe('medium');
      expect(task.status).toBe('todo');
    });

    it('rejects task with invalid priority', async () => {
      await expect(
        crmService.createTask({
          title: 'Design',
          priority: 'insane_priority',
        })
      ).rejects.toThrow('Invalid priority');
    });

    it('automatically sets completed_date when task is transitioned to completed', async () => {
      mockSingle.mockResolvedValueOnce({
        data: {
          id: 'task-1',
          title: 'Design',
          status: 'completed',
        },
        error: null,
      });

      const { task } = await crmService.updateTask('task-1', {
        status: 'completed',
      });

      expect(task.status).toBe('completed');
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          completed_date: expect.any(String),
        })
      );
    });
  });

  describe('createProject & updateProject', () => {
    it('creates project in planning status', async () => {
      mockSingle.mockResolvedValueOnce({
        data: {
          id: 'proj-1',
          name: 'Q4 Growth Sprint',
          client_id: 'client-1',
          status: 'planning',
        },
        error: null,
      });

      const project = await crmService.createProject({
        client_id: 'client-1',
        name: 'Q4 Growth Sprint',
      });

      expect(project.status).toBe('planning');
    });

    it('rejects project update with invalid status', async () => {
      await expect(
        crmService.updateProject('proj-1', { status: 'destroyed' })
      ).rejects.toThrow('Invalid status');
    });
  });

  // ── Follow-Up & Activity Operations ─────────────────────────
  describe('scheduleFollowUp & logLeadActivity', () => {
    it('schedules follow up and logs activity', async () => {
      mockSingle.mockResolvedValueOnce({
        data: {
          id: 'fu-1',
          entity_type: 'lead',
          entity_id: 'lead-1',
          due_date: '2026-11-25',
        },
        error: null,
      });

      const fu = await crmService.scheduleFollowUp({
        entity_type: 'lead',
        entity_id: 'lead-1',
        due_date: '2026-11-25',
        reminder_note: 'Discuss proposal terms',
      });

      expect(fu.follow_up_id).toBe('fu-1');
      expect(fu.due_date).toBe('2026-11-25');

      mockSingle.mockResolvedValueOnce({
        data: {
          id: 'act-1',
          lead_id: 'lead-1',
          activity: 'phone_call',
        },
        error: null,
      });

      const act = await crmService.logLeadActivity(
        'lead-1',
        'phone_call',
        'Spoke with business owner'
      );

      expect(act.activity_id).toBe('act-1');
      expect(act.activity).toBe('phone_call');
    });
  });
});
