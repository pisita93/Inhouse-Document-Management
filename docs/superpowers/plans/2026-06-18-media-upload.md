# Audio + Video Upload Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow common audio and video files (up to 200 MB) to be uploaded, stored, downloaded, and played inline, alongside the existing PDF/JPG/PNG support.

**Architecture:** Three independent gates change. The server byte-sniff allow-list (`upload.ts`) gains the audio/video MIME types and the size limit rises to 200 MB; the client `Dropzone` gains the matching extensions and `accept` hints; `DocumentPreview` gains `<audio>`/`<video>` players for browser-playable types with a download-link fallback for the rest. File serving is already type-agnostic and unchanged.

**Tech Stack:** TypeScript, Express, multer, `file-type` v19.6.0 (byte-sniffing), React 18, Vitest + Testing Library, supertest.

## Global Constraints

- Server is the source of truth for accepted types: enforced by `file-type` byte-sniff in `server/src/middleware/upload.ts`. Allow-list is keyed on the **MIME the sniffer returns**, never the file extension.
- Max upload size: `200 * 1024 * 1024` bytes (200 MB).
- Keep `multer.memoryStorage()` (Option A — accepted in spec; do not switch to disk storage).
- Prettier config: `semi=true, singleQuote=true, trailingComma=all, printWidth=100, tabWidth=2`. Run `npm run format` on touched files before committing.
- ESM imports use `.js` extensions even from `.ts`/`.tsx` sources (existing convention).
- Test command: `npm test` (vitest run). Single file: `npx vitest run <path>`.
- Spec: `docs/superpowers/specs/2026-06-18-media-upload-design.md`.

### Audio MIMEs to allow

`audio/mpeg`, `audio/mp4`, `audio/x-m4a`, `audio/aac`, `audio/wav`, `audio/ogg`, `audio/x-flac`, `audio/aiff`, `audio/x-ms-asf`, `audio/amr`

### Video MIMEs to allow

`video/mp4`, `video/x-m4v`, `video/quicktime`, `video/webm`, `video/ogg`, `video/mpeg`, `video/vnd.avi`, `video/x-matroska`, `video/x-flv`, `video/3gpp`, `video/3gpp2`, `video/mp2t`, `video/x-ms-asf`

### Browser-playable (inline) subsets

- Audio: `audio/mpeg`, `audio/mp4`, `audio/x-m4a`, `audio/aac`, `audio/wav`, `audio/ogg`, `audio/x-flac`
- Video: `video/mp4`, `video/x-m4v`, `video/quicktime`, `video/webm`, `video/ogg`

---

## File Structure

- `server/src/middleware/upload.ts` — MODIFY: size limit, `ALLOWED_MIME`, drop `EXT_BY_MIME`, error copy.
- `server/test/helpers.ts` — MODIFY: add media byte fixtures to `fixtures`.
- `server/test/sniff.test.ts` — CREATE: unit tests for `sniffOrThrow`.
- `server/test/upload.test.ts` — MODIFY: integration tests for an audio + a video upload.
- `client/src/components/Dropzone.tsx` — MODIFY: extensions, `accept`, copy, reject message.
- `client/src/components/Dropzone.test.tsx` — MODIFY: accept `.m4a`/`.mp4`, keep `.exe` reject.
- `client/src/components/DocumentPreview.tsx` — MODIFY: audio/video branches + fallback.
- `client/src/components/DocumentPreview.test.tsx` — MODIFY: audio/video/fallback cases.
- `client/src/components/document-preview.css` — MODIFY: audio/video sizing.

---

## Task 1: Server media allow-list, 200 MB limit, ext from sniffer

**Files:**

- Modify: `server/src/middleware/upload.ts`
- Modify: `server/test/helpers.ts`
- Create: `server/test/sniff.test.ts`
- Modify: `server/test/upload.test.ts`

**Interfaces:**

- Consumes: `fileTypeFromBuffer` from `file-type`; `ApiError` from `./errorHandler.js`.
- Produces:
  - `ALLOWED_MIME: Set<string>` — now includes all audio/video MIMEs above plus the existing `application/pdf`, `image/jpeg`, `image/png`.
  - `MAX_FILE_SIZE = 200 * 1024 * 1024`.
  - `sniffOrThrow(buf: Buffer): Promise<{ mime: string; ext: string }>` — unchanged signature; `ext` now comes from `file-type`'s `detected.ext`. (`EXT_BY_MIME` is removed.)
  - `server/test/helpers.ts` `fixtures` object gains `WAV_MIN`, `MP3_MIN`, `M4A_MIN`, `MP4_MIN: Buffer` (alongside existing `PNG_1x1`, `PDF_MIN`).

