import { useEffect, useRef, useState } from 'react';
import { tagsApi } from '../api.js';

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
}

export function TagChipInput({ value, onChange }: Props) {
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (input.trim().length === 0) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const { items } = await tagsApi.list(input);
        setSuggestions(items.map((t) => t.name).filter((n) => !value.includes(n)));
      } catch {
        // A failed lookup shouldn't break the input — the user can still type a fresh tag.
        setSuggestions([]);
      }
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [input, value]);

  function addChip(name: string) {
    const normalized = name.trim().toLowerCase();
    if (!normalized || value.includes(normalized)) return;
    onChange([...value, normalized]);
    setInput('');
    setSuggestions([]);
  }

  function removeChip(name: string) {
    onChange(value.filter((n) => n !== name));
  }

  return (
    <div className="tag-chip-input">
      {value.map((name) => (
        <span key={name} className="tag-chip">
          {name}
          <button type="button" aria-label={`Remove ${name}`} onClick={() => removeChip(name)}>
            ×
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && input.length > 0) {
            e.preventDefault();
            addChip(suggestions[0] ?? input);
          } else if (e.key === 'Backspace' && input.length === 0 && value.length > 0) {
            removeChip(value[value.length - 1]!);
          }
        }}
        placeholder="Add tag…"
      />
      {suggestions.length > 0 && (
        <ul role="listbox" className="tag-chip-input__suggestions">
          {suggestions.map((s) => (
            <li key={s} role="option">
              <button type="button" onClick={() => addChip(s)}>
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
