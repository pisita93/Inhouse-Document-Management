import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dropzone } from '../components/Dropzone.js';
import { api } from '../api.js';
import { RECEIPT_TYPES, CURRENCIES, type ReceiptCreate } from '../types.js';

const todayISO = () => new Date().toISOString().slice(0, 10);

export function UploadPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    documentName: '',
    type: 'invoice' as (typeof RECEIPT_TYPES)[number],
    invoiceDate: todayISO(),
    amountMajor: '',
    currency: 'THB' as (typeof CURRENCIES)[number],
    note: '',
  });

  function update<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((s) => ({ ...s, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    setFieldErrors({});
    if (!file) {
      setServerError('Please choose a file');
      return;
    }
    const amountNum = Number(form.amountMajor);
    if (!Number.isFinite(amountNum) || amountNum < 0) {
      setFieldErrors({ amountMajor: 'Must be a positive number' });
      return;
    }
    const meta: ReceiptCreate = {
      documentName: form.documentName,
      type: form.type,
      invoiceDate: form.invoiceDate,
      amount: Math.round(amountNum * 100),
      currency: form.currency,
      note: form.note || undefined,
    };
    setSubmitting(true);
    try {
      const dto = await api.upload(file, meta);
      navigate(`/receipts/${dto.id}`);
    } catch (err) {
      const e = err as { code?: string; message?: string; fields?: Record<string, string> };
      if (e.fields) setFieldErrors(e.fields);
      setServerError(e.message ?? 'Upload failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ maxWidth: 600, margin: '24px auto', padding: 16 }}>
      <h2>Upload Receipt</h2>

      {file ? (
        <div style={{ padding: 12, background: '#eef', borderRadius: 6 }}>
          Selected: <strong>{file.name}</strong>{' '}
          <button type="button" onClick={() => setFile(null)}>
            Change
          </button>
        </div>
      ) : (
        <Dropzone onFile={setFile} />
      )}

      <label htmlFor="upload-document-name">Document Name</label>
      <input
        id="upload-document-name"
        value={form.documentName}
        onChange={(e) => update('documentName', e.target.value)}
        required
        style={{ width: '100%' }}
      />
      {fieldErrors.documentName && <p style={{ color: '#c00' }}>{fieldErrors.documentName}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label htmlFor="upload-type">Type</label>
          <select
            id="upload-type"
            value={form.type}
            onChange={(e) => update('type', e.target.value as typeof form.type)}
          >
            {RECEIPT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="upload-invoice-date">Invoice Date</label>
          <input
            id="upload-invoice-date"
            type="date"
            value={form.invoiceDate}
            onChange={(e) => update('invoiceDate', e.target.value)}
            required
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
        <div>
          <label htmlFor="upload-amount">Amount</label>
          <input
            id="upload-amount"
            value={form.amountMajor}
            onChange={(e) => update('amountMajor', e.target.value)}
            placeholder="0.00"
            required
          />
          {fieldErrors.amountMajor && <p style={{ color: '#c00' }}>{fieldErrors.amountMajor}</p>}
        </div>
        <div>
          <label htmlFor="upload-currency">Currency</label>
          <select
            id="upload-currency"
            value={form.currency}
            onChange={(e) => update('currency', e.target.value as typeof form.currency)}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label htmlFor="upload-note">Additional Note</label>
      <textarea
        id="upload-note"
        value={form.note}
        onChange={(e) => update('note', e.target.value)}
        rows={3}
        style={{ width: '100%' }}
      />

      {serverError && <p style={{ color: '#c00' }}>{serverError}</p>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 12 }}>
        <button type="button" onClick={() => navigate('/browse')}>
          Cancel
        </button>
        <button type="submit" disabled={submitting || !file}>
          {submitting ? 'Uploading…' : 'Upload to NAS'}
        </button>
      </div>
    </form>
  );
}