- [ ] **Step 1: Add media byte fixtures to the test helper**

In `server/test/helpers.ts`, add these constants next to the existing `PNG_1x1` / `PDF_MIN` definitions. These are minimal headers `file-type` v19.6.0 detects by magic bytes.

```ts
// Minimal RIFF/WAVE header → file-type detects audio/wav.
const WAV_MIN = Buffer.from(
  '52494646' +
    '24000000' +
    '57415645' +
    '666d7420' +
    '10000000' +
    '01000100' +
    '44ac0000' +
    '10b10200' +
    '04001000' +
    '64617461' +
    '00000000',
  'hex',
);

// MPEG-1 Layer III frame sync (0xFFFB) → file-type detects audio/mpeg.
const MP3_MIN = Buffer.from('fffb90640000000000000000000000000000', 'hex');

// ISO-BMFF ftyp box, brand 'M4A ' → file-type detects audio/x-m4a.
const M4A_MIN = Buffer.from(
  '00000020' +
    '66747970' +
    '4d344120' +
    '00000200' +
    '4d344120' +
    '6d703432' +
    '69736f6d' +
    '00000000',
  'hex',
);

// ISO-BMFF ftyp box, brand 'isom' → file-type detects video/mp4.
const MP4_MIN = Buffer.from(
  '00000020' +
    '66747970' +
    '69736f6d' +
    '00000200' +
    '69736f6d' +
    '69736f32' +
    '6d703431' +
    '00000000',
  'hex',
);
```

Then extend the returned `fixtures` object:

```ts
    fixtures: { PNG_1x1, PDF_MIN, WAV_MIN, MP3_MIN, M4A_MIN, MP4_MIN },
```

- [ ] **Step 2: Verify the fixtures actually sniff as expected**

Run this one-liner to confirm the magic bytes are correct before relying on them:

```bash
node --input-type=module -e "
import { fileTypeFromBuffer } from 'file-type';
const F = {
  WAV: '524946462400000057415645666d7420100000000100010044ac000010b10200040010006461746100000000',
  MP3: 'fffb90640000000000000000000000000000',
  M4A: '00000020667479704d34412000000200' + '4d3441206d70343269736f6d00000000',
  MP4: '000000206674797069736f6d00000200' + '69736f6d69736f326d70343100000000',
};
for (const [k,v] of Object.entries(F)) console.log(k, await fileTypeFromBuffer(Buffer.from(v,'hex')));
"
```

Expected (mime is what matters; ext may vary):

```
WAV { ext: 'wav', mime: 'audio/wav' }
MP3 { ext: 'mp3', mime: 'audio/mpeg' }
M4A { ext: 'm4a', mime: 'audio/x-m4a' }
MP4 { ext: 'mp4', mime: 'video/mp4' }
```

If any returns `undefined` or a different MIME, the fixture hex is wrong — fix the hex in `helpers.ts` to a known-good header for that container before proceeding. (Use the exact hex from Step 1 in `helpers.ts`; the inline strings above are only for the throwaway check.)

- [ ] **Step 3: Write the failing unit test for `sniffOrThrow`**

Create `server/test/sniff.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sniffOrThrow } from '../src/middleware/upload.js';
import { makeTestEnv } from './helpers.js';

describe('sniffOrThrow', () => {
  const env = makeTestEnv();
  const { WAV_MIN, MP3_MIN, M4A_MIN, MP4_MIN, PDF_MIN } = env.fixtures;
  env.cleanup();

  it('accepts WAV audio and returns its ext', async () => {
    const r = await sniffOrThrow(WAV_MIN);
    expect(r.mime).toBe('audio/wav');
    expect(r.ext).toBe('wav');
  });

  it('accepts MP3 audio', async () => {
    const r = await sniffOrThrow(MP3_MIN);
    expect(r.mime).toBe('audio/mpeg');
    expect(r.ext).toBe('mp3');
  });

  it('accepts M4A audio', async () => {
    const r = await sniffOrThrow(M4A_MIN);
    expect(r.mime).toBe('audio/x-m4a');
  });

  it('accepts MP4 video', async () => {
    const r = await sniffOrThrow(MP4_MIN);
    expect(r.mime).toBe('video/mp4');
    expect(r.ext).toBe('mp4');
  });

  it('still accepts PDF', async () => {
    const r = await sniffOrThrow(PDF_MIN);
    expect(r.mime).toBe('application/pdf');
    expect(r.ext).toBe('pdf');
  });

  it('rejects an undetectable buffer with a 415 ApiError', async () => {
    await expect(sniffOrThrow(Buffer.from('not a real file'))).rejects.toMatchObject({
      status: 415,
    });
  });
});
```

