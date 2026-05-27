import { describe, it, expect } from 'vitest';
import {
  DocumentCreateSchema,
  DocumentDTOSchema,
  ListQuerySchema,
  DOCUMENT_TYPES,
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

describe('DocumentCreateSchema (flat)', () => {
  it('accepts an invoice with full financial trio', () => {
    expect(() =>
      DocumentCreateSchema.parse({
        documentName: 'AWS Jan',
        type: 'invoice',
        invoiceDate: '2026-01-15',
        amount: 12500,
        currency: 'THB',
      }),
    ).not.toThrow();
  });

  it('accepts an invoice WITHOUT financial trio (server now enforces)', () => {
    const r = DocumentCreateSchema.safeParse({
      documentName: 'AWS Jan',
      type: 'invoice',
    });
    expect(r.success).toBe(true);
  });

  it('accepts a contract without financial fields', () => {
    expect(() =>
      DocumentCreateSchema.parse({ documentName: 'NDA 2026', type: 'contract' }),
    ).not.toThrow();
  });

  it('accepts categoryId and tagNames', () => {
    const r = DocumentCreateSchema.safeParse({
      documentName: 'Doc',
      type: 'other',
      categoryId: '11111111-1111-4111-8111-111111111111',
      tagNames: ['Finance', 'HR-2026'],
    });
    expect(r.success).toBe(true);
    expect(r.success && r.data.tagNames).toEqual(['finance', 'hr-2026']);
  });

  it('rejects an unknown shape via type regex', () => {
    const r = DocumentCreateSchema.safeParse({ documentName: 'x', type: 'Bad-Type' });
    expect(r.success).toBe(false);
  });

  it('strips any client-supplied documentDate', () => {
    const parsed = DocumentCreateSchema.parse({
      documentName: 'x',
      type: 'contract',
      documentDate: '2099-12-31',
    } as unknown as { documentName: string; type: string });
    expect((parsed as Record<string, unknown>).documentDate).toBeUndefined();
  });
});

describe('DocumentDTOSchema', () => {
  it('requires category (nullable) and tags (array) on DTO', () => {
    expect(() =>
      DocumentDTOSchema.parse({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        documentName: 'NDA',
        type: 'contract',
        category: null,
        tags: [],
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
