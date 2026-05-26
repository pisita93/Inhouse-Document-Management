import { useEffect, useState } from 'react';
import { categoriesApi } from '../../api.js';
import type { CategoryDTO } from '../../types.js';

function errorText(e: unknown): string {
  const err = e as { code?: string; message?: string };
  return err.code ?? err.message ?? String(e);
}

export function CategoriesTab() {
  const [items, setItems] = useState<CategoryDTO[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function reload() {
    const res = await categoriesApi.list(true);
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
            <th>Name</th>
            <th>Sort</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <CategoryRow key={c.id} item={c} onChange={reload} onError={setError} />
          ))}
        </tbody>
      </table>
      <button onClick={() => setCreating(true)}>+ New</button>
      {creating && (
        <NewCategoryForm
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

interface CategoryRowProps {
  item: CategoryDTO;
  onChange: () => Promise<void>;
  onError: (msg: string) => void;
}

function CategoryRow({ item, onChange, onError }: CategoryRowProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [sortOrder, setSortOrder] = useState(item.sortOrder);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function resetEdits() {
    setName(item.name);
    setSortOrder(item.sortOrder);
  }

  async function save() {
    try {
      await categoriesApi.patch(item.id, { name, sortOrder });
      setEditing(false);
      await onChange();
    } catch (e) {
      onError(errorText(e));
    }
  }

  async function toggleDisabled() {
    try {
      await categoriesApi.patch(item.id, {
        disabledAt: item.disabledAt ? null : new Date().toISOString(),
      });
      await onChange();
    } catch (e) {
      onError(errorText(e));
    }
  }

  async function remove() {
    try {
      await categoriesApi.remove(item.id);
      await onChange();
    } catch (e) {
      onError(errorText(e));
    }
  }

  return (
    <tr>
      <td>
        {editing ? (
          <input
            aria-label={`name for ${item.id}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        ) : (
          item.name
        )}
      </td>
      <td>
        {editing ? (
          <input
            type="number"
            aria-label={`sort order for ${item.id}`}
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
          />
        ) : (
          item.sortOrder
        )}
      </td>
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
                resetEdits();
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
        {confirmingDelete ? (
          <>
            <button aria-label={`confirm delete ${item.id}`} onClick={remove}>
              Confirm
            </button>
            <button
              aria-label={`cancel delete ${item.id}`}
              onClick={() => setConfirmingDelete(false)}
            >
              Keep
            </button>
          </>
        ) : (
          <button aria-label={`delete ${item.id}`} onClick={() => setConfirmingDelete(true)}>
            Delete
          </button>
        )}
      </td>
    </tr>
  );
}

interface NewCategoryFormProps {
  onDone: () => void;
  onError: (msg: string) => void;
}

function NewCategoryForm({ onDone, onError }: NewCategoryFormProps) {
  const [name, setName] = useState('');
  const [sortOrder, setSortOrder] = useState(0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await categoriesApi.create({ name, sortOrder });
      onDone();
    } catch (err) {
      onError(errorText(err));
    }
  }

  return (
    <form onSubmit={submit} className="settings-tab__new-form">
      <input aria-label="new name" value={name} onChange={(e) => setName(e.target.value)} />
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
