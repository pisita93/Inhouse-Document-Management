# Audio + Video Upload Support + 200 MB Limit — Design

**Date:** 2026-06-18
**Status:** Approved (pending spec review)

## Problem

Users cannot upload audio or video files (notably iPhone `.m4a` voice memos and
`.mov` videos via Chrome). The app's upload pipeline accepts only PDF, JPG, and
PNG, enforced at three gates:

1. Client file picker `accept` attribute + extension check (`Dropzone.tsx`)
2. Server byte-sniff allow-list (`upload.ts` `ALLOWED_MIME`)
3. (No third rejection — serving is type-agnostic)

Separately, the 25 MB size cap is too small for longer recordings and video.

## Goals

- Allow common audio and video formats to be uploaded, stored, downloaded, and
  (where the browser supports it) played inline on the document detail page.
- Raise the max upload size from 25 MB to 200 MB.

## Non-Goals (YAGNI)

- No audio/video transcoding, waveform/thumbnail generation, or metadata
  extraction (duration/codec/artist/bitrate).
- No switch away from in-memory upload buffering (see Risks).
- No change to categories/tags/requires_financial behavior.

## Allowed Audio Formats

All byte-detectable by the installed `file-type` v19.6.0. The server's allow-list
is keyed on the **MIME the sniffer actually returns**, not the file extension.

| Format    | Detected MIME(s)                        | Inline playable? |
| --------- | --------------------------------------- | ---------------- |
| MP3       | `audio/mpeg`                            | Yes              |
| M4A / AAC | `audio/mp4`, `audio/x-m4a`, `audio/aac` | Yes              |
| WAV       | `audio/wav`                             | Yes              |
| OGG       | `audio/ogg`                             | Yes              |
| Opus      | `audio/ogg` (ext `opus`)                | Yes              |
| FLAC      | `audio/x-flac`                          | Yes              |
| AIFF      | `audio/aiff`                            | No → download    |
| WMA       | `audio/x-ms-asf`                        | No → download    |
| AMR       | `audio/amr`                             | No → download    |

## Allowed Video Formats

| Format       | Detected MIME(s)            | Inline playable? |
| ------------ | --------------------------- | ---------------- |
| MP4          | `video/mp4`                 | Yes              |
| M4V          | `video/x-m4v`               | Yes              |
| MOV (iPhone) | `video/quicktime`           | Yes (H.264 MOV)  |
| WebM         | `video/webm`                | Yes              |
| OGV          | `video/ogg`                 | Yes              |
| MPEG         | `video/mpeg`                | No → download    |
| AVI          | `video/vnd.avi`             | No → download    |
| MKV          | `video/x-matroska`          | No → download    |
| FLV          | `video/x-flv`               | No → download    |
| 3GP          | `video/3gpp`, `video/3gpp2` | No → download    |
| TS           | `video/mp2t`                | No → download    |
| WMV          | `video/x-ms-asf`            | No → download    |

**ASF ambiguity resolved:** `file-type` returns `audio/x-ms-asf` for WMA and
`video/x-ms-asf` for WMV based on the actual stream content, so the two are
distinguished by the sniffer. Both MIMEs are on the allow-list.

**MOV playback caveat:** `video/quicktime` plays inline when the codec is H.264;
otherwise the browser's own `<video>` element surfaces an unsupported-codec
state. Acceptable — no special handling.

## Changes

### 1. `server/src/middleware/upload.ts`

- `MAX_FILE_SIZE = 200 * 1024 * 1024` (was 25 MB).
- Extend `ALLOWED_MIME` with the audio MIMEs:
  `audio/mpeg`, `audio/mp4`, `audio/x-m4a`, `audio/aac`, `audio/wav`,
  `audio/ogg`, `audio/x-flac`, `audio/aiff`, `audio/x-ms-asf`, `audio/amr`;
  and the video MIMEs:
  `video/mp4`, `video/x-m4v`, `video/quicktime`, `video/webm`, `video/ogg`,
  `video/mpeg`, `video/vnd.avi`, `video/x-matroska`, `video/x-flv`,
  `video/3gpp`, `video/3gpp2`, `video/mp2t`, `video/x-ms-asf`.
- **Drop the hand-maintained `EXT_BY_MIME` table.** Return `file-type`'s own
  `detected.ext` instead. It already yields the correct extension for the
  existing types (`pdf`, `jpg`, `png`) and removes a maintenance burden for the
  new audio/video types.
- Update the 415 message to reflect the broader set (e.g. "File must be a
  document, image, audio, or video file").
- Update the `LIMIT_FILE_SIZE` (413) message: "File exceeds 200 MB".

### 2. `client/src/components/Dropzone.tsx`

- Extend `ALLOWED_EXT` with audio extensions:
  `.mp3, .m4a, .aac, .wav, .ogg, .oga, .opus, .flac, .aif, .aiff, .wma, .amr`;
  and video extensions:
  `.mp4, .m4v, .mov, .webm, .ogv, .mpg, .mpeg, .avi, .mkv, .flv, .3gp, .3g2, .ts, .wmv`.
- Update the `<input accept>` to include those extensions plus `audio/*` and
  `video/*` (helps iPhone Chrome's picker surface media files).
- Update user-facing copy ("PDF, JPG, PNG" / "receipt") to reflect that
  documents, images, audio, and video are accepted.
- Update the client reject message accordingly.

### 3. `client/src/components/DocumentPreview.tsx`

- Add `PLAYABLE_AUDIO_TYPES`: `audio/mpeg`, `audio/mp4`, `audio/x-m4a`,
  `audio/aac`, `audio/wav`, `audio/ogg`, `audio/x-flac`.
- Add `PLAYABLE_VIDEO_TYPES`: `video/mp4`, `video/x-m4v`, `video/quicktime`,
  `video/webm`, `video/ogg`.
- For a playable audio MIME, render `<audio controls src={inlineSrc}>`.
- For a playable video MIME, render `<video controls src={inlineSrc}>`.
- For any other audio/video MIME (the download-only rows above), render a
  download link fallback rather than `null`.
- Image and PDF branches unchanged. Existing SVG-exclusion comment/logic
  untouched.

### 4. Serving — no change

`server/src/routes/documents.ts:157` already sets `Content-Type` from the stored
`mimeType` and supports `?inline=1` for inline disposition, so audio/video
playback and download work without modification.

## Testing (TDD)

- **`upload.ts` unit tests:** `sniffOrThrow` accepts minimal valid MP3 / M4A /
  WAV / MP4 byte samples and returns the correct `{ mime, ext }`; still rejects a
  non-media/non-document buffer (e.g. plain text) with 415. Use small binary
  fixtures (minimal valid headers or tiny real samples).
- **`Dropzone.test.tsx`:** accepts `.m4a` and `.mp4`; still rejects a disallowed
  extension (e.g. `.exe`).
- **`DocumentPreview.test.tsx`:** renders `<audio>` for `audio/mpeg`, `<video>`
  for `video/mp4`, and a download fallback (neither element) for
  `video/x-matroska`.
- Maintain ≥80% coverage on changed units.

## Risks

- **In-memory buffering at 200 MB (accepted — Option A):** the server uses
  `multer.memoryStorage()`, so each upload is held fully in RAM and sniffed as a
  whole buffer. Adding video makes 200 MB uploads the common case rather than the
  exception, so a few concurrent uploads could exhaust Node's heap and OOM the
  process. Accepted for now given low expected concurrency. If concurrent large
  uploads become common, migrate to `multer.diskStorage()` with chunked sniffing
  (deferred, out of scope here).
