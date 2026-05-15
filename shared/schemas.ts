import { z } from 'zod';

export const RECEIPT_TYPES = ['invoice', 'receipt', 'quotation', 'other'] as const;
export const CURRENCIES = ['THB', 'USD', 'EUR', 'JPY', 'CNY'] as const;

export type ReceiptType = (typeof RECEIPT_TYPES)[number];
export type Currency = (typeof CURRENCIES)[number];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');

export const ReceiptCreateSchema = z.object({
  documentName: z.string().min(1).max(200),
  type: z.enum(RECEIPT_TYPES),
  invoiceDate: isoDate,
  amount: z.number().int().nonnegative(),
  currency: z.enum(CURRENCIES),
  note: z.string().max(2000).optional(),
});
export type ReceiptCreate = z.infer<typeof ReceiptCreateSchema>;

export const ReceiptDTOSchema = ReceiptCreateSchema.extend({
  id: z.string().uuid(),
  filename: z.string(),
  originalName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type ReceiptDTO = z.infer<typeof ReceiptDTOSchema>;

export const ListQuerySchema = z.object({
  type: z.enum(RECEIPT_TYPES).optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  q: z.string().min(1).max(200).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type ListQuery = z.infer<typeof ListQuerySchema>;

export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    fields: z.record(z.string()).optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;
