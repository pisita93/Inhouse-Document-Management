import { useRef, useState } from 'react';

const ALLOWED_EXT = ['.pdf', '.jpg', '.jpeg', '.png'];

export function Dropzone({ onFile }: { onFile: (file: File) => void }) {
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFiles(files: FileList | null) {
    setError(null);
    if (!files || files.length === 0) return;
    const file = files[0]!;
    const lower = file.name.toLowerCase();
    if (!ALLOWED_EXT.some((ext) => lower.endsWith(ext))) {
      setError('Only PDF, JPG, PNG accepted');
      return;
    }
    onFile(file);
  }

  return (
    <div>
      <div
        data-testid="dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: '2px dashed #aaa',
          borderRadius: 8,
          padding: 32,
          textAlign: 'center',
          background: '#fafafa',
          cursor: 'pointer',
        }}
      >
        <div style={{ fontSize: 28, opacity: 0.5 }}>📄</div>
        <p>Drag &amp; drop receipt here</p>
        <p style={{ fontSize: 13, opacity: 0.6 }}>or click to browse — PDF, JPG, PNG</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        style={{ display: 'none' }}
        onChange={(e) => handleFiles(e.target.files)}
      />
      {error && <p style={{ color: '#c00' }}>{error}</p>}
    </div>
  );
}
