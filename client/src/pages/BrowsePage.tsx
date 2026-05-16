import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { RECEIPT_TYPES, type ReceiptDTO, type ReceiptType } from '../types.js';

export function BrowsePage() {
  const [q, setQ] = useState('');
  const [type, setType] = useState<ReceiptType | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [items, setItems] = useState<ReceiptDTO[]>([]);
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
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
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
  }, [q, type, dateFrom, dateTo, page]);

  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16 }}>
      <aside>
        <h3>Filter</h3>
        <label htmlFor="filter-search">Search</label>
        <input
          id="filter-search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <label htmlFor="filter-type">Type</label>
        <select
          id="filter-type"
          value={type}
          onChange={(e) => {
            setType(e.target.value as ReceiptType | '');
            setPage(1);
          }}
        >
          <option value="">All</option>
          {RECEIPT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <label htmlFor="filter-from">From</label>
        <input
          id="filter-from"
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            setPage(1);
          }}
        />
        <label htmlFor="filter-to">To</label>
        <input
          id="filter-to"
          type="date"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            setPage(1);
          }}
        />
      </aside>
      <section>
        <h3>Receipts ({total})</h3>
        {loading && <p>Loading…</p>}
        {error && <p style={{ color: '#c00' }}>{error}</p>}
        {!loading && items.length === 0 && (
          <p>
            No receipts yet. <Link to="/">Upload one</Link>.
          </p>
        )}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th align="left">Name</th>
              <th align="left">Type</th>
              <th align="left">Date</th>
              <th align="right">Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid #eee' }}>
                <td>{r.documentName}</td>
                <td>{r.type}</td>
                <td>{r.invoiceDate}</td>
                <td align="right">
                  {(r.amount / 100).toFixed(2)} {r.currency}
                </td>
                <td>
                  <Link to={`/receipts/${r.id}`}>View</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
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
  );
}
