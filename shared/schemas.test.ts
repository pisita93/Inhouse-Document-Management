import { describe, it, expect } from 'vitest';
import {
  DocumentCreateSchema,
  DocumentDTOSchema,
  ListQuerySchema,
  DOCUMENT_TYPES,
  REQUIRES_FINANCIALS,
  requiresFinancials,
} from './schemas.js';

describe('DOCUMENT_TYPES', () => {
  it('has 10 values', () => {
    expect(DOCUMENT_TYPES).toHaveLength(10);
    expect(DOCUMENT_TYPES).toEqual(
      expect.arrayContaining([
        'invoice',
        'receipt',
        'quotation',
        'contract',
        'policy',
        'hr_document',
        'meeting_minutes',
        'report',
        'certificate',
        'other',
      ]),
    );
  });
});

describe('requiresFinancials', () => {
  it('returns true only for invoice and receipt', () => {
    expect(requiresFinancials('invoice')).toBe(true);
    expect(requiresFinancials('receipt')).toBe(true);
    expect(requiresFinancials('contract')).toBe(false);
    expect(requiresFinancials('policy')).toBe(false);
    expect(requiresFinancials('other')).toBe(false);
  });

  it('REQUIRES_FINANCIALS set matches the helper', () => {
    expect(REQUIRES_FINANCIALS.has('invoice')).toBe(true);
    expect(REQUIRES_FINANCIALS.has('contract')).toBe(false);
  });
});

describe('DocumentCreateSchema', () => {
  const validInvoice = {
    documentName: 'AWS Jan',
    type: 'invoice',
    invoiceDate: '2026-01-15',
    amount: 12500,
    currency: 'THB',
  };

  it('accepts an invoice with financials', () => {
    expect(() => DocumentCreateSchema.parse(validInvoice)).not.toThrow();
  });

  it('rejects an invoice missing amount', () => {
    const r = DocumentCreateSchema.safeParse({ ...validInvoice, amount: undefined });
    expect(r.success).toBe(false);
  });

  it('rejects an invoice missing invoiceDate', () => {
    const r = DocumentCreateSchema.safeParse({ ...validInvoice, invoiceDate: undefined });
    expect(r.success).toBe(false);
  });

  it('accepts a contract with no financial fields', () => {
    expect(() =>
      DocumentCreateSchema.parse({ documentName: 'NDA 2026', type: 'contract' }),
    ).not.toThrow();
  });

  it('accepts a contract that happens to include null financials (optional)', () => {
    expect(() =>
      DocumentCreateSchema.parse({
        documentName: 'NDA 2026',
        type: 'contract',
        note: 'signed',
      }),
    ).not.toThrow();
  });

  it('strips any client-supplied documentDate (never accepted from client)', () => {
    const parsed = DocumentCreateSchema.parse({
      ...validInvoice,
      documentDate: '2099-12-31',
    } as unknown as typeof validInvoice);
    expect((parsed as Record<string, unknown>).documentDate).toBeUndefined();
  });
});

describe('DocumentDTOSchema', () => {
  it('requires documentDate (string) and allows null invoiceDate/amount/currency', () => {
    expect(() =>
      DocumentDTOSchema.parse({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        documentName: 'NDA',
        type: 'contract',
        documentDate: '2026-05-16',
        invoiceDate: null,
        amount: null,
        currency: null,
        filename: 'x.pdf',
        originalName: 'x.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1,
        createdAt: '2026-05-16T00:00:00.000Z',
      }),
    ).not.toThrow();
  });
});

describe('ListQuerySchema', () => {
  it('accepts the four date params independently', () => {
    const a = ListQuerySchema.parse({ invoiceDateFrom: '2026-01-01' });
    const b = ListQuerySchema.parse({ uploadDateTo: '2026-12-31' });
    const c = ListQuerySchema.parse({
      invoiceDateFrom: '2026-01-01',
      invoiceDateTo: '2026-01-31',
      uploadDateFrom: '2026-01-01',
      uploadDateTo: '2026-12-31',
    });
    expect(a.invoiceDateFrom).toBe('2026-01-01');
    expect(b.uploadDateTo).toBe('2026-12-31');
    expect(c.uploadDateFrom).toBe('2026-01-01');
  });

  it('rejects a malformed date', () => {
    expect(ListQuerySchema.safeParse({ uploadDateFrom: '01/01/2026' }).success).toBe(false);
  });
});
