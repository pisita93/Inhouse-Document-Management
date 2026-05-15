import { describe, it, expect } from 'vitest';
import {
  RECEIPT_TYPES,
  CURRENCIES,
  ReceiptCreateSchema,
  ListQuerySchema,
} from './schemas.js';

describe('ReceiptCreateSchema', () => {
  const valid = {
    documentName: 'AWS January',
    type: 'invoice' as const,
    invoiceDate: '2026-01-15',
    amount: 12500,
    currency: 'THB' as const,
    note: 'monthly bill',
  };

  it('accepts a complete valid payload', () => {
    expect(() => ReceiptCreateSchema.parse(valid)).not.toThrow();
  });

  it('accepts payload without optional note', () => {
    const { note: _omit, ...rest } = valid;
    expect(() => ReceiptCreateSchema.parse(rest)).not.toThrow();
  });

  it('rejects unknown type', () => {
    expect(() => ReceiptCreateSchema.parse({ ...valid, type: 'bogus' })).toThrow();
  });

  it('rejects unknown currency', () => {
    expect(() => ReceiptCreateSchema.parse({ ...valid, currency: 'GBP' })).toThrow();
  });

  it('rejects non-ISO invoiceDate', () => {
    expect(() => ReceiptCreateSchema.parse({ ...valid, invoiceDate: '15/01/2026' })).toThrow();
  });

  it('rejects negative amount', () => {
    expect(() => ReceiptCreateSchema.parse({ ...valid, amount: -1 })).toThrow();
  });

  it('rejects non-integer amount', () => {
    expect(() => ReceiptCreateSchema.parse({ ...valid, amount: 1.5 })).toThrow();
  });

  it('rejects empty documentName', () => {
    expect(() => ReceiptCreateSchema.parse({ ...valid, documentName: '' })).toThrow();
  });
});

describe('ListQuerySchema', () => {
  it('accepts empty query (all optional)', () => {
    expect(() => ListQuerySchema.parse({})).not.toThrow();
  });

  it('defaults page=1 and pageSize=20', () => {
    const parsed = ListQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(20);
  });

  it('coerces page and pageSize from strings', () => {
    const parsed = ListQuerySchema.parse({ page: '3', pageSize: '50' });
    expect(parsed.page).toBe(3);
    expect(parsed.pageSize).toBe(50);
  });

  it('rejects pageSize > 100', () => {
    expect(() => ListQuerySchema.parse({ pageSize: '500' })).toThrow();
  });
});

describe('constants', () => {
  it('exposes all four receipt types', () => {
    expect(RECEIPT_TYPES).toEqual(['invoice', 'receipt', 'quotation', 'other']);
  });

  it('exposes all five currencies', () => {
    expect(CURRENCIES).toEqual(['THB', 'USD', 'EUR', 'JPY', 'CNY']);
  });
});