- [ ] **Step 4: Run the new test to verify it fails**

Run: `npx vitest run server/test/sniff.test.ts`
Expected: FAIL — the audio/video assertions throw because `ALLOWED_MIME` does not yet include those MIMEs (415 raised).

- [ ] **Step 5: Implement the allow-list, size limit, and ext change**

Replace the contents of `server/src/middleware/upload.ts` with:

```ts
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import { ApiError } from './errorHandler.js';

export const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200 MB

const DOCUMENT_MIME = ['application/pdf', 'image/jpeg', 'image/png'];

const AUDIO_MIME = [
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/wav',
  'audio/ogg',
  'audio/x-flac',
  'audio/aiff',
  'audio/x-ms-asf',
  'audio/amr',
];

const VIDEO_MIME = [
  'video/mp4',
  'video/x-m4v',
  'video/quicktime',
  'video/webm',
  'video/ogg',
  'video/mpeg',
  'video/vnd.avi',
  'video/x-matroska',
  'video/x-flv',
  'video/3gpp',
  'video/3gpp2',
  'video/mp2t',
  'video/x-ms-asf',
];

export const ALLOWED_MIME = new Set([...DOCUMENT_MIME, ...AUDIO_MIME, ...VIDEO_MIME]);

export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
}).single('file');

export async function sniffOrThrow(buf: Buffer): Promise<{ mime: string; ext: string }> {
  const detected = await fileTypeFromBuffer(buf);
  if (!detected || !ALLOWED_MIME.has(detected.mime)) {
    throw new ApiError(
      415,
      'UNSUPPORTED_MEDIA_TYPE',
      'File must be a document (PDF/JPG/PNG), audio, or video file',
    );
  }
  return { mime: detected.mime, ext: detected.ext };
}

export function multerErrorAsApiError(err: unknown): ApiError | null {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return new ApiError(413, 'FILE_TOO_LARGE', 'File exceeds 200 MB');
    }
    return new ApiError(400, 'VALIDATION', err.message);
  }
  return null;
}
```

- [ ] **Step 6: Run the unit test to verify it passes**

Run: `npx vitest run server/test/sniff.test.ts`
Expected: PASS (all 6 cases).

- [ ] **Step 7: Add integration tests for audio + video upload**

In `server/test/upload.test.ts`, add these two tests inside the `describe('POST /api/documents')` block (after the existing `'uploads contract → 201...'` test):

```ts
it('uploads an audio file (WAV) → 201 and stores it', async () => {
  const res = await request(env.app)
    .post('/api/documents')
    .field('metadata', JSON.stringify(validContract))
    .attach('file', env.fixtures.WAV_MIN, 'memo.wav');
  expect(res.status).toBe(201);
  expect(res.body.mimeType).toBe('audio/wav');
  expect(res.body.filename).toMatch(/\.wav$/);
});

it('uploads a video file (MP4) → 201 and stores it', async () => {
  const res = await request(env.app)
    .post('/api/documents')
    .field('metadata', JSON.stringify(validContract))
    .attach('file', env.fixtures.MP4_MIN, 'clip.mp4');
  expect(res.status).toBe(201);
  expect(res.body.mimeType).toBe('video/mp4');
  expect(res.body.filename).toMatch(/\.mp4$/);
});
```

- [ ] **Step 8: Run the full server test suite**

Run: `npx vitest run server/test`
Expected: PASS — new audio/video integration tests green; the existing `'rejects file that fails byte-sniff'` and atomicity tests still pass (garbage is still undetectable → 415).

- [ ] **Step 9: Typecheck and format**

Run: `npm run typecheck`
Expected: no errors (confirms no lingering reference to the removed `EXT_BY_MIME`).
Run: `npm run format`

- [ ] **Step 10: Commit**

```bash
git add server/src/middleware/upload.ts server/test/helpers.ts server/test/sniff.test.ts server/test/upload.test.ts
git commit -m "feat(server): accept audio/video uploads and raise limit to 200 MB"
```

