import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import type { ReceiptDTO } from '../types.js';

export function ReceiptDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [dto, setDto] = useState<ReceiptDTO | null>(null);
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
    if (!confirm('Delete this receipt? This cannot be undone.')) return;
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

  return (
    <div style={{ padding: 16, maxWidth: 720 }}>
      <h2>{dto.documentName}</h2>
      <dl>
        <dt>Type</dt>
        <dd>{dto.type}</dd>
        <dt>Invoice date</dt>
        <dd>{dto.invoiceDate}</dd>
        <dt>Amount</dt>
        <dd>
          {(dto.amount / 100).toFixed(2)} {dto.currency}
        </dd>
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
  );
}
