import { Link, NavLink } from 'react-router-dom';

export function ShellBar() {
  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `fi-shellbar__nav-link${isActive ? ' fi-shellbar__nav-link--active' : ''}`;

  return (
    <header className="fi-shellbar">
      <Link to="/" className="fi-shellbar__brand" style={{ color: 'white' }}>
        Inhouse DMS
      </Link>
      <nav className="fi-shellbar__nav" aria-label="Main">
        <NavLink to="/" end className={navLinkClass}>
          Upload
        </NavLink>
        <NavLink to="/browse" className={navLinkClass}>
          Browse
        </NavLink>
      </nav>
      <span className="fi-shellbar__avatar" aria-hidden>
        PS
      </span>
    </header>
  );
}
