import { useEffect, useState, type ReactNode, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, categoriesApi, tagsApi } from '../api.js';
import { SubBar } from '../components/SubBar.js';
import { TypeChip } from '../components/TypeChip.js';
import { FilterDrawer } from '../components/FilterDrawer.js';
import {
  DOCUMENT_TYPES,
  type CategoryDTO,
  type DocumentDTO,
  type DocumentType,
  type TagDTO,
} from '../types.js';

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

interface FilterValues {
  q: string;
  type: DocumentType | '';
  categoryId: string;
  tagId: string;
  shortNote: string;
  invoiceDateFrom: string;
  invoiceDateTo: string;
  uploadDateFrom: string;
  uploadDateTo: string;
}

const EMPTY_FILTERS: FilterValues = {
  q: '',
  type: '',
  categoryId: '',
  tagId: '',
  shortNote: '',
  invoiceDateFrom: '',
  invoiceDateTo: '',
  uploadDateFrom: '',
  uploadDateTo: '',
};

interface FilterPanelProps {
  draft: FilterValues;
  setDraft: (v: FilterValues) => void;
  categories: CategoryDTO[];
  tags: TagDTO[];
  onApply: () => void;
  onReset: () => void;
}

function FilterPanel({
  draft,
  setDraft,
  categories,
  tags,
  onApply,
  onReset,
}: FilterPanelProps): ReactNode {
  const update = <K extends keyof FilterValues>(key: K, value: FilterValues[K]) =>
    setDraft({ ...draft, [key]: value });

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onApply();
  };

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="filter-search">Search</label>
      <input
        id="filter-search"
        value={draft.q}
        onChange={(e) => update('q', e.target.value)}
        style={{ width: '100%' }}
      />

      <label htmlFor="filter-type">Type</label>
      <select
        id="filter-type"
        value={draft.type}
        onChange={(e) => update('type', e.target.value as DocumentType | '')}
        style={{ width: '100%' }}
      >
        <option value="">All</option>
        {DOCUMENT_TYPES.map((t) => (
          <option key={t} value={t}>
            {TYPE_LABEL[t]}
          </option>
        ))}
      </select>

      <label htmlFor="filter-category">Category</label>
      <select
        id="filter-category"
        value={draft.categoryId}
        onChange={(e) => update('categoryId', e.target.value)}
        style={{ width: '100%' }}
      >
        <option value="">All</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <label htmlFor="filter-tag">Tag</label>
      <select
        id="filter-tag"
        value={draft.tagId}
        onChange={(e) => update('tagId', e.target.value)}
        style={{ width: '100%' }}
      >
        <option value="">All</option>
        {tags.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>

      <label htmlFor="filter-short-note">Short Note</label>
      <input
        id="filter-short-note"
        value={draft.shortNote}
        onChange={(e) => update('shortNote', e.target.value)}
        placeholder="text or pattern with *"
        style={{ width: '100%' }}
      />

      <label htmlFor="filter-invoice-from">Invoice Date from</label>
      <input
        id="filter-invoice-from"
        type="date"
        value={draft.invoiceDateFrom}
        onChange={(e) => update('invoiceDateFrom', e.target.value)}
        style={{ width: '100%' }}
      />
      <label htmlFor="filter-invoice-to">Invoice Date to</label>
      <input
        id="filter-invoice-to"
        type="date"
        value={draft.invoiceDateTo}
        onChange={(e) => update('invoiceDateTo', e.target.value)}
        style={{ width: '100%' }}
      />

      <label htmlFor="filter-upload-from">Upload Date from</label>
      <input
        id="filter-upload-from"
        type="date"
        value={draft.uploadDateFrom}
        onChange={(e) => update('uploadDateFrom', e.target.value)}
        style={{ width: '100%' }}
      />
      <label htmlFor="filter-upload-to">Upload Date to</label>
      <input
        id="filter-upload-to"
        type="date"
        value={draft.uploadDateTo}
        onChange={(e) => update('uploadDateTo', e.target.value)}
        style={{ width: '100%' }}
      />

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button type="submit" className="fi-primary" style={{ flex: 1 }}>
          Apply
        </button>
        <button type="button" onClick={onReset}>
          Reset
        </button>
      </div>
    </form>
  );
}

