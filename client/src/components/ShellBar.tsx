import { Link } from 'react-router-dom';

export function ShellBar() {
  return (
    <header className="fi-shellbar">
      <Link to="/" className="fi-shellbar__brand" style={{ color: 'white' }}>
        Inhouse DMS
      </Link>
      <span className="fi-shellbar__avatar" aria-hidden>
        PS
      </span>
    </header>
  );
}
