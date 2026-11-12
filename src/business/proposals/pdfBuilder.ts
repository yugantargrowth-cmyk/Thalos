import PDFDocument from 'pdfkit';

type LineItem = { description: string; quantity: number; unit_price: number; subtotal: number };

interface ProposalRecord {
  id: string;
  client_name: string;
  client_email?: string;
  line_items: LineItem[];
  custom_scope?: string;
  subtotal: number;
  tax_percent: number;
  tax_amount: number;
  total: number;
  valid_until?: string;
  notes?: string;
  created_at: string;
}

interface InvoiceRecord {
  id: string;
  invoice_number: string;
  client_name: string;
  client_email?: string;
  line_items: LineItem[];
  subtotal: number;
  tax_percent: number;
  tax_amount: number;
  total: number;
  balance_due: number;
  due_date: string;
  notes?: string;
  created_at: string;
}

function formatINR(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
}

export function buildProposalPDF(proposal: ProposalRecord): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(22).font('Helvetica-Bold').text('YUGANTAR GROWTH', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text('Ahmedabad, Gujarat, India', { align: 'center' });
    doc.moveDown();
    doc.fontSize(16).font('Helvetica-Bold').text('PROPOSAL', { align: 'center' });
    doc.moveDown();

    // Disclaimer
    doc.fontSize(8).font('Helvetica').fillColor('#888')
      .text('DISCLAIMER: This proposal is for internal planning purposes only. Tax calculations are estimates for reference. Consult a qualified CA for final invoicing and GST compliance.', { align: 'center' });
    doc.fillColor('#000').moveDown();

    // Client info
    doc.fontSize(11).font('Helvetica-Bold').text('Prepared for:');
    doc.font('Helvetica').text(proposal.client_name);
    if (proposal.client_email) doc.text(proposal.client_email);
    doc.text(`Date: ${new Date(proposal.created_at).toLocaleDateString('en-IN')}`);
    if (proposal.valid_until) doc.text(`Valid until: ${new Date(proposal.valid_until).toLocaleDateString('en-IN')}`);
    doc.moveDown();

    // Line items table
    doc.fontSize(11).font('Helvetica-Bold').text('Scope of Work');
    doc.moveDown(0.5);

    // Table header
    const tableTop = doc.y;
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('Description', 50, tableTop, { width: 250 });
    doc.text('Qty', 310, tableTop, { width: 60, align: 'right' });
    doc.text('Unit Price', 380, tableTop, { width: 80, align: 'right' });
    doc.text('Amount', 470, tableTop, { width: 70, align: 'right' });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);

    for (const item of proposal.line_items) {
      const y = doc.y;
      doc.fontSize(9).font('Helvetica');
      doc.text(item.description, 50, y, { width: 250 });
      doc.text(String(item.quantity), 310, y, { width: 60, align: 'right' });
      doc.text(formatINR(item.unit_price), 380, y, { width: 80, align: 'right' });
      doc.text(formatINR(item.subtotal), 470, y, { width: 70, align: 'right' });
      doc.moveDown(0.5);
    }

    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);

    // Totals
    const totalY = doc.y;
    doc.fontSize(10).font('Helvetica').text('Subtotal', 380, totalY, { width: 90, align: 'right' });
    doc.text(formatINR(proposal.subtotal), 470, totalY, { width: 70, align: 'right' });
    doc.moveDown(0.3);
    doc.text(`GST (${proposal.tax_percent}%)`, 380, doc.y, { width: 90, align: 'right' });
    doc.text(formatINR(proposal.tax_amount), 470, doc.y, { width: 70, align: 'right' });
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').text('TOTAL', 380, doc.y, { width: 90, align: 'right' });
    doc.text(formatINR(proposal.total), 470, doc.y, { width: 70, align: 'right' });

    if (proposal.notes) {
      doc.moveDown();
      doc.fontSize(10).font('Helvetica-Bold').text('Notes:');
      doc.font('Helvetica').text(proposal.notes);
    }

    doc.end();
  });
}

export function buildInvoicePDF(invoice: InvoiceRecord): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(22).font('Helvetica-Bold').text('YUGANTAR GROWTH', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text('Ahmedabad, Gujarat, India', { align: 'center' });
    doc.moveDown();
    doc.fontSize(16).font('Helvetica-Bold').text('TAX INVOICE', { align: 'center' });
    doc.moveDown();

    doc.fontSize(8).fillColor('#888')
      .text('DISCLAIMER: This invoice is generated for reference. Final invoicing and GST compliance requires verification by a qualified CA.', { align: 'center' });
    doc.fillColor('#000').moveDown();

    doc.fontSize(11).font('Helvetica-Bold').text(`Invoice No: ${invoice.invoice_number}`);
    doc.font('Helvetica').text(`Date: ${new Date(invoice.created_at).toLocaleDateString('en-IN')}`);
    doc.text(`Due Date: ${new Date(invoice.due_date).toLocaleDateString('en-IN')}`);
    doc.moveDown();
    doc.font('Helvetica-Bold').text('Bill To:');
    doc.font('Helvetica').text(invoice.client_name);
    if (invoice.client_email) doc.text(invoice.client_email);
    doc.moveDown();

    // Line items
    const tableTop = doc.y;
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('Description', 50, tableTop, { width: 250 });
    doc.text('Qty', 310, tableTop, { width: 60, align: 'right' });
    doc.text('Unit Price', 380, tableTop, { width: 80, align: 'right' });
    doc.text('Amount', 470, tableTop, { width: 70, align: 'right' });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);

    for (const item of invoice.line_items) {
      const y = doc.y;
      doc.fontSize(9).font('Helvetica');
      doc.text(item.description, 50, y, { width: 250 });
      doc.text(String(item.quantity), 310, y, { width: 60, align: 'right' });
      doc.text(formatINR(item.unit_price), 380, y, { width: 80, align: 'right' });
      doc.text(formatINR(item.subtotal), 470, y, { width: 70, align: 'right' });
      doc.moveDown(0.5);
    }

    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);

    doc.fontSize(10).font('Helvetica').text('Subtotal', 380, doc.y, { width: 90, align: 'right' });
    doc.text(formatINR(invoice.subtotal), 470, doc.y, { width: 70, align: 'right' });
    doc.moveDown(0.3);
    doc.text(`GST (${invoice.tax_percent}%)`, 380, doc.y, { width: 90, align: 'right' });
    doc.text(formatINR(invoice.tax_amount), 470, doc.y, { width: 70, align: 'right' });
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').text('TOTAL', 380, doc.y, { width: 90, align: 'right' });
    doc.text(formatINR(invoice.total), 470, doc.y, { width: 70, align: 'right' });
    doc.moveDown(0.3);
    doc.fillColor('#c0392b').text('BALANCE DUE', 380, doc.y, { width: 90, align: 'right' });
    doc.text(formatINR(invoice.balance_due), 470, doc.y, { width: 70, align: 'right' });
    doc.fillColor('#000');

    doc.end();
  });
}
