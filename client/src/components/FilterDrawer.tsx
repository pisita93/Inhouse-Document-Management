import { useState, type ReactNode } from 'react';

interface FilterDrawerProps {
  children: ReactNode;
}

export function FilterDrawer({ children }: FilterDrawerProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open filters"
        style={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: 'var(--fi-accent)',
          color: 'white',
          border: 'none',
          fontSize: 20,
          zIndex: 100,
        }}
        className="fi-drawer-trigger"
      >
        ☰
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Filters"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 200,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 280,
              maxWidth: '85vw',
              background: 'var(--fi-surface)',
              padding: 16,
              overflowY: 'auto',
            }}
          >
            <button type="button" onClick={() => setOpen(false)} aria-label="Close filters">
              ✕
            </button>
            {children}
          </div>
        </div>
      )}
    </>
  );
}
