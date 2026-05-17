import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { SubBar } from '../components/SubBar.js';
import { TypeChip } from '../components/TypeChip.js';
import { requiresFinancials, type DocumentDTO } from '../types.js';

export function DocumentDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [dto, setDto] = useState<DocumentDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getById(id)
      .then((d) => !cancelled && setDto(d))
      .catch((e) => !cancelled && setError((e as { message: string }).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function onDelete() {
    if (!confirm('Delete this document? This cannot be undone.')) return;
    try {
      await api.remove(id);
      navigate('/browse');
    } catch (e) {
      setError((e as { message: string }).message);
    }
  }

  if (loading) return <p style={{ padding: 16 }}>Loading…</p>;
  if (error)
    return (
      <p style={{ padding: 16, color: '#c00' }}>
        {error} (<Link to="/browse">back</Link>)
      </p>
    );
  if (!dto) return null;

  const showFinancials = requiresFinancials(dto.type);

  return (
    <>
      <SubBar
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Link to="/browse">Browse</Link>
            <span>/</span>
            <span>{dto.documentName}</span>
          </span>
        }
      />
      <div
        style={{
          padding: 16,
          maxWidth: 720,
          margin: '24px auto',
          background: 'var(--fi-surface)',
          border: '1px solid var(--fi-line)',
          borderRadius: 'var(--fi-radius)',
        }}
      >
        <h2 style={{ marginTop: 0 }}>
          {dto.documentName} <TypeChip type={dto.type} />
        </h2>
        <dl>
          <dt>Type</dt>
          <dd>{dto.type}</dd>
          <dt>Document Date</dt>
          <dd>{dto.documentDate}</dd>
          {showFinancials && (
            <>
              <dt>Invoice Date</dt>
              <dd>{dto.invoiceDate}</dd>
              <dt>Amount</dt>
              <dd>
                {dto.amount != null && dto.currency
                  ? `${(dto.amount / 100).toFixed(2)} ${dto.currency}`
                  : '—'}
              </dd>
            </>
          )}
          {dto.note && (
            <>
              <dt>Note</dt>
              <dd>{dto.note}</dd>
            </>
          )}
          <dt>Original file</dt>
          <dd>
            {dto.originalName} ({Math.round(dto.sizeBytes / 1024)} KB)
          </dd>
          <dt>Uploaded</dt>
          <dd>{new Date(dto.createdAt).toLocaleString()}</dd>
        </dl>
        <div style={{ display: 'flex', gap: 12 }}>
          <a href={api.fileUrl(dto.id)}>Download original</a>
          <button onClick={onDelete} style={{ color: '#c00' }}>
            Delete
          </button>
          <Link to="/browse">Back to list</Link>
        </div>
      </div>
    </>
  );
}
