import type { ReactNode } from 'react';

interface SubBarProps {
  title: ReactNode;
  actions?: ReactNode;
}

export function SubBar({ title, actions }: SubBarProps) {
  return (
    <div className="fi-subbar">
      <span style={{ fontWeight: 600 }}>{title}</span>
      {actions && <div className="fi-subbar__actions">{actions}</div>}
    </div>
  );
}