---

## Task 2: Client Dropzone — extensions, accept hints, copy

**Files:**

- Modify: `client/src/components/Dropzone.tsx`
- Modify: `client/src/components/Dropzone.test.tsx`

**Interfaces:**

- Consumes: nothing new.
- Produces: `Dropzone` now accepts media extensions client-side; reject message text changes to "Unsupported file type".

- [ ] **Step 1: Update the failing tests**

In `client/src/components/Dropzone.test.tsx`, replace the `'rejects files with disallowed extensions'` test and add accept cases:

```ts
  it('accepts an audio file (.m4a)', () => {
    const onFile = vi.fn();
    render(<Dropzone onFile={onFile} />);
    const file = new File(['x'], 'memo.m4a', { type: 'audio/mp4' });
    fireEvent.drop(screen.getByTestId('dropzone'), { dataTransfer: { files: [file] } });
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it('accepts a video file (.mp4)', () => {
    const onFile = vi.fn();
    render(<Dropzone onFile={onFile} />);
    const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' });
    fireEvent.drop(screen.getByTestId('dropzone'), { dataTransfer: { files: [file] } });
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it('rejects files with disallowed extensions', () => {
    const onFile = vi.fn();
    render(<Dropzone onFile={onFile} />);
    const file = new File(['x'], 'a.exe', { type: 'application/x-msdownload' });
    fireEvent.drop(screen.getByTestId('dropzone'), { dataTransfer: { files: [file] } });
    expect(onFile).not.toHaveBeenCalled();
    expect(screen.getByText(/Unsupported file type/i)).toBeTruthy();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run client/src/components/Dropzone.test.tsx`
Expected: FAIL — `.m4a`/`.mp4` are rejected by the current `ALLOWED_EXT`, and the reject message still reads "Only PDF, JPG, PNG".

- [ ] **Step 3: Update the Dropzone component**

In `client/src/components/Dropzone.tsx`:

Replace the `ALLOWED_EXT` constant (line 3):

```ts
const ALLOWED_EXT = [
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
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
```

Update the reject message (currently `setError('Only PDF, JPG, PNG accepted');`):

```ts
setError('Unsupported file type');
```

Update the prompt copy paragraph (currently `or click to browse — PDF, JPG, PNG`):

```tsx
<p style={{ fontSize: 13, opacity: 0.6 }}>or click to browse — documents, images, audio, video</p>
```

Update the drop-prompt line (currently `Drag &amp; drop receipt here`):

```tsx
<p>Drag &amp; drop a file here</p>
```

Update the `<input accept>` attribute (currently `accept=".pdf,.jpg,.jpeg,.png"`):

```tsx
accept = '.pdf,.jpg,.jpeg,.png,audio/*,video/*';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run client/src/components/Dropzone.test.tsx`
Expected: PASS — including the still-present `'renders prompt text'` test (it matches `/Drag & drop/i`, still satisfied).

- [ ] **Step 5: Typecheck, format, commit**

```bash
npm run typecheck
npm run format
git add client/src/components/Dropzone.tsx client/src/components/Dropzone.test.tsx
git commit -m "feat(client): accept audio/video files in the upload dropzone"
```

---

## Task 3: DocumentPreview — inline audio/video players + fallback

**Files:**

- Modify: `client/src/components/DocumentPreview.tsx`
- Modify: `client/src/components/DocumentPreview.test.tsx`
- Modify: `client/src/components/document-preview.css`

**Interfaces:**

- Consumes: `api.fileUrl(id, { inline })` (existing); `DocumentDTO` (existing).
- Produces: `DocumentPreview` renders `<audio controls>` for playable audio MIMEs, `<video controls>` for playable video MIMEs, and a "no inline preview" download fallback for other audio/video MIMEs. Image/PDF/SVG behavior unchanged.

- [ ] **Step 1: Write the failing tests**

In `client/src/components/DocumentPreview.test.tsx`, add these cases inside the `describe('DocumentPreview')` block:

