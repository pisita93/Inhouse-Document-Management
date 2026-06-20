import { describe, it, expect } from 'vitest';
import { makeTestEnv } from './helpers.js';

function dto(id: string, name: string) {
  return {
    id,
    documentName: name,
    type: 'other',
    documentDate: '2026-01-01',
    invoiceDate: null,
    amount: null,
    currency: null,
    shortNote: null,
    note: null,
    filename: `${id}.pdf`,
    originalName: 'x.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 10,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('multi-tag filtering', () => {
  it('AND returns only docs carrying every selected tag; OR returns the union', () => {
    const env = makeTestEnv();
    try {
      const a = env.repo.insertWithRelations({
        dto: dto('id1', 'Doc1'),
        categoryId: null,
        tagNames: ['alpha', 'beta'],
      });
      env.repo.insertWithRelations({
        dto: dto('id2', 'Doc2'),
        categoryId: null,
        tagNames: ['alpha'],
      });
      const alpha = a.tags.find((t) => t.name === 'alpha')!.id;
      const beta = a.tags.find((t) => t.name === 'beta')!.id;

      const and = env.repo.list({ tagIds: [alpha, beta], tagMatch: 'all', page: 1, pageSize: 20 });
      expect(and.items.map((d) => d.id)).toEqual(['id1']);

      const or = env.repo.list({ tagIds: [alpha, beta], tagMatch: 'any', page: 1, pageSize: 20 });
      expect(or.items.map((d) => d.id).sort()).toEqual(['id1', 'id2']);

      const single = env.repo.list({ tagIds: [beta], tagMatch: 'all', page: 1, pageSize: 20 });
      expect(single.items.map((d) => d.id)).toEqual(['id1']);
    } finally {
      env.cleanup();
    }
  });
});
