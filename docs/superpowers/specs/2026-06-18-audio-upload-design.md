# Audio Upload Support + 200 MB Limit — Design

**Date:** 2026-06-18
**Status:** Approved (pending spec review)

## Problem

Users cannot upload audio files (notably iPhone `.m4a` voice memos via Chrome).
The app's upload pipeline accepts only PDF, JPG, and PNG, enforced at three
gates:

1. Client file picker `accept` attribute + extension check (`Dropzone.tsx`)
2. Server byte-sniff allow-list (`upload.ts` `ALLOWED_MIME`)
3. (No third rejection — serving is type-agnostic)

Separately, the 25 MB size cap is too small for longer recordings.

## Goals

- Allow common audio formats to be uploaded, stored, downloaded, and (where the
  browser supports it) played inline on the document detail page.
- Raise the max upload size from 25 MB to 200 MB.

## Non-Goals (YAGNI)

- No audio transcoding, waveform visualization, or metadata extraction
  (duration/artist/bitrate).
- No switch away from in-memory upload buffering (see Risks).
- No change to categories/tags/requires_financial behavior.

## Allowed Audio Formats

All nine are byte-detectable by the installed `file-type` v19.6.0. The server's
allow-list is keyed on the **MIME the sniffer actually returns**, not the file
extension.

| Format    | Detected MIME(s)                            | Inline playable? |
| --------- | ------------------------------------------- | ---------------- |
| MP3       | `audio/mpeg`                                | Yes              |
| M4A / AAC | `audio/mp4`, `audio/x-m4a`, `audio/aac`     | Yes              |
| WAV       | `audio/wav`                                 | Yes              |
| OGG       | `audio/ogg`                                 | Yes              |
| Opus      | `audio/ogg` (ext `opus`)                    | Yes              |
| FLAC      | `audio/x-flac`                              | Yes              |
| AIFF      | `audio/aiff`                                | No → download    |
| WMA       | `audio/x-ms-asf`                            | No → download    |
| AMR       | `audio/amr`                                 | No → download    |

**Decision — WMA kept despite ASF ambiguity:** `audio/x-ms-asf` is the ASF
container, shared by WMA audio and WMV video. Accepting it technically allows a
WMV file through the gate. Accepted as low risk for an internal tool.

## Changes

### 1. `server/src/middleware/upload.ts`

- `MAX_FILE_SIZE = 200 * 1024 * 1024` (was 25 MB).
- Extend `ALLOWED_MIME` with the audio MIMEs above:
  `audio/mpeg`, `audio/mp4`, `audio/x-m4a`, `audio/aac`, `audio/wav`,
  `audio/ogg`, `audio/x-flac`, `audio/aiff`, `audio/x-ms-asf`, `audio/amr`.
- **Drop the hand-maintained `EXT_BY_MIME` table.** Return `file-type`'s own
  `detected.ext` instead. It already yields the correct extension for the
  existing types (`pdf`, `jpg`, `png`) and removes a maintenance burden for the
  new audio types.
- Update the 415 message to mention audio (e.g. "File must be PDF, an image, or
  audio").
- Update the `LIMIT_FILE_SIZE` (413) message: "File exceeds 200 MB".

### 2. `client/src/components/Dropzone.tsx`

- Extend `ALLOWED_EXT` with audio extensions:
  `.mp3, .m4a, .aac, .wav, .ogg, .oga, .opus, .flac, .aif, .aiff, .wma, .amr`.
- Update the `<input accept>` to include those extensions plus `audio/*` (helps
  iPhone Chrome's picker surface audio files).
- Update user-facing copy ("PDF, JPG, PNG" / "receipt") to reflect that
  documents and audio are accepted.
- Update the client reject message accordingly.

### 3. `client/src/components/DocumentPreview.tsx`

- Add `PLAYABLE_AUDIO_TYPES` set: `audio/mpeg`, `audio/mp4`, `audio/x-m4a`,
  `audio/aac`, `audio/wav`, `audio/ogg`, `audio/x-flac`.
- For a playable audio MIME, render `<audio controls src={inlineSrc}>`.
- For a non-playable audio MIME (`audio/aiff`, `audio/x-ms-asf`, `audio/amr`),
  render a download link fallback rather than `null`.
- Image and PDF branches unchanged. Existing SVG-exclusion comment/logic
  untouched.

### 4. Serving — no change

`server/src/routes/documents.ts:157` already sets `Content-Type` from the stored
`mimeType` and supports `?inline=1` for inline disposition, so audio playback
and download work without modification.

## Testing (TDD)

- **`upload.ts` unit tests:** `sniffOrThrow` accepts minimal valid MP3 / M4A /
  WAV byte samples and returns the correct `{ mime, ext }`; still rejects a
  non-audio/non-document buffer (e.g. plain text) with 415. Use small binary
  fixtures (minimal valid headers or tiny real samples).
- **`Dropzone.test.tsx`:** accepts `.m4a`; still rejects a disallowed extension
  (e.g. `.exe`).
- **`DocumentPreview.test.tsx`:** renders an `<audio>` element for `audio/mpeg`;
  renders a download fallback (not `<audio>`) for `audio/x-ms-asf`.
- Maintain ≥80% coverage on changed units.

## Risks

- **In-memory buffering at 200 MB (accepted — Option A):** the server uses
  `multer.memoryStorage()`, so each upload is held fully in RAM and sniffed as a
  whole buffer. At 200 MB, several concurrent uploads could exhaust Node's heap
  and OOM the process. Accepted for now given low expected concurrency. If
  concurrent large uploads become common, migrate to `multer.diskStorage()` with
  chunked sniffing (deferred, out of scope here).
- **WMV-through-WMA:** see WMA decision above.