```ts
  it('renders an <audio> player for playable audio MIME types', () => {
    const { container } = render(
      <DocumentPreview doc={{ ...baseDoc, mimeType: 'audio/mpeg', originalName: 'memo.mp3' }} />,
    );
    const audio = container.querySelector('audio');
    expect(audio).not.toBeNull();
    expect(audio!.getAttribute('src')).toBe('/api/documents/doc-1/file?inline=1');
  });

  it('renders a <video> player for playable video MIME types', () => {
    const { container } = render(
      <DocumentPreview doc={{ ...baseDoc, mimeType: 'video/mp4', originalName: 'clip.mp4' }} />,
    );
    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(video!.getAttribute('src')).toBe('/api/documents/doc-1/file?inline=1');
  });

  it('renders a download fallback (no media element) for non-playable media types', () => {
    const { container } = render(
      <DocumentPreview doc={{ ...baseDoc, mimeType: 'video/x-matroska', originalName: 'v.mkv' }} />,
    );
    expect(container.querySelector('audio')).toBeNull();
    expect(container.querySelector('video')).toBeNull();
    const link = container.querySelector('a');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toBe('/api/documents/doc-1/file');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run client/src/components/DocumentPreview.test.tsx`
Expected: FAIL — the new MIME types currently fall through to `return null`, so no `<audio>`/`<video>`/`<a>` is found.

- [ ] **Step 3: Implement the audio/video branches**

Replace the contents of `client/src/components/DocumentPreview.tsx` with:

```tsx
import { api } from '../api.js';
import type { DocumentDTO } from '../types.js';
import './document-preview.css';

// Intentionally narrow allow-list. image/svg+xml is excluded because SVG can carry <script>
// and inline rendering would execute it under the app's origin.
const PREVIEWABLE_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

const PLAYABLE_AUDIO_TYPES = new Set([
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/wav',
  'audio/ogg',
  'audio/x-flac',
]);

const PLAYABLE_VIDEO_TYPES = new Set([
  'video/mp4',
  'video/x-m4v',
  'video/quicktime',
  'video/webm',
  'video/ogg',
]);

const isMediaType = (mime: string): boolean =>
  mime.startsWith('audio/') || mime.startsWith('video/');

interface Props {
  doc: DocumentDTO;
}

export function DocumentPreview({ doc }: Props) {
  const inlineSrc = api.fileUrl(doc.id, { inline: true });

  if (PREVIEWABLE_IMAGE_TYPES.has(doc.mimeType)) {
    return (
      <div className="document-preview document-preview--image">
        <img src={inlineSrc} alt={doc.originalName} />
      </div>
    );
  }

  if (doc.mimeType === 'application/pdf') {
    return (
      <div className="document-preview document-preview--pdf">
        <iframe src={inlineSrc} title={doc.originalName || 'PDF preview'} />
      </div>
    );
  }

  if (PLAYABLE_AUDIO_TYPES.has(doc.mimeType)) {
    return (
      <div className="document-preview document-preview--audio">
        <audio controls src={inlineSrc}>
          {doc.originalName}
        </audio>
      </div>
    );
  }

  if (PLAYABLE_VIDEO_TYPES.has(doc.mimeType)) {
    return (
      <div className="document-preview document-preview--video">
        <video controls src={inlineSrc} />
      </div>
    );
  }

  if (isMediaType(doc.mimeType)) {
    return (
      <div className="document-preview document-preview--fallback">
        <p>No inline preview available for this file type.</p>
        <a href={api.fileUrl(doc.id)}>Download {doc.originalName || 'file'}</a>
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run client/src/components/DocumentPreview.test.tsx`
Expected: PASS — including the unchanged image/PDF/SVG/empty-name cases (the `.docx` and `.svg` cases still hit `return null`).

- [ ] **Step 5: Add CSS for the media elements**

Append to `client/src/components/document-preview.css`:

```css
.document-preview--audio audio {
  width: 100%;
}
.document-preview--video video {
  width: 100%;
  max-height: 80vh;
  display: block;
}
```

- [ ] **Step 6: Run the full test suite, typecheck, format**

Run: `npm test`
Expected: PASS (entire vitest suite).
Run: `npm run typecheck`
Expected: no errors.
Run: `npm run format`

- [ ] **Step 7: Commit**

```bash
git add client/src/components/DocumentPreview.tsx client/src/components/DocumentPreview.test.tsx client/src/components/document-preview.css
git commit -m "feat(client): inline audio/video players with download fallback"
```

---

## Final Verification

- [ ] **Step 1: Full suite + typecheck + format check**

```bash
npm test
npm run typecheck
npm run format:check
```

Expected: all pass.

- [ ] **Step 2: Manual smoke (optional but recommended)**

Start the app (`npm run dev:server` + `npm run dev:client`), upload a real `.m4a` and `.mp4`, confirm the detail page shows an audio/video player, and confirm an `.mkv` shows the download fallback.
