import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import multer from 'multer';
import { getSupabase } from '../../lib/supabase.js';
import { AppError } from '../middleware/errorHandler.js';
import { audit } from '../../lib/audit.js';
import { uploadLimiter } from '../middleware/rateLimit.js';
import { queueIngestionJob } from '../../persistence/ingestionQueue.js';
import { hybridSearch } from '../../persistence/ragSearch.js';

const router = Router();

const ALLOWED_MIME_TYPES = [
  'text/plain','text/markdown','text/csv',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/json',
];
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

// ── Upload and ingest document ───────────────────────────────
router.post(
  '/documents',
  uploadLimiter,
  upload.single('file'),
  body('category').optional().isIn(['company','services','market','client','process','personal','general']),
  body('tags').optional().isString(),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const supabase = getSupabase();
    const crypto = await import('crypto');
    const checksum = crypto.createHash('sha256').update(req.file.buffer).digest('hex');

    // Deduplication by checksum
    const { data: existing } = await supabase
      .from('documents')
      .select('id, title, status')
      .eq('checksum_sha256', checksum)
      .maybeSingle();

    if (existing) {
      res.status(409).json({
        error: 'Duplicate file — identical content already indexed',
        existing_document: { id: existing.id, title: existing.title, status: existing.status },
      });
      return;
    }

    const tags = req.body.tags
      ? (req.body.tags as string).split(',').map((t: string) => t.trim()).filter(Boolean)
      : [];

    // Create document record
    const { data: doc, error } = await supabase.from('documents').insert({
      title: req.body.title ?? req.file.originalname,
      original_filename: req.file.originalname,
      file_format: req.file.originalname.split('.').pop()?.toLowerCase() ?? 'unknown',
      mime_type: req.file.mimetype,
      file_size_bytes: req.file.size,
      checksum_sha256: checksum,
      status: 'pending',
      category: req.body.category ?? 'general',
      tags,
      uploaded_by: req.auth?.sub ?? 'founder',
    }).select().single();

    if (error || !doc) throw new AppError(500, 'Failed to create document record', error?.message);

    // Queue ingestion job — actual chunking/embedding done by worker
    await queueIngestionJob({
      document_id: doc.id,
      filename: req.file.originalname,
      mime_type: req.file.mimetype,
      buffer: req.file.buffer,
    });

    await audit({
      event_type: 'document.uploaded',
      entity_type: 'document',
      entity_id: doc.id,
      actor: req.auth?.sub ?? 'system',
      description: `Document uploaded: ${doc.title} (${(req.file.size / 1024).toFixed(1)} KB)`,
    });

    res.status(202).json({
      document: { id: doc.id, title: doc.title, status: 'pending' },
      message: 'Document queued for ingestion. Check status at GET /api/knowledge/documents/:id',
    });
  }
);

// ── List documents ────────────────────────────────────────────
router.get('/documents', async (req: Request, res: Response): Promise<void> => {
  const supabase = getSupabase();
  const limit = parseInt(req.query.limit as string) || 50;
  const status = req.query.status as string | undefined;

  let q = supabase
    .from('documents')
    .select('id,title,original_filename,file_format,file_size_bytes,status,category,tags,page_count,char_count,created_at,updated_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) q = q.eq('status', status);

  const { data, error, count } = await q;
  if (error) throw new AppError(500, 'Failed to fetch documents');
  res.json({ documents: data, total: count });
});

// ── Get document status ───────────────────────────────────────
router.get('/documents/:id', param('id').isUUID(), async (req: Request, res: Response): Promise<void> => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error || !data) throw new AppError(404, 'Document not found');

  const { count: chunkCount } = await supabase
    .from('document_chunks')
    .select('*', { count: 'exact', head: true })
    .eq('document_id', req.params.id);

  res.json({ document: data, chunk_count: chunkCount ?? 0 });
});

// ── Search knowledge base ─────────────────────────────────────
router.post(
  '/search',
  body('query').isString().trim().isLength({ min: 3, max: 1000 }),
  body('top_k').optional().isInt({ min: 1, max: 20 }).toInt(),
  body('category').optional().isString(),
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: 'Validation failed', details: errors.array() });
      return;
    }

    const results = await hybridSearch({
      query: req.body.query, topK: req.body.top_k ?? 5,
      category: req.body.category,
    });

    res.json({ results, query: req.body.query, count: results.length });
  }
);

export default router;
