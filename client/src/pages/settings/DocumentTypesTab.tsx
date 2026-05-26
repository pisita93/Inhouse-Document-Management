import { useEffect, useState } from 'react';
import { documentTypesApi } from '../../api.js';
import type { DocumentTypeDTO } from '../../types.js';

function errorText(e: unknown): string {
  const err = e as { code?: string; message?: string };
  return err.code ?? err.message ?? String(e);
}

export function DocumentTypesTab() {
  const [items, setItems] = useState<DocumentTypeDTO[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function reload() {
    const res = await documentTypesApi.list(true);
    setItems(res.items);
  }

  useEffect(() => {
    reload().catch((e) => setError(errorText(e)));
  }, []);

  return (
    <div>
      {error && (
        <p role="alert" className="settings-tab__error">
          {error}
        </p>
      )}
      <table className="settings-tab__table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Label</th>
            <th>Requires Financial</th>
            <th>Sort</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((t) => (
            <TypeRow key={t.id} item={t} onChange={reload} onError={setError} />
          ))}
        </tbody>
      </table>
      <button onClick={() => setCreating(true)}>+ New</button>
      {creating && (
        <NewTypeForm
          onDone={() => {
            setCreating(false);
            reload().catch((e) => setError(errorText(e)));
          }}
          onError={setError}
        />
      )}
    </div>
  );
}

interface TypeRowProps {
  item: DocumentTypeDTO;
  onChange: () => Promise<void>;
  onError: (msg: string) => void;
}

function TypeRow({ item, onChange, onError }: TypeRowProps) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(item.label);

  async function save() {
    try {
      await documentTypesApi.patch(item.id, { label });
      setEditing(false);
      await onChange();
    } catch (e) {
      onError(errorText(e));
    }
  }

  async function toggleDisabled() {
    try {
      await documentTypesApi.patch(item.id, {
        disabledAt: item.disabledAt ? null : new Date().toISOString(),
      });
      await onChange();
    } catch (e) {
      onError(errorText(e));
    }
  }

  return (
    <tr>
      <td>{item.id}</td>
      <td>
        {editing ? (
          <input
            aria-label={`label for ${item.id}`}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        ) : (
          item.label
        )}
      </td>
      <td>
        <input
          type="checkbox"
          aria-label={`requires financial for ${item.id}`}
          title="Set at creation"
          checked={item.requiresFinancial}
          disabled
          readOnly
        />
      </td>
      <td>{item.sortOrder}</td>
      <td>{item.disabledAt ? 'Disabled' : 'Active'}</td>
      <td>
        {editing ? (
          <>
            <button aria-label={`save ${item.id}`} onClick={save}>
              Save
            </button>
            <button
              aria-label={`cancel ${item.id}`}
              onClick={() => {
                setLabel(item.label);
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </>
        ) : (
          <button aria-label={`edit ${item.id}`} onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
        <button
          aria-label={`${item.disabledAt ? 'enable' : 'disable'} ${item.id}`}
          onClick={toggleDisabled}
        >
          {item.disabledAt ? 'Enable' : 'Disable'}
        </button>
      </td>
    </tr>
  );
}

interface NewTypeFormProps {
  onDone: () => void;
  onError: (msg: string) => void;
}

function NewTypeForm({ onDone, onError }: NewTypeFormProps) {
  const [id, setId] = useState('');
  const [label, setLabel] = useState('');
  const [requiresFinancial, setRequiresFinancial] = useState(false);
  const [sortOrder, setSortOrder] = useState(0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await documentTypesApi.create({ id, label, requiresFinancial, sortOrder });
      onDone();
    } catch (err) {
      onError(errorText(err));
    }
  }

  return (
    <form onSubmit={submit} className="settings-tab__new-form">
      <input aria-label="new id" value={id} onChange={(e) => setId(e.target.value)} />
      <input aria-label="new label" value={label} onChange={(e) => setLabel(e.target.value)} />
      <label>
        <input
          type="checkbox"
          aria-label="requires financial"
          checked={requiresFinancial}
          onChange={(e) => setRequiresFinancial(e.target.checked)}
        />
        Requires Financial
      </label>
      <input
        type="number"
        aria-label="new sort order"
        value={sortOrder}
        onChange={(e) => setSortOrder(Number(e.target.value))}
      />
      <button type="submit">Create</button>
    </form>
  );
}
