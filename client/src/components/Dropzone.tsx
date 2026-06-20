import { useRef, useState } from 'react';

const ALLOWED_EXT = [
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.txt',
  // audio
  '.mp3',
  '.m4a',
  '.aac',
  '.wav',
  '.ogg',
  '.oga',
  '.opus',
  '.flac',
  '.aif',
  '.aiff',
  '.wma',
  '.amr',
  // video
  '.mp4',
  '.m4v',
  '.mov',
  '.webm',
  '.ogv',
  '.mpg',
  '.mpeg',
  '.avi',
  '.mkv',
  '.flv',
  '.3gp',
  '.3g2',
  '.ts',
  '.wmv',
];

export function Dropzone({ onFile }: { onFile: (file: File) => void }) {
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFiles(files: FileList | null) {
    setError(null);
    if (!files || files.length === 0) return;
    const file = files[0]!;
    const lower = file.name.toLowerCase();
    if (!ALLOWED_EXT.some((ext) => lower.endsWith(ext))) {
      setError('Unsupported file type');
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
        <p>Drag &amp; drop a file here</p>
        <p style={{ fontSize: 13, opacity: 0.6 }}>
          or click to browse — documents, images, audio, video
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        // List every extension explicitly (plus wildcards for desktop). iOS greys out
        // audio/video files when accept relies on bare audio/*/video/* wildcards, so the
        // explicit extensions in ALLOWED_EXT are what keep .m4a/.wav/.mov selectable there.
        accept={[...ALLOWED_EXT, 'image/*', 'audio/*', 'video/*', 'application/pdf'].join(',')}
        style={{ display: 'none' }}
        onChange={(e) => handleFiles(e.target.files)}
      />
      {error && <p style={{ color: '#c00' }}>{error}</p>}
    </div>
  );
}
