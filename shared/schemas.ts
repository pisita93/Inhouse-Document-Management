import { z } from 'zod';

export const DOCUMENT_TYPES = [
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
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const CURRENCIES = ['THB', 'USD', 'EUR', 'JPY', 'CNY'] as const;
export type Currency = (typeof CURRENCIES)[number];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');

export const DocumentTypeIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,39}$/, 'snake_case, 1-40 chars');

export const TagNameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9][a-z0-9 _-]*$/, 'letters, digits, space, _, - only');

export const DocumentCreateSchema = z.object({
  documentName: z.string().min(1).max(200),
  type: DocumentTypeIdSchema,
  categoryId: z.string().uuid().nullish(),
  tagNames: z.array(TagNameSchema).max(20).optional(),
  invoiceDate: isoDate.optional(),
  amount: z.number().int().nonnegative().optional(),
  currency: z.enum(CURRENCIES).optional(),
  shortNote: z.string().max(30).optional(),
  note: z.string().max(2000).optional(),
});
export type DocumentCreate = z.infer<typeof DocumentCreateSchema>;

export const DocumentDTOSchema = z.object({
  id: z.string().uuid(),
  documentName: z.string(),
  type: DocumentTypeIdSchema,
  category: z.object({ id: z.string().uuid(), name: z.string() }).nullable(),
  tags: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
  documentDate: isoDate,
  invoiceDate: isoDate.nullable(),
  amount: z.number().int().nonnegative().nullable(),
  currency: z.enum(CURRENCIES).nullable(),
  shortNote: z.string().optional(),
  note: z.string().optional(),
  filename: z.string(),
  originalName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type DocumentDTO = z.infer<typeof DocumentDTOSchema>;

export const ListQuerySchema = z.object({
  type: z.enum(DOCUMENT_TYPES).optional(),
  categoryId: z.string().uuid().optional(),
  tagId: z.string().uuid().optional(),
  invoiceDateFrom: isoDate.optional(),
  invoiceDateTo: isoDate.optional(),
  uploadDateFrom: isoDate.optional(),
  uploadDateTo: isoDate.optional(),
  q: z.string().min(1).max(200).optional(),
  shortNote: z.string().min(1).max(60).optional(),
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

export const DocumentTypeLabelSchema = z.string().trim().min(1).max(60);

export const DocumentTypeDTOSchema = z.object({
  id: DocumentTypeIdSchema,
  label: DocumentTypeLabelSchema,
  requiresFinancial: z.boolean(),
  sortOrder: z.number().int(),
  disabledAt: z.string().nullable(),
  createdAt: z.string(),
});
export type DocumentTypeDTO = z.infer<typeof DocumentTypeDTOSchema>;

export const DocumentTypeCreateSchema = z.object({
  id: DocumentTypeIdSchema,
  label: DocumentTypeLabelSchema,
  requiresFinancial: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});
export type DocumentTypeCreate = z.infer<typeof DocumentTypeCreateSchema>;

export const DocumentTypePatchSchema = z
  .object({
    label: DocumentTypeLabelSchema.optional(),
    sortOrder: z.number().int().optional(),
    disabledAt: z.string().nullable().optional(),
    requiresFinancial: z.unknown().optional(),
  })
  .refine((v) => v.requiresFinancial === undefined, {
    message: 'requires_financial is immutable',
    path: ['requiresFinancial'],
  });
export type DocumentTypePatch = z.infer<typeof DocumentTypePatchSchema>;

export const CategoryNameSchema = z.string().trim().min(1).max(60);

export const CategoryDTOSchema = z.object({
  id: z.string().uuid(),
  name: CategoryNameSchema,
  sortOrder: z.number().int(),
  disabledAt: z.string().nullable(),
  createdAt: z.string(),
});
export type CategoryDTO = z.infer<typeof CategoryDTOSchema>;

export const CategoryCreateSchema = z.object({
  name: CategoryNameSchema,
  sortOrder: z.number().int().default(0),
});
export type CategoryCreate = z.infer<typeof CategoryCreateSchema>;

export const CategoryPatchSchema = z.object({
  name: CategoryNameSchema.optional(),
  sortOrder: z.number().int().optional(),
  disabledAt: z.string().nullable().optional(),
});
export type CategoryPatch = z.infer<typeof CategoryPatchSchema>;

export const TagDTOSchema = z.object({
  id: z.string().uuid(),
  name: TagNameSchema,
  createdAt: z.string(),
});
export type TagDTO = z.infer<typeof TagDTOSchema>;

export const TagCreateSchema = z.object({ name: TagNameSchema });
export type TagCreate = z.infer<typeof TagCreateSchema>;

export const TagPatchSchema = z.object({ name: TagNameSchema });
export type TagPatch = z.infer<typeof TagPatchSchema>;

/** @deprecated Use the runtime document_types lookup; this is removed in Task 12. */
export const REQUIRES_FINANCIALS = new Set<DocumentType>(['invoice', 'receipt']);

/** @deprecated Use the runtime document_types lookup; this is removed in Task 12. */
export function requiresFinancials(type: DocumentType): boolean {
  return REQUIRES_FINANCIALS.has(type);
}
