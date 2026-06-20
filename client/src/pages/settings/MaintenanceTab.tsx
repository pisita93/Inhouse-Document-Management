import { useState } from 'react';
import { maintenanceApi } from '../../api.js';

interface Report {
  scanned: number;
  removed: number;
  bytesFreed: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
}

export function MaintenanceTab() {
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      setReport(await maintenanceApi.sweepOrphans());
    } catch (e) {
      setError((e as { message: string }).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <h2>Maintenance</h2>
      <p>Remove files left on disk that no longer have a document record.</p>
      <button type="button" onClick={run} disabled={running}>
        {running ? 'Running…' : 'Run orphan-file cleanup'}
      </button>
      {report && (
        <p>
          Scanned {report.scanned} files, removed {report.removed} orphans (
          {formatBytes(report.bytesFreed)}).
        </p>
      )}
      {error && <p style={{ color: '#c00' }}>{error}</p>}
    </div>
  );
}
