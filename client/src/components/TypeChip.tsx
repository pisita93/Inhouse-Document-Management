import type { DocumentType } from '../types.js';

const TYPE_VARIANT: Record<DocumentType, string> = {
  invoice: 'fi-chip--accent',
  receipt: 'fi-chip--accent',
  quotation: 'fi-chip--accent',
  contract: 'fi-chip--ok',
  certificate: 'fi-chip--ok',
  policy: 'fi-chip--warn',
  hr_document: 'fi-chip--purple',
  meeting_minutes: '',
  report: '',
  other: '',
};

const TYPE_LABEL: Record<DocumentType, string> = {
  invoice: 'Invoice',
  receipt: 'Receipt',
  quotation: 'Quotation',
  contract: 'Contract',
  policy: 'Policy',
  hr_document: 'HR Document',
  meeting_minutes: 'Meeting Minutes',
  report: 'Report',
  certificate: 'Certificate',
  other: 'Other',
};

interface TypeChipProps {
  type: DocumentType;
}

export function TypeChip({ type }: TypeChipProps) {
  const variant = TYPE_VARIANT[type];
  const cls = ['fi-chip', variant].filter(Boolean).join(' ');
  return <span className={cls}>{TYPE_LABEL[type]}</span>;
}
