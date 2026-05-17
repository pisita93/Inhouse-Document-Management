import { Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { UploadPage } from './pages/UploadPage.js';
import { BrowsePage } from './pages/BrowsePage.js';
import { DocumentDetailPage } from './pages/DocumentDetailPage.js';
import { ShellBar } from './components/ShellBar.js';

export function App() {
  useEffect(() => {
    document.title = 'Inhouse DMS';
  }, []);

  return (
    <div>
      <ShellBar />
      <main>
        <Routes>
          <Route path="/" element={<UploadPage />} />
          <Route path="/browse" element={<BrowsePage />} />
          <Route path="/documents/:id" element={<DocumentDetailPage />} />
        </Routes>
      </main>
    </div>
  );
}
