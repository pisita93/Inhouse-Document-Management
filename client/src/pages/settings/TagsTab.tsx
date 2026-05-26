import { useEffect, useState } from 'react';
import { tagsApi } from '../../api.js';
import type { TagDTO } from '../../types.js';

function errorText(e: unknown): string {
  const err = e as { code?: string; message?: string };
  return err.code ?? err.message ?? String(e);
}

export function TagsTab() {
  const [items, setItems] = useState<TagDTO[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const res = await tagsApi.list();
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
            <th>Usage</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((t) => (
            <TagRow key={t.id} item={t} onChange={reload} onError={setError} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface TagRowProps {
  item: TagDTO;
  onChange: () => Promise<void>;
  onError: (msg: string) => void;
}

function TagRow({ item, onChange, onError }: TagRowProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function save() {
    try {
      await tagsApi.rename(item.id, name);
      setEditing(false);
      await onChange();
    } catch (e) {
      onError(errorText(e));
    }
  }

  async function remove() {
    try {
      await tagsApi.remove(item.id);
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
      <td>{item.usageCount ?? 0}</td>
      <td>
        {editing ? (
          <>
            <button aria-label={`save ${item.id}`} onClick={save}>
              Save
            </button>
            <button
              aria-label={`cancel ${item.id}`}
              onClick={() => {
                setName(item.name);
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
