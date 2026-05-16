import { Routes, Route, NavLink } from 'react-router-dom';
import { UploadPage } from './pages/UploadPage.js';
import { BrowsePage } from './pages/BrowsePage.js';

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
          <Route path="/" element={<UploadPage />} />
          <Route path="/browse" element={<BrowsePage />} />
          <Route path="/receipts/:id" element={<Placeholder name="Detail" />} />
        </Routes>
      </main>
    </div>
  );
}
