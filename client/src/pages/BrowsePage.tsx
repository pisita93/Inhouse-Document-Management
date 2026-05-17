import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { SubBar } from '../components/SubBar.js';
import { TypeChip } from '../components/TypeChip.js';
import { FilterDrawer } from '../components/FilterDrawer.js';
import { DOCUMENT_TYPES, type DocumentDTO, type DocumentType } from '../types.js';

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

function FilterPanel(props: {
  q: string;
  setQ: (v: string) => void;
  type: DocumentType | '';
  setType: (v: DocumentType | '') => void;
  invoiceDateFrom: string;
  setInvoiceDateFrom: (v: string) => void;
  invoiceDateTo: string;
  setInvoiceDateTo: (v: string) => void;
  uploadDateFrom: string;
  setUploadDateFrom: (v: string) => void;
  uploadDateTo: string;
  setUploadDateTo: (v: string) => void;
}): ReactNode {
  return (
    <>
      <label htmlFor="filter-search">Search</label>
      <input
        id="filter-search"
        value={props.q}
        onChange={(e) => props.setQ(e.target.value)}
        style={{ width: '100%' }}
      />

      <label htmlFor="filter-type">Type</label>
      <select
        id="filter-type"
        value={props.type}
        onChange={(e) => props.setType(e.target.value as DocumentType | '')}
        style={{ width: '100%' }}
      >
        <option value="">All</option>
        {DOCUMENT_TYPES.map((t) => (
          <option key={t} value={t}>
            {TYPE_LABEL[t]}
          </option>
        ))}
      </select>

      <label htmlFor="filter-invoice-from">Invoice Date from</label>
      <input
        id="filter-invoice-from"
        type="date"
        value={props.invoiceDateFrom}
        onChange={(e) => props.setInvoiceDateFrom(e.target.value)}
        style={{ width: '100%' }}
      />
      <label htmlFor="filter-invoice-to">Invoice Date to</label>
      <input
        id="filter-invoice-to"
        type="date"
        value={props.invoiceDateTo}
        onChange={(e) => props.setInvoiceDateTo(e.target.value)}
        style={{ width: '100%' }}
      />

      <label htmlFor="filter-upload-from">Upload Date from</label>
      <input
        id="filter-upload-from"
        type="date"
        value={props.uploadDateFrom}
        onChange={(e) => props.setUploadDateFrom(e.target.value)}
        style={{ width: '100%' }}
      />
      <label htmlFor="filter-upload-to">Upload Date to</label>
      <input
        id="filter-upload-to"
        type="date"
        value={props.uploadDateTo}
        onChange={(e) => props.setUploadDateTo(e.target.value)}
        style={{ width: '100%' }}
      />
    </>
  );
}

export function BrowsePage() {
  const [q, setQ] = useState('');
  const [type, setType] = useState<DocumentType | ''>('');
  const [invoiceDateFrom, setInvoiceDateFrom] = useState('');
  const [invoiceDateTo, setInvoiceDateTo] = useState('');
  const [uploadDateFrom, setUploadDateFrom] = useState('');
  const [uploadDateTo, setUploadDateTo] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [items, setItems] = useState<DocumentDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .list({
        q: q || undefined,
        type: type || undefined,
        invoiceDateFrom: invoiceDateFrom || undefined,
        invoiceDateTo: invoiceDateTo || undefined,
        uploadDateFrom: uploadDateFrom || undefined,
        uploadDateTo: uploadDateTo || undefined,
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
  }, [q, type, invoiceDateFrom, invoiceDateTo, uploadDateFrom, uploadDateTo, page]);

  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  const filterProps = {
    q,
    setQ: (v: string) => {
      setQ(v);
      setPage(1);
    },
    type,
    setType: (v: DocumentType | '') => {
      setType(v);
      setPage(1);
    },
    invoiceDateFrom,
    setInvoiceDateFrom: (v: string) => {
      setInvoiceDateFrom(v);
      setPage(1);
    },
    invoiceDateTo,
    setInvoiceDateTo: (v: string) => {
      setInvoiceDateTo(v);
      setPage(1);
    },
    uploadDateFrom,
    setUploadDateFrom: (v: string) => {
      setUploadDateFrom(v);
      setPage(1);
    },
    uploadDateTo,
    setUploadDateTo: (v: string) => {
      setUploadDateTo(v);
      setPage(1);
    },
  };

  return (
    <>
      <SubBar
        title="Browse Documents"
        actions={
          <Link
            to="/"
            className="fi-primary"
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--fi-radius)',
              color: 'white',
              background: 'var(--fi-accent)',
            }}
          >
            + Upload
          </Link>
        }
      />
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
                <th>Invoice Date</th>
                <th>Upload Date</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id}>
                  <td>{d.documentName}</td>
                  <td>
                    <TypeChip type={d.type} />
                  </td>
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
