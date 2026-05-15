import { Routes, Route, NavLink } from 'react-router-dom';

function Placeholder({ name }: { name: string }) {
  return <div style={{ padding: 16 }}>{name} (not yet implemented)</div>;
}

export function App() {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ padding: 12, borderBottom: '1px solid #ddd', display: 'flex', gap: 16 }}>
        <strong>Receipts</strong>
        <NavLink to="/">Upload</NavLink>
        <NavLink to="/browse">Browse</NavLink>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Placeholder name="Upload" />} />
          <Route path="/browse" element={<Placeholder name="Browse" />} />
          <Route path="/receipts/:id" element={<Placeholder name="Detail" />} />
        </Routes>
      </main>
    </div>
  );
}