export function BrowsePage() {
  const [draft, setDraft] = useState<FilterValues>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<FilterValues>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [items, setItems] = useState<DocumentDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [tags, setTags] = useState<TagDTO[]>([]);

  useEffect(() => {
    categoriesApi
      .list()
      .then((r) => setCategories(r.items))
      .catch(() => {});
    tagsApi
      .list()
      .then((r) => setTags(r.items))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .list({
        q: applied.q || undefined,
        type: applied.type || undefined,
        categoryId: applied.categoryId || undefined,
        tagId: applied.tagId || undefined,
        shortNote: applied.shortNote || undefined,
        invoiceDateFrom: applied.invoiceDateFrom || undefined,
        invoiceDateTo: applied.invoiceDateTo || undefined,
        uploadDateFrom: applied.uploadDateFrom || undefined,
        uploadDateTo: applied.uploadDateTo || undefined,
        page,
        pageSize,
      })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((err) => {
        if (cancelled) return;
        setError((err as { message: string }).message);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [applied, page]);

  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  const onApply = () => {
    setApplied(draft);
    setPage(1);
  };
  const onReset = () => {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(1);
  };

  const filterProps: FilterPanelProps = { draft, setDraft, categories, tags, onApply, onReset };

  return (
    <>
      <SubBar title="Browse Documents" />
      <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16 }}>
        <aside
          className="fi-sidebar"
          style={{
            background: 'var(--fi-surface)',
            border: '1px solid var(--fi-line)',
            borderRadius: 'var(--fi-radius)',
            padding: 12,
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: 13,
              textTransform: 'uppercase',
              color: 'var(--fi-ink-soft)',
            }}
          >
            Filter
          </h3>
          <FilterPanel {...filterProps} />
        </aside>
        <FilterDrawer>
          <FilterPanel {...filterProps} />
        </FilterDrawer>
        <section>
          <h3
            style={{
              margin: '0 0 12px',
              fontSize: 13,
              textTransform: 'uppercase',
              color: 'var(--fi-ink-soft)',
            }}
          >
            Documents ({total})
          </h3>
          {loading && <p>Loading…</p>}
          {error && <p style={{ color: '#c00' }}>{error}</p>}
          {!loading && items.length === 0 && (
            <p>
              No documents yet. <Link to="/">Upload one</Link>.
            </p>
          )}
          <table className="fi-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Short Note</th>
                <th>Invoice Date</th>
                <th>Upload Date</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id}>
                  <td>
                    {d.documentName}
                    {d.tags.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                        {d.tags.slice(0, 3).map((t) => (
                          <span key={t.id} className="fi-tag-chip">
                            {t.name}
                          </span>
                        ))}
                        {d.tags.length > 3 && (
                          <span className="fi-tag-chip fi-tag-chip--more">
                            +{d.tags.length - 3} more
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td>
                    <TypeChip type={d.type as DocumentType} />
                    {d.category && <span className="fi-category-badge">{d.category.name}</span>}
                  </td>
                  <td>{d.shortNote ?? '—'}</td>
                  <td>{d.invoiceDate ?? '—'}</td>
                  <td>{d.documentDate}</td>
                  <td style={{ textAlign: 'right' }}>
                    {d.amount != null && d.currency
                      ? `${(d.amount / 100).toFixed(2)} ${d.currency}`
                      : '—'}
                  </td>
                  <td>
                    <Link to={`/documents/${d.id}`}>View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Prev
            </button>
            <span>
              Page {page} / {lastPage}
            </span>
            <button disabled={page >= lastPage} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        </section>
      </div>
    </>
  );
}
