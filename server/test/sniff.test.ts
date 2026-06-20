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

  it('accepts a UTF-8 text file named .txt', async () => {
    const r = await sniffOrThrow(Buffer.from('hello, world\nsecond line'), 'notes.txt');
    expect(r.mime).toBe('text/plain');
    expect(r.ext).toBe('txt');
  });

  it('rejects a .txt-named file whose bytes are binary (NUL bytes)', async () => {
    await expect(
      sniffOrThrow(Buffer.from([0x00, 0x01, 0x02, 0xff]), 'evil.txt'),
    ).rejects.toMatchObject({ status: 415 });
  });

  it('rejects text content when the file is not named .txt', async () => {
    await expect(sniffOrThrow(Buffer.from('plain text'), 'foo.bin')).rejects.toMatchObject({
      status: 415,
    });
  });
});
