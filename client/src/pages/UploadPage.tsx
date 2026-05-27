import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dropzone } from '../components/Dropzone.js';
import { SubBar } from '../components/SubBar.js';
import { TagChipInput } from '../components/TagChipInput.js';
import { api, categoriesApi, documentTypesApi } from '../api.js';
import {
  CURRENCIES,
  type CategoryDTO,
  type Currency,
  type DocumentCreate,
  type DocumentTypeDTO,
} from '../types.js';

const todayISO = () => new Date().toISOString().slice(0, 10);

function errorText(e: unknown): string {
  const err = e as { message?: string };
  return err.message ?? 'Request failed';
}

export function UploadPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [types, setTypes] = useState<DocumentTypeDTO[]>([]);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [tagNames, setTagNames] = useState<string[]>([]);
  const [form, setForm] = useState({
    documentName: '',
    type: '',
    categoryId: '',
    invoiceDate: todayISO(),
    amountMajor: '',
    currency: 'THB' as Currency,
    shortNote: '',
    note: '',
  });

  useEffect(() => {
    documentTypesApi
      .list()
      .then((r) => {
        setTypes(r.items);
        setForm((s) => (s.type ? s : { ...s, type: r.items[0]?.id ?? '' }));
      })
      .catch((e) => setServerError(errorText(e)));
    categoriesApi
      .list()
      .then((r) => setCategories(r.items))
      .catch((e) => setServerError(errorText(e)));
  }, []);

  const selectedType = types.find((t) => t.id === form.type);
  const showFinancials = selectedType?.requiresFinancial ?? false;

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

    const meta: DocumentCreate = {
      documentName: form.documentName,
      type: form.type,
      categoryId: form.categoryId || null,
      tagNames,
      shortNote: form.shortNote || undefined,
      note: form.note || undefined,
    };

    if (showFinancials) {
      const amountNum = Number(form.amountMajor);
      if (!Number.isFinite(amountNum) || amountNum < 0) {
        setFieldErrors({ amountMajor: 'Must be a positive number' });
        return;
      }
      meta.invoiceDate = form.invoiceDate;
      meta.amount = Math.round(amountNum * 100);
      meta.currency = form.currency;
    }

    setSubmitting(true);
    try {
      const dto = await api.upload(file, meta);
      navigate(`/documents/${dto.id}`);
    } catch (err) {
      const e = err as { code?: string; message?: string; fields?: Record<string, string> };
      if (e.fields) setFieldErrors(e.fields);
      setServerError(e.message ?? 'Upload failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <SubBar title="Upload Document" />
      <form
        onSubmit={onSubmit}
        style={{
          maxWidth: 720,
          margin: '24px auto',
          padding: 16,
          background: 'var(--fi-surface)',
          border: '1px solid var(--fi-line)',
          borderRadius: 'var(--fi-radius)',
        }}
      >
        {file ? (
          <div
            style={{
              padding: 12,
              background: 'var(--fi-accent-dim)',
              borderRadius: 'var(--fi-radius)',
            }}
          >
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

        <label htmlFor="upload-type">Type</label>
        <select
          id="upload-type"
          value={form.type}
          onChange={(e) => update('type', e.target.value)}
          style={{ width: '100%' }}
        >
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>

        <label htmlFor="upload-category">Category</label>
        <select
          id="upload-category"
          value={form.categoryId}
          onChange={(e) => update('categoryId', e.target.value)}
          style={{ width: '100%' }}
        >
          <option value="">— None —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        {showFinancials && (
          <div className="fi-financial-group">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 12,
                marginTop: 12,
              }}
            >
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
              <div>
                <label htmlFor="upload-amount">Amount</label>
                <input
                  id="upload-amount"
                  value={form.amountMajor}
                  onChange={(e) => update('amountMajor', e.target.value)}
                  placeholder="0.00"
                  required
                />
                {fieldErrors.amountMajor && (
                  <p style={{ color: '#c00' }}>{fieldErrors.amountMajor}</p>
                )}
              </div>
              <div>
                <label htmlFor="upload-currency">Currency</label>
                <select
                  id="upload-currency"
                  value={form.currency}
                  onChange={(e) => update('currency', e.target.value as Currency)}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        <label>Tags</label>
        <TagChipInput value={tagNames} onChange={setTagNames} />

        <label htmlFor="upload-short-note">Short Note</label>
        <input
          id="upload-short-note"
          value={form.shortNote}
          onChange={(e) => update('shortNote', e.target.value.slice(0, 30))}
          maxLength={30}
          placeholder="Up to 30 characters"
          style={{ width: '100%' }}
        />
        {fieldErrors.shortNote && <p style={{ color: '#c00' }}>{fieldErrors.shortNote}</p>}

        <label htmlFor="upload-note">Note</label>
        <textarea
          id="upload-note"
          value={form.note}
          onChange={(e) => update('note', e.target.value)}
          rows={3}
          style={{ width: '100%' }}
        />

        {serverError && <p style={{ color: '#c00' }}>{serverError}</p>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 16 }}>
          <button type="button" onClick={() => navigate('/browse')}>
            Cancel
          </button>
          <button className="fi-primary" type="submit" disabled={submitting || !file}>
            {submitting ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </form>
    </>
  );
}
