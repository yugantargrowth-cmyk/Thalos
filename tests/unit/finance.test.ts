import { describe, it, expect } from 'vitest';

// Pure calculation helpers — extracted for testability
function computeProposalTotals(
  lineItems: Array<{ description: string; quantity: number; unit_price: number }>,
  taxPercent: number
) {
  const items = lineItems.map(item => ({
    ...item,
    subtotal: parseFloat((item.quantity * item.unit_price).toFixed(2)),
  }));
  const subtotal = parseFloat(items.reduce((s, i) => s + i.subtotal, 0).toFixed(2));
  const taxAmount = parseFloat((subtotal * taxPercent / 100).toFixed(2));
  const total = parseFloat((subtotal + taxAmount).toFixed(2));
  return { items, subtotal, taxAmount, total };
}

describe('Finance — server-side total computation', () => {
  it('computes a single line item correctly at 18% GST', () => {
    const result = computeProposalTotals(
      [{ description: 'Website Development', quantity: 1, unit_price: 50000 }],
      18
    );
    expect(result.subtotal).toBe(50000);
    expect(result.taxAmount).toBe(9000);
    expect(result.total).toBe(59000);
  });

  it('computes multiple line items correctly', () => {
    const result = computeProposalTotals([
      { description: 'SEO', quantity: 3, unit_price: 10000 },
      { description: 'Social Media', quantity: 1, unit_price: 15000 },
    ], 18);
    expect(result.subtotal).toBe(45000);
    expect(result.taxAmount).toBe(8100);
    expect(result.total).toBe(53100);
  });

  it('handles fractional unit prices with correct rounding', () => {
    const result = computeProposalTotals(
      [{ description: 'Hourly work', quantity: 7, unit_price: 999.99 }],
      18
    );
    expect(result.subtotal).toBe(6999.93);
    expect(typeof result.taxAmount).toBe('number');
    expect(result.total).toBeCloseTo(result.subtotal + result.taxAmount, 2);
  });

  it('total equals subtotal + taxAmount within 2 paise tolerance', () => {
    const result = computeProposalTotals(
      [{ description: 'Service', quantity: 1, unit_price: 12345.67 }],
      18
    );
    expect(Math.abs(result.total - (result.subtotal + result.taxAmount))).toBeLessThan(0.02);
  });

  it('zero tax rate produces total equal to subtotal', () => {
    const result = computeProposalTotals(
      [{ description: 'Exempt service', quantity: 1, unit_price: 10000 }],
      0
    );
    expect(result.taxAmount).toBe(0);
    expect(result.total).toBe(result.subtotal);
  });
});

describe('Phone normalisation', () => {
  function normalisePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) return `+91${digits}`;
    if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
    if (digits.length === 13 && digits.startsWith('091')) return `+${digits.slice(1)}`;
    return phone.startsWith('+') ? phone : `+${digits}`;
  }

  it('normalises a 10-digit Indian number', () => {
    expect(normalisePhone('9876543210')).toBe('+919876543210');
  });

  it('normalises a 91-prefixed number', () => {
    expect(normalisePhone('919876543210')).toBe('+919876543210');
  });

  it('normalises a 091-prefixed number', () => {
    expect(normalisePhone('0919876543210')).toBe('+919876543210');
  });

  it('preserves already-normalised +91 number', () => {
    expect(normalisePhone('+919876543210')).toBe('+919876543210');
  });

  it('strips spaces and dashes', () => {
    expect(normalisePhone('98765 43210')).toBe('+919876543210');
    expect(normalisePhone('98765-43210')).toBe('+919876543210');
  });
});
